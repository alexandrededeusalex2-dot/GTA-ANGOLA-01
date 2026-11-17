/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import type { EngineModule, ModuleDescriptor, Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import {
  PROTAGONIST_CLIPS_URL,
  PROTAGONIST_GLB_URL,
} from '../character/CharacterRigLoader';
import { groundHeightAt } from '../world/luandaCoordinates';

export interface NpcScheduleContract {
  readonly npcId: string;
  readonly role: string;
  readonly homeZoneId: string;
  readonly activeWindowHours: readonly [number, number];
}

export const MERCADO_PASSENGER_NPC_ID = 'npc-mercado-passenger';
export const MAX_LIGHTWEIGHT_NPCS = 3;
const NPC_CULL_RADIUS_METERS = 95;
const HIDDEN_INNER_FACE_MESHES = new Set([
  'h_L_gland',
  'h_R_gland',
  'h_TeethUp',
  'h_TeethDown',
]);

interface BakedAnimationBundle {
  readonly schemaVersion: number;
  readonly targetSkeleton: string;
  readonly sourceClips: readonly string[];
  readonly clips: readonly THREE.AnimationClipJSON[];
}

interface LightweightNpcSlotSpec {
  readonly id: string;
  readonly role: 'passenger' | 'resident';
  readonly offsetX: number;
  readonly offsetZ: number;
  readonly tintHex: number;
}

const MERCADO_NPC_SLOTS: readonly LightweightNpcSlotSpec[] = [
  {
    id: MERCADO_PASSENGER_NPC_ID,
    role: 'passenger',
    offsetX: 2.6,
    offsetZ: -2.3,
    tintHex: 0xffffff,
  },
  {
    id: 'npc-mercado-resident-2',
    role: 'resident',
    offsetX: 4.3,
    offsetZ: -2.9,
    tintHex: 0xded0bc,
  },
  {
    id: 'npc-mercado-resident-3',
    role: 'resident',
    offsetX: 1.2,
    offsetZ: -3.2,
    tintHex: 0xc2d3e3,
  },
];

interface SpawnedLightweightNpc {
  readonly id: string;
  readonly role: 'passenger' | 'resident';
  readonly rootGroup: THREE.Group;
  readonly modelScene: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly idleAction: THREE.AnimationAction;
  readonly clonedMaterials: THREE.Material[];
  readonly rightShoulderBone: THREE.Bone | null;
  readonly rightArmBone: THREE.Bone | null;
  readonly rightForeArmBone: THREE.Bone | null;
  homeX: number;
  homeZ: number;
  homeYaw: number;
  worldX: number;
  worldZ: number;
  logicalVisible: boolean;
  raisingHand: boolean;
  raiseBlend: number;
  wavePhase: number;
}

/**
 * NPC Engine (Phase 7 — 3 Lightweight Residents + "Prenda Express" Passenger):
 * Reuses the already-cached protagonist GLB + idle animation via SkeletonUtils.clone
 * (zero extra 3D models, zero shadows, trimmed inner sub-meshes, and 95m culling).
 */
export class NpcEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'npc',
    index: 4,
    name: 'NPC Engine',
    responsibility:
      '3 NPCs leves reutilizando o ativo GLB em cache (sem sombras e com culling por distância), incluindo passageiro interativo no Mercado.',
    status: 'implemented',
    targetPhase: 'Fase 7 — Mini-mapa + Missão Candongueiro',
    dependencies: ['AssetManager', 'WorldEngine', 'CharacterEngine'],
    pendingTasks: [
      'Expandir passeios com rotas pedonais e diálogos contextuais em Português de Angola.',
      'Manter orçamento estrito de draw calls por zona em Android.',
    ],
  };

  private schedules: NpcScheduleContract[] = [];
  private npcs: SpawnedLightweightNpc[] = [];
  private targetScene: THREE.Scene | null = null;
  private mountPromise: Promise<void> | null = null;
  private disposed = false;
  private focusPos: Vector3Like = { x: 0, y: 0, z: 0 };

  constructor(private readonly assetManager?: AssetManager) {}

  init(): void {
    this.registerSchedule({
      npcId: MERCADO_PASSENGER_NPC_ID,
      role: 'Passageiro Mercado -> Centro UV1',
      homeZoneId: 'paragem_mercado_uv1',
      activeWindowHours: [6, 21],
    });
  }

  registerSchedule(schedule: NpcScheduleContract): void {
    this.schedules.push(schedule);
  }

  async mountToScene(
    scene: THREE.Scene,
    mercadoStop: { readonly x: number; readonly z: number },
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): Promise<void> {
    this.targetScene = scene;
    if (this.disposed || !this.assetManager) return;

    if (this.npcs.length > 0) {
      for (const npc of this.npcs) {
        if (npc.rootGroup.parent !== scene) {
          scene.add(npc.rootGroup);
        }
      }
      this.refreshDistanceCulling();
      return;
    }

    if (this.mountPromise) {
      return this.mountPromise;
    }

    this.mountPromise = Promise.all([
      this.assetManager.loadGltfModel('character:prenda_protagonist', PROTAGONIST_GLB_URL),
      this.assetManager.loadJson<BakedAnimationBundle>(
        'animations:prenda_locomotion',
        PROTAGONIST_CLIPS_URL,
      ),
    ])
      .then(([gltf, bundle]) => {
        if (this.disposed) return;

        const parsedIdleJson =
          bundle.clips.find((c) => c.name === 'idle') ?? bundle.clips[0];
        const idleClip = THREE.AnimationClip.parse(parsedIdleJson);

        for (const slot of MERCADO_NPC_SLOTS.slice(0, MAX_LIGHTWEIGHT_NPCS)) {
          const x = mercadoStop.x + slot.offsetX;
          const z = mercadoStop.z + slot.offsetZ;
          const y = sampleGroundY(x, z);
          const yaw = Math.atan2(mercadoStop.x - x, mercadoStop.z - z);

          const clonedScene = cloneSkinnedScene(gltf.scene);
          const clonedMaterials: THREE.Material[] = [];
          let rightShoulderBone: THREE.Bone | null = null;
          let rightArmBone: THREE.Bone | null = null;
          let rightForeArmBone: THREE.Bone | null = null;

          clonedScene.traverse((obj) => {
            if ((obj as THREE.Bone).isBone) {
              const bone = obj as THREE.Bone;
              if (bone.name === 'RightShoulder') rightShoulderBone = bone;
              else if (bone.name === 'RightArm') rightArmBone = bone;
              else if (bone.name === 'RightForeArm') rightForeArmBone = bone;
            }
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              if (HIDDEN_INNER_FACE_MESHES.has(mesh.name)) {
                mesh.visible = false;
                return;
              }
              if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
                mesh.frustumCulled = false;
              }
              if (slot.tintHex !== 0xffffff && mesh.name === 'H_DDS_HighRes') {
                const srcMat = Array.isArray(mesh.material)
                  ? mesh.material[0]
                  : mesh.material;
                if (srcMat && (srcMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const tinted = (srcMat as THREE.MeshStandardMaterial).clone();
                  tinted.color.setHex(slot.tintHex);
                  mesh.material = tinted;
                  clonedMaterials.push(tinted);
                }
              }
            }
          });

          const rootGroup = new THREE.Group();
          rootGroup.name = `NPC_${slot.id}`;
          rootGroup.position.set(x, y, z);
          rootGroup.rotation.set(0, yaw, 0);
          rootGroup.add(clonedScene);

          const mixer = new THREE.AnimationMixer(clonedScene);
          const idleAction = mixer.clipAction(idleClip);
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleAction.enabled = true;
          idleAction.play();
          mixer.update(0.15 * (this.npcs.length + 1));

          const spawnedNpc: SpawnedLightweightNpc = {
            id: slot.id,
            role: slot.role,
            rootGroup,
            modelScene: clonedScene,
            mixer,
            idleAction,
            clonedMaterials,
            rightShoulderBone,
            rightArmBone,
            rightForeArmBone,
            homeX: x,
            homeZ: z,
            homeYaw: yaw,
            worldX: x,
            worldZ: z,
            logicalVisible: true,
            raisingHand: false,
            raiseBlend: 0,
            wavePhase: 0,
          };

          this.npcs.push(spawnedNpc);
          if (this.targetScene) {
            this.targetScene.add(rootGroup);
          }
        }

        this.refreshDistanceCulling();
      })
      .finally(() => {
        this.mountPromise = null;
      });

    return this.mountPromise;
  }

  getNpcCount(): number {
    return this.npcs.length;
  }

  getPassengerNpcState(): {
    readonly visible: boolean;
    readonly raisingHand: boolean;
    readonly x: number;
    readonly z: number;
  } | null {
    const passenger = this.findPassenger();
    if (!passenger) return null;
    return {
      visible: passenger.logicalVisible,
      raisingHand: passenger.raisingHand,
      x: passenger.worldX,
      z: passenger.worldZ,
    };
  }

  startPassengerHandRaise(): void {
    const passenger = this.findPassenger();
    if (!passenger) return;
    passenger.logicalVisible = true;
    passenger.raisingHand = true;
    passenger.wavePhase = 0;
    this.refreshDistanceCulling();
  }

  hidePassengerInVehicle(): void {
    const passenger = this.findPassenger();
    if (!passenger) return;
    passenger.raisingHand = false;
    passenger.raiseBlend = 0;
    passenger.logicalVisible = false;
    this.refreshDistanceCulling();
  }

  spawnPassengerIdleAtCentro(
    x: number,
    z: number,
    yaw: number,
    sampleGroundY: (px: number, pz: number) => number = groundHeightAt,
  ): void {
    const passenger = this.findPassenger();
    if (!passenger) return;
    const y = sampleGroundY(x, z);
    passenger.worldX = x;
    passenger.worldZ = z;
    passenger.raisingHand = false;
    passenger.raiseBlend = 0;
    passenger.logicalVisible = true;
    passenger.rootGroup.position.set(x, y, z);
    passenger.rootGroup.rotation.set(0, yaw, 0);
    passenger.mixer.update(0);
    this.refreshDistanceCulling();
  }

  resetPassengerToMercadoStop(
    sampleGroundY: (px: number, pz: number) => number = groundHeightAt,
  ): void {
    const passenger = this.findPassenger();
    if (!passenger) return;
    const y = sampleGroundY(passenger.homeX, passenger.homeZ);
    passenger.worldX = passenger.homeX;
    passenger.worldZ = passenger.homeZ;
    passenger.raisingHand = false;
    passenger.raiseBlend = 0;
    passenger.logicalVisible = true;
    passenger.rootGroup.position.set(passenger.homeX, y, passenger.homeZ);
    passenger.rootGroup.rotation.set(0, passenger.homeYaw, 0);
    passenger.mixer.update(0);
    this.refreshDistanceCulling();
  }

  updateFocusPosition(pos: Vector3Like): void {
    this.focusPos = pos;
    this.refreshDistanceCulling();
  }

  update(dt: number): void {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
    for (const npc of this.npcs) {
      if (!npc.rootGroup.visible) continue;
      npc.mixer.update(clampedDt);

      if (npc.raisingHand || npc.raiseBlend > 0.01) {
        const target = npc.raisingHand ? 1 : 0;
        npc.raiseBlend += (target - npc.raiseBlend) * Math.min(1, clampedDt * 9);
        npc.wavePhase += clampedDt * 6.5;

        // Layer raised right arm hailing gesture right after mixer.update()
        const b = npc.raiseBlend;
        if (npc.rightShoulderBone) {
          npc.rightShoulderBone.rotation.z -= 0.35 * b;
        }
        if (npc.rightArmBone) {
          npc.rightArmBone.rotation.z -= 1.65 * b;
          npc.rightArmBone.rotation.x -= 0.45 * b;
        }
        if (npc.rightForeArmBone) {
          npc.rightForeArmBone.rotation.z -= (0.45 + Math.sin(npc.wavePhase) * 0.25) * b;
        }
      }
    }
  }

  private findPassenger(): SpawnedLightweightNpc | undefined {
    return this.npcs.find((n) => n.id === MERCADO_PASSENGER_NPC_ID);
  }

  private refreshDistanceCulling(): void {
    const cullSq = NPC_CULL_RADIUS_METERS * NPC_CULL_RADIUS_METERS;
    let visibleCount = 0;
    for (const npc of this.npcs) {
      const dx = npc.worldX - this.focusPos.x;
      const dz = npc.worldZ - this.focusPos.z;
      const withinRange = dx * dx + dz * dz <= cullSq;
      const isVisible = npc.logicalVisible && withinRange;
      npc.rootGroup.visible = isVisible;
      if (isVisible) visibleCount += 1;
    }

    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.npcVisibleCount = String(visibleCount);
      const passenger = this.findPassenger();
      if (passenger) {
        document.body.dataset.passengerState = !passenger.logicalVisible
          ? 'onboard'
          : passenger.raisingHand
            ? 'raising-hand'
            : 'standing';
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const npc of this.npcs) {
      npc.mixer.stopAllAction();
      npc.mixer.uncacheRoot(npc.modelScene);
      for (const mat of npc.clonedMaterials) {
        mat.dispose();
      }
      npc.rootGroup.removeFromParent();
    }
    this.npcs = [];
    this.schedules = [];
  }
}
