/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { AssetManager } from '../../resources/AssetManager';
import type { CharacterActionSlot } from './CharacterCustomization';

export const PROTAGONIST_GLB_URL = '/assets/models/characters/prenda_protagonist.glb';
export const PROTAGONIST_CLIPS_URL = '/assets/animations/prenda_locomotion.json';
export const ACESSORIOS_PRENDA_GLB_URL = '/assets/models/props/acessorios_prenda.glb';

interface BakedAnimationBundle {
  readonly schemaVersion: number;
  readonly targetSkeleton: string;
  readonly sourceClips: readonly string[];
  readonly clips: readonly THREE.AnimationClipJSON[];
}

export interface LoadedProtagonistRig {
  readonly rootGroup: THREE.Group;
  readonly modelScene: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<'idle' | 'walk' | 'run', THREE.AnimationAction>;
  readonly futureActionSlots: ReadonlySet<CharacterActionSlot>;
  readonly boneNames: readonly string[];
  readonly contactShadowMesh: THREE.Mesh;
  readonly headBone: THREE.Bone | null;
  applyBlendWeights(
    idleWeight: number,
    walkWeight: number,
    runWeight: number,
    walkTimeScale: number,
    runTimeScale: number,
  ): void;
  setTshirtColor(hex: string): boolean;
  setHairStyle(style: 'default' | 'low_fade', hairTemplate?: THREE.Object3D | null): boolean;
  update(dt: number): void;
  dispose(): void;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(10, 12, 16, 0.58)');
    grad.addColorStop(0.55, 'rgba(10, 12, 16, 0.24)');
    grad.addColorStop(1, 'rgba(10, 12, 16, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createRecoloredBodyTexture(
  sourceTexture: THREE.Texture,
  hexColor: string,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const img = sourceTexture.image as CanvasImageSource & { width?: number; height?: number };
  if (!img || !img.width || !img.height) return null;

  const width = img.width;
  const height = img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const target = new THREE.Color(hexColor);
  const tr = target.r;
  const tg = target.g;
  const tb = target.b;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC - minC;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    if (sat < 30 && lum >= 85 && lum <= 228) {
      const shade = lum / 170;
      data[i] = Math.min(255, Math.round(tr * 255 * shade));
      data[i + 1] = Math.min(255, Math.round(tg * 255 * shade));
      data[i + 2] = Math.min(255, Math.round(tb * 255 * shade));
    }
  }

  ctx.putImageData(imgData, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export async function loadProtagonistRig(
  assetManager: AssetManager,
): Promise<LoadedProtagonistRig> {
  const [gltf, bundle] = await Promise.all([
    assetManager.loadGltfModel('character:prenda_protagonist', PROTAGONIST_GLB_URL),
    assetManager.loadJson<BakedAnimationBundle>(
      'animations:prenda_locomotion',
      PROTAGONIST_CLIPS_URL,
    ),
  ]);

  const rootGroup = new THREE.Group();
  rootGroup.name = 'AngolaVirtualProtagonistRoot';

  const modelScene = gltf.scene;
  const boneNamesSet = new Set<string>();
  let headBone: THREE.Bone | null = null;
  let bodyMesh: THREE.Mesh | null = null;
  let bodyMaterial: THREE.MeshStandardMaterial | null = null;
  let baseBodyMap: THREE.Texture | null = null;

  modelScene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone && obj.name) {
      boneNamesSet.add(obj.name);
      if (obj.name === 'Head') {
        headBone = obj as THREE.Bone;
      }
    }
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
        mesh.frustumCulled = false;
      }
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const std = mat as THREE.MeshStandardMaterial;
          std.roughness = Math.max(std.roughness ?? 0.5, 0.62);
          std.metalness = 0.0;
          std.envMapIntensity = 0.58;
          std.needsUpdate = true;
        }
      }
      if (mesh.name === 'H_DDS_HighRes') {
        bodyMesh = mesh;
        const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
        if (srcMat && (srcMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const cloned = (srcMat as THREE.MeshStandardMaterial).clone();
          mesh.material = cloned;
          bodyMaterial = cloned;
          baseBodyMap = cloned.map;
        }
      }
    }
  });

  rootGroup.add(modelScene);

  const shadowGeo = new THREE.CircleGeometry(0.42, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowTex = createContactShadowTexture();
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const contactShadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadowMesh.name = 'ProtagonistContactShadow';
  contactShadowMesh.position.y = 0.015;
  contactShadowMesh.renderOrder = 2;
  rootGroup.add(contactShadowMesh);

  const mixer = new THREE.AnimationMixer(modelScene);
  const parsedClips = new Map<string, THREE.AnimationClip>();
  for (const clipJson of bundle.clips) {
    const clip = THREE.AnimationClip.parse(clipJson);
    parsedClips.set(clip.name, clip);
  }

  const idleClip = parsedClips.get('idle') ?? THREE.AnimationClip.parse(bundle.clips[0]);
  const walkClip = parsedClips.get('walk') ?? idleClip;
  const runClip = parsedClips.get('run') ?? walkClip;

  const idleAction = mixer.clipAction(idleClip);
  const walkAction = mixer.clipAction(walkClip);
  const runAction = mixer.clipAction(runClip);

  for (const action of [idleAction, walkAction, runAction]) {
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.enabled = true;
    action.play();
  }

  idleAction.setEffectiveWeight(1);
  walkAction.setEffectiveWeight(0);
  runAction.setEffectiveWeight(0);

  mixer.update(0);
  modelScene.updateMatrixWorld(true);

  const futureActionSlots = new Set<CharacterActionSlot>([
    'idle',
    'walk',
    'run',
    'sit',
    'jump',
    'enterVehicle',
    'drive',
    'interact',
  ]);

  let customTshirtTex: THREE.CanvasTexture | null = null;
  let hairAccessoryNode: THREE.Object3D | null = null;

  return {
    rootGroup,
    modelScene,
    mixer,
    actions: {
      idle: idleAction,
      walk: walkAction,
      run: runAction,
    },
    futureActionSlots,
    boneNames: [...boneNamesSet],
    contactShadowMesh,
    headBone,
    applyBlendWeights(idleWeight, walkWeight, runWeight, walkTimeScale, runTimeScale) {
      idleAction.setEffectiveWeight(idleWeight);
      walkAction.setEffectiveWeight(walkWeight);
      runAction.setEffectiveWeight(runWeight);
      walkAction.setEffectiveTimeScale(walkTimeScale);
      runAction.setEffectiveTimeScale(runTimeScale);
    },
    setTshirtColor(hex: string) {
      if (!bodyMaterial || !bodyMesh) return false;
      customTshirtTex?.dispose();
      customTshirtTex = null;

      if (baseBodyMap) {
        const recolored = createRecoloredBodyTexture(baseBodyMap, hex);
        if (recolored) {
          customTshirtTex = recolored;
          bodyMaterial.map = recolored;
          bodyMaterial.color.setHex(0xffffff);
          bodyMaterial.needsUpdate = true;
          return true;
        }
      }
      bodyMaterial.color.set(hex);
      bodyMaterial.needsUpdate = true;
      return true;
    },
    setHairStyle(style: 'default' | 'low_fade', hairTemplate?: THREE.Object3D | null) {
      if (hairAccessoryNode) {
        hairAccessoryNode.removeFromParent();
        hairAccessoryNode = null;
      }
      if (style === 'default') return true;
      if (!headBone || !hairTemplate) return false;

      const clone = hairTemplate.clone(true);
      clone.name = 'ProtagonistHairLowFade';
      clone.scale.setScalar(100);
      clone.position.set(0, 9.2, 0.4);
      clone.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).castShadow = false;
          (child as THREE.Mesh).receiveShadow = false;
        }
      });
      headBone.add(clone);
      hairAccessoryNode = clone;
      return true;
    },
    update(dt: number) {
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(modelScene);
      customTshirtTex?.dispose();
      bodyMaterial?.dispose();
      hairAccessoryNode?.removeFromParent();
      shadowGeo.dispose();
      shadowTex.dispose();
      shadowMat.dispose();
      rootGroup.removeFromParent();
    },
  };
}
