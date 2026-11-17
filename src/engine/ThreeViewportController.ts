/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ANDROID_QUALITY_PROFILES } from '../core/PerformanceMonitor';
import type { ExplorerCameraMode, QualityTier, Vector3Like } from '../core/types';
import { groundHeightAt } from '../modules/world/luandaCoordinates';

const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _camPullRaycaster = new THREE.Raycaster();

export type PrendaCameraPresetId =
  | 'center'
  | 'lotes-1-6'
  | 'sul-d1-d2'
  | 'v4-comercial'
  | 'vista-aerea';

function detectSoftwareWebGL(): boolean {
  if (typeof document === 'undefined') return false;
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) ?? '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export interface ViewportFrameContext {
  readonly dt: number;
  readonly isSoftwareGl: boolean;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly targetPosition: Vector3Like;
}

export interface ViewportCallbacks {
  onFrame: (ctx: ViewportFrameContext) => void;
  onPointerLookDelta: (dx: number, dy: number) => void;
  onTapRay: (ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera) => void;
  resolveCollision: (x: number, z: number, radius: number) => { x: number; z: number };
  getCameraOcclusionMeshes: () => readonly THREE.Object3D[];
  onContextLost: () => void;
  onContextRestored: () => void;
}

export interface FirstPersonCameraContract {
  readonly supportedInPhase: string;
  readonly eyeOffsetMeters: number;
  readonly forwardOffsetMeters: number;
}

export const FIRST_PERSON_CAMERA_CONTRACT: FirstPersonCameraContract = {
  supportedInPhase: 'Fase 4+',
  eyeOffsetMeters: 1.68,
  forwardOffsetMeters: 0.14,
};

/**
 * Isolated Three.js WebGL2 Viewport Controller.
 * Implements software-WebGL pacing (afterDraw), RoomEnvironment PBR IBL,
 * ResizeObserver responsiveness, dual exploration cameras (third-person & free-inspect),
 * camera wall pull-in, and zero-GC damped motion.
 */
export class ThreeViewportController {
  readonly isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private lastTimestamp = 0;

  private cameraMode: ExplorerCameraMode = 'third-person';
  private orbitYaw = 0.72;
  private orbitPitch = 0.18;
  private orbitDistance = 4.6;
  private targetYaw = 0.72;
  private targetPitch = 0.18;
  private targetDistance = 4.6;

  private readonly focusTarget = new THREE.Vector3(-4, 1.46, 12);
  private readonly desiredTarget = new THREE.Vector3(-4, 1.46, 12);
  private readonly desiredCameraPos = new THREE.Vector3();

  private activeDragPointerId: number | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private lastPointerX = 0;
  private lastPointerY = 0;

  private qualityTier: QualityTier = 'medium';
  private tourAngle = 0.55;

  constructor(
    private readonly container: HTMLElement,
    private readonly scene: THREE.Scene,
    private readonly callbacks: ViewportCallbacks,
  ) {
    this.isSoftwareGl = detectSoftwareWebGL();
  }

  mount(initialTier: QualityTier): void {
    this.qualityTier = initialTier;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 240);

    const profile = ANDROID_QUALITY_PROFILES[initialTier];
    const renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && profile.antialias,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio),
    );
    renderer.shadowMap.enabled = !this.isSoftwareGl && profile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(width, height);

    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.className = 'touch-none-surface outline-none';
    renderer.domElement.setAttribute('data-testid', 'angola-virtual-canvas');

    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envScene = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(envScene, 0.04);
    this.scene.environment = envTarget.texture;
    envScene.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.3, 12000);
    this.camera = camera;
    if (document.body.dataset.state !== 'playing') {
      this.snapToTitleOverview();
    }
    this.updateCameraTransform(1, true);

    if (!this.isSoftwareGl) {
      renderer.compile(this.scene, camera);
    }

    this.bindEvents(renderer.domElement);
    this.lastTimestamp = performance.now();
    renderer.render(this.scene, camera);
    this.scheduleNextTick();
  }

  applyQualityTier(tier: QualityTier): void {
    this.qualityTier = tier;
    if (!this.renderer) return;
    const profile = ANDROID_QUALITY_PROFILES[tier];
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio),
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl && profile.shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;
    const width = Math.max(this.container.clientWidth, 320);
    const height = Math.max(this.container.clientHeight, 240);
    this.renderer.setSize(width, height);
    if (!this.contextLost && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setCameraMode(mode: ExplorerCameraMode, followAnchor?: Vector3Like): void {
    this.cameraMode = mode;
    if (mode === 'third-person') {
      if (followAnchor) {
        this.desiredTarget.set(followAnchor.x, followAnchor.y, followAnchor.z);
      } else {
        const groundY = groundHeightAt(this.desiredTarget.x, this.desiredTarget.z);
        const resolved = this.callbacks.resolveCollision(
          this.desiredTarget.x,
          this.desiredTarget.z,
          0.9,
        );
        this.desiredTarget.set(resolved.x, groundY + 1.46, resolved.z);
      }
      this.targetDistance = THREE.MathUtils.clamp(this.targetDistance, 2.8, 11.0);
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, -0.15, 0.55);
    } else {
      this.targetDistance = Math.max(26, this.targetDistance);
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, 0.18, 1.18);
      this.desiredTarget.y = Math.max(4, this.desiredTarget.y);
    }
  }

  getCameraMode(): ExplorerCameraMode {
    return this.cameraMode;
  }

  getOrbitYaw(): number {
    return this.orbitYaw;
  }

  setFollowTarget(x: number, y: number, z: number): void {
    if (this.cameraMode !== 'third-person') return;
    this.desiredTarget.set(x, y, z);
  }

  jumpToPreset(preset: PrendaCameraPresetId, followAnchor?: Vector3Like): void {
    switch (preset) {
      case 'center':
        this.cameraMode = 'third-person';
        if (followAnchor) {
          this.desiredTarget.set(followAnchor.x, followAnchor.y, followAnchor.z);
        } else {
          this.setGroundedTarget(-4, 12);
        }
        this.targetYaw = 0.72;
        this.targetPitch = 0.18;
        this.targetDistance = 4.6;
        break;
      case 'lotes-1-6':
        this.cameraMode = 'free-inspect';
        this.desiredTarget.set(22, 10, -28);
        this.targetYaw = 0.65;
        this.targetPitch = 0.36;
        this.targetDistance = 78;
        break;
      case 'sul-d1-d2':
        this.cameraMode = 'free-inspect';
        this.desiredTarget.set(-14, 9, 128);
        this.targetYaw = -0.52;
        this.targetPitch = 0.34;
        this.targetDistance = 74;
        break;
      case 'v4-comercial':
        this.cameraMode = 'third-person';
        if (followAnchor) {
          this.desiredTarget.set(followAnchor.x, followAnchor.y, followAnchor.z);
        } else {
          this.setGroundedTarget(-48, -14);
        }
        this.targetYaw = -1.1;
        this.targetPitch = 0.17;
        this.targetDistance = 4.8;
        break;
      case 'vista-aerea':
        this.cameraMode = 'free-inspect';
        this.desiredTarget.set(5, 8, 20);
        this.targetYaw = 0.55;
        this.targetPitch = 0.82;
        this.targetDistance = 148;
        break;
    }
  }

  private setGroundedTarget(x: number, z: number): void {
    const resolved = this.callbacks.resolveCollision(x, z, 0.6);
    this.desiredTarget.set(resolved.x, groundHeightAt(resolved.x, resolved.z) + 1.46, resolved.z);
  }

  snapToTitleOverview(): void {
    this.tourAngle = 0.55;
    this.orbitYaw = 0.55;
    this.targetYaw = 0.55;
    this.orbitPitch = 0.46;
    this.targetPitch = 0.46;
    this.orbitDistance = 96;
    this.targetDistance = 96;
    this.focusTarget.set(12, 8, -18);
    this.desiredTarget.set(12, 8, -18);
  }

  setOrbitInputs(
    moveX: number,
    moveY: number,
    sprint: boolean,
    isTitleMode: boolean,
    dt: number,
  ): void {
    if (isTitleMode) {
      this.tourAngle += dt * 0.085;
      this.targetYaw = this.tourAngle;
      this.targetPitch = 0.46;
      this.targetDistance = 96;
      this.desiredTarget.set(12, 8, -18);
      return;
    }

    if (this.cameraMode === 'free-inspect' && (Math.abs(moveX) > 0.01 || Math.abs(moveY) > 0.01)) {
      const baseSpeed = 24;
      const speed = sprint ? baseSpeed * 1.9 : baseSpeed;
      _forward.set(-Math.sin(this.orbitYaw), 0, -Math.cos(this.orbitYaw)).normalize();
      _right.set(Math.cos(this.orbitYaw), 0, -Math.sin(this.orbitYaw)).normalize();
      _move
        .set(0, 0, 0)
        .addScaledVector(_forward, moveY)
        .addScaledVector(_right, moveX);
      if (_move.lengthSq() > 1) _move.normalize();

      const nextX = THREE.MathUtils.clamp(this.desiredTarget.x + _move.x * speed * dt, -380, 380);
      const nextZ = THREE.MathUtils.clamp(this.desiredTarget.z + _move.z * speed * dt, -380, 380);
      this.desiredTarget.set(nextX, Math.max(4, this.desiredTarget.y), nextZ);
    }
  }

  resetCameraView(followAnchor?: Vector3Like, characterYaw?: number): void {
    this.cameraMode = 'third-person';
    if (followAnchor) {
      this.desiredTarget.set(followAnchor.x, followAnchor.y, followAnchor.z);
    } else {
      this.setGroundedTarget(-4, 12);
    }
    this.targetYaw = characterYaw !== undefined ? characterYaw + Math.PI : 0.72;
    this.targetPitch = 0.18;
    this.targetDistance = 4.6;
  }

  getCameraPose(): { position: Vector3Like; target: Vector3Like } {
    const pos = this.camera?.position;
    return {
      position: pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: 14, y: 7.5, z: 16 },
      target: {
        x: this.focusTarget.x,
        y: this.focusTarget.y,
        z: this.focusTarget.z,
      },
    };
  }

  private updateCameraTransform(dt: number, isTitleMode: boolean): void {
    if (!this.camera) return;
    const dampLambda = this.isSoftwareGl ? 18 : 8.5;
    this.orbitYaw = THREE.MathUtils.damp(this.orbitYaw, this.targetYaw, dampLambda, dt);
    this.orbitPitch = THREE.MathUtils.damp(this.orbitPitch, this.targetPitch, dampLambda, dt);
    this.orbitDistance = THREE.MathUtils.damp(
      this.orbitDistance,
      this.targetDistance,
      dampLambda,
      dt,
    );

    this.focusTarget.x = THREE.MathUtils.damp(
      this.focusTarget.x,
      this.desiredTarget.x,
      dampLambda,
      dt,
    );
    this.focusTarget.y = THREE.MathUtils.damp(
      this.focusTarget.y,
      this.desiredTarget.y,
      dampLambda,
      dt,
    );
    this.focusTarget.z = THREE.MathUtils.damp(
      this.focusTarget.z,
      this.desiredTarget.z,
      dampLambda,
      dt,
    );

    const cosPitch = Math.cos(this.orbitPitch);
    const offsetX = Math.sin(this.orbitYaw) * cosPitch * this.orbitDistance;
    const offsetY = Math.sin(this.orbitPitch) * this.orbitDistance;
    const offsetZ = Math.cos(this.orbitYaw) * cosPitch * this.orbitDistance;

    let finalDistScale = 1;
    // Camera raycast pull-in in third-person so orbiting beside a building never clips inside geometry
    if (!isTitleMode && this.cameraMode === 'third-person') {
      _rayDir.set(offsetX, offsetY, offsetZ);
      const fullLen = _rayDir.length();
      if (fullLen > 0.5) {
        _rayDir.divideScalar(fullLen);
        _camPullRaycaster.set(this.focusTarget, _rayDir);
        _camPullRaycaster.far = fullLen;
        const occluders = this.callbacks.getCameraOcclusionMeshes();
        if (occluders.length > 0) {
          const hits = _camPullRaycaster.intersectObjects(occluders as THREE.Object3D[], false);
          if (hits.length > 0 && hits[0].distance < fullLen) {
            finalDistScale = Math.max(0.28, (hits[0].distance - 0.65) / fullLen);
          }
        }
      }
    }

    const camX = this.focusTarget.x + offsetX * finalDistScale;
    const camZ = this.focusTarget.z + offsetZ * finalDistScale;
    const minGroundClear = groundHeightAt(camX, camZ) + (this.cameraMode === 'third-person' ? 0.65 : 1.1);

    this.desiredCameraPos.set(
      camX,
      Math.max(minGroundClear, this.focusTarget.y + offsetY * finalDistScale),
      camZ,
    );
    this.camera.position.copy(this.desiredCameraPos);
    this.camera.lookAt(this.focusTarget);
  }

  private scheduleNextTick(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => {
        if (!this.disposed) this.tick();
      });
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    if (!this.renderer) {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    if (!this.contextLost && this.renderer && this.camera) {
      const isTitle = document.body.dataset.state === 'title';
      this.updateCameraTransform(dt, isTitle);
      this.renderer.render(this.scene, this.camera);

      this.callbacks.onFrame({
        dt,
        isSoftwareGl: this.isSoftwareGl,
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometries: this.renderer.info.memory.geometries,
        textures: this.renderer.info.memory.textures,
        targetPosition: {
          x: this.focusTarget.x,
          y: this.focusTarget.y,
          z: this.focusTarget.z,
        },
      });
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private bindEvents(canvas: HTMLCanvasElement): void {
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.renderer || !this.camera) return;
      const w = Math.max(this.container.clientWidth, 320);
      const h = Math.max(this.container.clientHeight, 240);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (!this.contextLost) {
        this.renderer.render(this.scene, this.camera);
      }
    });
    this.resizeObserver.observe(this.container);

    canvas.addEventListener('pointerdown', this.handlePointerDown);
    canvas.addEventListener('pointermove', this.handlePointerMove);
    canvas.addEventListener('pointerup', this.handlePointerUp);
    canvas.addEventListener('pointercancel', this.handlePointerUp);
    canvas.addEventListener('wheel', this.handleWheel, { passive: true });
    canvas.addEventListener('webglcontextlost', this.handleContextLost);
    canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.activeDragPointerId !== null) return;
    this.activeDragPointerId = e.pointerId;
    this.pointerDownX = e.clientX;
    this.pointerDownY = e.clientY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (this.activeDragPointerId !== e.pointerId) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.targetYaw -= dx * 0.0055;
    const minPitch = this.cameraMode === 'third-person' ? -0.15 : 0.05;
    const maxPitch = this.cameraMode === 'third-person' ? 0.65 : 1.28;
    this.targetPitch = THREE.MathUtils.clamp(this.targetPitch + dy * 0.0045, minPitch, maxPitch);
    this.callbacks.onPointerLookDelta(dx, dy);
  };

  private handlePointerUp = (e: PointerEvent): void => {
    if (this.activeDragPointerId === e.pointerId) {
      const dragDist = Math.hypot(e.clientX - this.pointerDownX, e.clientY - this.pointerDownY);
      this.activeDragPointerId = null;
      if (dragDist < 6 && this.camera && this.renderer) {
        const rect = this.renderer.domElement.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
          this.callbacks.onTapRay(ndcX, ndcY, this.camera);
        }
      }
    }
  };

  private handleWheel = (e: WheelEvent): void => {
    const minD = this.cameraMode === 'third-person' ? 2.6 : 14;
    const maxD = this.cameraMode === 'third-person' ? 12.5 : 165;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + e.deltaY * 0.015, minD, maxD);
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.callbacks.onContextLost();
  };

  private handleContextRestored = (): void => {
    this.contextLost = false;
    this.callbacks.onContextRestored();
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.resizeObserver?.disconnect();

    if (this.renderer) {
      const canvas = this.renderer.domElement;
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
      canvas.removeEventListener('pointermove', this.handlePointerMove);
      canvas.removeEventListener('pointerup', this.handlePointerUp);
      canvas.removeEventListener('pointercancel', this.handlePointerUp);
      canvas.removeEventListener('wheel', this.handleWheel);
      canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
      canvas.remove();
      this.renderer.dispose();
      this.renderer = null;
    }
  }
}
