/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { AssetManager } from '../../resources/AssetManager';
import type { CharacterActionSlot } from './CharacterCustomization';

export const PROTAGONIST_GLB_URL = '/assets/models/characters/prenda_protagonist.glb';
export const PROTAGONIST_CLIPS_URL = '/assets/animations/prenda_locomotion.json';

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
  applyBlendWeights(
    idleWeight: number,
    walkWeight: number,
    runWeight: number,
    walkTimeScale: number,
    runTimeScale: number,
  ): void;
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

/**
 * Loads the realistic adult male protagonist GLB + baked grounded locomotion clips
 * (idle, walk, run), calibrates PBR shading for Luanda sunlight, adds a ground
 * contact shadow disc, and prepares future action slot hooks.
 */
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

  modelScene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone && obj.name) {
      boneNamesSet.add(obj.name);
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
    }
  });

  rootGroup.add(modelScene);

  // Ground contact shadow disc so character never appears floating when shadows are low/disabled
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

  // Immediately evaluate frame 0 so protagonist never flashes a T-pose on first paint
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
    applyBlendWeights(idleWeight, walkWeight, runWeight, walkTimeScale, runTimeScale) {
      idleAction.setEffectiveWeight(idleWeight);
      walkAction.setEffectiveWeight(walkWeight);
      runAction.setEffectiveWeight(runWeight);
      walkAction.setEffectiveTimeScale(walkTimeScale);
      runAction.setEffectiveTimeScale(runTimeScale);
    },
    update(dt: number) {
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(modelScene);
      shadowGeo.dispose();
      shadowTex.dispose();
      shadowMat.dispose();
      rootGroup.removeFromParent();
    },
  };
}
