/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { clone as cloneSkinnedScene } from 'three/addons/utils/SkeletonUtils.js';
import type { EngineModule, ModuleDescriptor, Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import {
  ACESSORIOS_PRENDA_GLB_URL,
  PROTAGONIST_CLIPS_URL,
  PROTAGONIST_GLB_URL,
} from '../character/CharacterRigLoader';
import { CENTRO_CROSSWALK_WALK_AXIS, CENTRO_TRAFFIC_LIGHT_POS } from '../world/TrafficLightPropBuilder';
import { groundHeightAt } from '../world/luandaCoordinates';

export interface NpcScheduleContract {
  readonly npcId: string;
  readonly role: string;
  readonly homeZoneId: string;
  readonly activeWindowHours: readonly [number, number];
}

export const MERCADO_PASSENGER_NPC_ID = 'npc-mercado-passenger';
export const MAX_LIGHTWEIGHT_NPCS = 3;
export const MAX_TOTAL_NPCS = 8;
export const NPC_CULL_RADIUS_METERS = 58;
export const NPC_ANIMATION_CULL_RADIUS_METERS = 40;
export const BOLA_LOW_GLB_URL = '/assets/models/props/bola_low.glb';
export const ZUNGUEIRA_PAUSE_SECONDS = 5.0;
export const ZUNGUEIRA_SHOUT_TEXT = 'Água fresca!';
export const KID_PLAYER_SCALE = 0.7;
export const KID_BALL_KICK_DISTANCE_METERS = 3.0;

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

export interface Point2D {
  readonly x: number;
  readonly z: number;
}

export interface ZungueiraBehaviorState {
  x: number;
  z: number;
  yaw: number;
  waypointIndex: number;
  pauseRemainingSec: number;
  isShouting: boolean;
}

export interface KidBallBehaviorState {
  kidX: number;
  kidZ: number;
  kidYaw: number;
  ballX: number;
  ballZ: number;
  ballTargetX: number;
  ballTargetZ: number;
  ballMoving: boolean;
  kickAngleRad: number;
  pauseSec: number;
}

export interface CrosswalkPedestrianState {
  x: number;
  z: number;
  yaw: number;
  crossingDirection: 1 | -1;
  crossingActive: boolean;
  progress: number; // [0, 1]
}

export function shouldAnimateNpcAtDistance(
  npcPos: Point2D,
  focusPos: Point2D,
  maxAnimRadiusMeters = NPC_ANIMATION_CULL_RADIUS_METERS,
): boolean {
  const dx = npcPos.x - focusPos.x;
  const dz = npcPos.z - focusPos.z;
  return dx * dx + dz * dz <= maxAnimRadiusMeters * maxAnimRadiusMeters;
}

export function stepSidewalkWalker(
  pos: { x: number; z: number; yaw: number; waypointIndex: number },
  waypoints: readonly Point2D[],
  speedMps: number,
  dt: number,
): boolean {
  if (waypoints.length < 2) return false;
  const target = waypoints[pos.waypointIndex % waypoints.length];
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const stepDist = speedMps * dt;
  if (dist > 0.04) {
    pos.yaw = Math.atan2(dx, dz);
  }
  if (dist <= stepDist + 0.15) {
    pos.x = target.x;
    pos.z = target.z;
    pos.waypointIndex = (pos.waypointIndex + 1) % waypoints.length;
    return true;
  }
  pos.x += (dx / dist) * stepDist;
  pos.z += (dz / dist) * stepDist;
  return false;
}

/**
 * Zungueira: walks slowly with tray on head, pauses 5s, shouts "Água fresca!".
 */
export function stepZungueiraBehavior(
  state: ZungueiraBehaviorState,
  waypoints: readonly Point2D[],
  dt: number,
  rainSpeedMultiplier = 1,
): ZungueiraBehaviorState {
  const clampedDt = Math.max(0, dt);
  if (state.pauseRemainingSec > 0) {
    const nextPause = Math.max(0, state.pauseRemainingSec - clampedDt);
    return {
      ...state,
      pauseRemainingSec: nextPause,
      isShouting: nextPause > 0,
    };
  }

  const walker = {
    x: state.x,
    z: state.z,
    yaw: state.yaw,
    waypointIndex: state.waypointIndex,
  };
  const reached = stepSidewalkWalker(walker, waypoints, 1.15 * rainSpeedMultiplier, clampedDt);
  return {
    x: walker.x,
    z: walker.z,
    yaw: walker.yaw,
    waypointIndex: walker.waypointIndex,
    pauseRemainingSec: reached ? ZUNGUEIRA_PAUSE_SECONDS : 0,
    isShouting: reached,
  };
}

/**
 * Kid (scale 0.7) kicks bola_low.glb 3m ahead, runs after it, repeats cleanly inside courtyard.
 */
export function stepKidSoccerBallBehavior(
  state: KidBallBehaviorState,
  centerPos: Point2D,
  dt: number,
): { readonly state: KidBallBehaviorState; readonly isRunning: boolean } {
  const clampedDt = Math.max(0, dt);
  const next = { ...state };

  if (next.pauseSec > 0) {
    next.pauseSec = Math.max(0, next.pauseSec - clampedDt);
    return { state: next, isRunning: false };
  }

  if (next.ballMoving) {
    const dx = next.ballTargetX - next.ballX;
    const dz = next.ballTargetZ - next.ballZ;
    const dist = Math.hypot(dx, dz);
    const ballStep = 4.6 * clampedDt;
    if (dist <= ballStep + 0.08) {
      next.ballX = next.ballTargetX;
      next.ballZ = next.ballTargetZ;
      next.ballMoving = false;
    } else {
      next.ballX += (dx / dist) * ballStep;
      next.ballZ += (dz / dist) * ballStep;
    }
  }

  // Kid runs towards the ball
  const kdx = next.ballX - next.kidX;
  const kdz = next.ballZ - next.kidZ;
  const kDist = Math.hypot(kdx, kdz);
  if (kDist > 0.05) {
    next.kidYaw = Math.atan2(kdx, kdz);
  }

  if (!next.ballMoving && kDist <= 0.58) {
    // Reached the ball: kick it 3m in next direction keeping within 5.5m of center plaza
    let angle = next.kickAngleRad + 2.15;
    let tx = next.ballX + Math.sin(angle) * KID_BALL_KICK_DISTANCE_METERS;
    let tz = next.ballZ + Math.cos(angle) * KID_BALL_KICK_DISTANCE_METERS;
    if (Math.hypot(tx - centerPos.x, tz - centerPos.z) > 5.2) {
      angle = Math.atan2(centerPos.x - next.ballX, centerPos.z - next.ballZ);
      tx = next.ballX + Math.sin(angle) * KID_BALL_KICK_DISTANCE_METERS;
      tz = next.ballZ + Math.cos(angle) * KID_BALL_KICK_DISTANCE_METERS;
    }
    next.kickAngleRad = angle;
    next.kidYaw = angle;
    next.ballTargetX = tx;
    next.ballTargetZ = tz;
    next.ballMoving = true;
    next.pauseSec = 0.25;
    return { state: next, isRunning: false };
  }

  const runStep = 2.85 * clampedDt;
  if (kDist > 0.45) {
    next.kidX += (kdx / kDist) * Math.min(runStep, kDist - 0.35);
    next.kidZ += (kdz / kDist) * Math.min(runStep, kDist - 0.35);
    return { state: next, isRunning: true };
  }

  return { state: next, isRunning: false };
}

/**
 * Crosswalk pedestrian ONLY starts or crosses when pedestrianLight === 'green'.
 */
export function stepCrosswalkPedestrian(
  state: CrosswalkPedestrianState,
  curbStart: Point2D,
  curbEnd: Point2D,
  pedestrianLight: 'green' | 'red',
  dt: number,
  speedScale = 1,
): CrosswalkPedestrianState {
  const clampedDt = Math.max(0, dt);
  if (!state.crossingActive) {
    if (pedestrianLight !== 'green') {
      return state;
    }
    const target = state.crossingDirection === 1 ? curbEnd : curbStart;
    return {
      ...state,
      crossingActive: true,
      yaw: Math.atan2(target.x - state.x, target.z - state.z),
    };
  }

  // Finish crossing cleanly if already in the street, otherwise walk across at 1.45 m/s
  const from = state.crossingDirection === 1 ? curbStart : curbEnd;
  const to = state.crossingDirection === 1 ? curbEnd : curbStart;
  const totalDist = Math.max(1, Math.hypot(to.x - from.x, to.z - from.z));
  const nextProgress = Math.min(1, state.progress + ((1.5 * speedScale) / totalDist) * clampedDt);
  const nx = from.x + (to.x - from.x) * nextProgress;
  const nz = from.z + (to.z - from.z) * nextProgress;

  if (nextProgress >= 1) {
    const nextDir: 1 | -1 = state.crossingDirection === 1 ? -1 : 1;
    const faceTarget = nextDir === 1 ? curbEnd : curbStart;
    return {
      x: nx,
      z: nz,
      yaw: Math.atan2(faceTarget.x - nx, faceTarget.z - nz),
      crossingDirection: nextDir,
      crossingActive: false,
      progress: 0,
    };
  }

  return {
    ...state,
    x: nx,
    z: nz,
    progress: nextProgress,
  };
}

type NpcBehaviorKind =
  | 'passenger'
  | 'walker'
  | 'seated'
  | 'zungueira'
  | 'kid_ball'
  | 'crosswalk';

interface SpawnedNpc {
  readonly id: string;
  readonly kind: NpcBehaviorKind;
  readonly rootGroup: THREE.Group;
  readonly modelScene: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
  readonly idleAction: THREE.AnimationAction;
  readonly walkAction: THREE.AnimationAction;
  readonly runAction: THREE.AnimationAction;
  readonly clonedMaterials: THREE.Material[];
  readonly eyeMeshes: THREE.Mesh[];
  readonly bones: {
    rightShoulder: THREE.Bone | null;
    rightArm: THREE.Bone | null;
    rightForeArm: THREE.Bone | null;
    head: THREE.Bone | null;
    hips: THREE.Bone | null;
    leftUpLeg: THREE.Bone | null;
    leftLeg: THREE.Bone | null;
    rightUpLeg: THREE.Bone | null;
    rightLeg: THREE.Bone | null;
  };
  homeX: number;
  homeZ: number;
  homeYaw: number;
  worldX: number;
  worldZ: number;
  yaw: number;
  logicalVisible: boolean;
  raisingHand: boolean;
  raiseBlend: number;
  wavePhase: number;
  walkerWaypoints?: readonly Point2D[];
  walkerIdx?: number;
  walkerSpeed?: number;
}

const CENTRO_SIDEWALK_LOOP_A: readonly Point2D[] = [
  { x: 325, z: -4 },
  { x: 260, z: -50 },
  { x: 158, z: 68 },
  { x: 24, z: 12 },
  { x: -12, z: -2 },
  { x: 24, z: 12 },
  { x: 158, z: 68 },
  { x: 260, z: -50 },
];

const CENTRO_SIDEWALK_LOOP_B: readonly Point2D[] = [
  { x: -10, z: -4 },
  { x: -24, z: -11 },
  { x: -38, z: -18 },
  { x: -18, z: -2 },
  { x: 4, z: 14 },
  { x: -6, z: 6 },
];

const ZUNGUEIRA_LOOP: readonly Point2D[] = [
  { x: -12.0, z: -3.8 },
  { x: -24.5, z: -10.8 },
  { x: -37.0, z: -17.6 },
  { x: -24.5, z: -10.8 },
];

const KID_PLAZA_CENTER: Point2D = { x: -9.5, z: 18.5 };

const CROSSWALK_CURB_A: Point2D = {
  x: CENTRO_TRAFFIC_LIGHT_POS.x + CENTRO_CROSSWALK_WALK_AXIS.dz * -4.2,
  z: CENTRO_TRAFFIC_LIGHT_POS.z + CENTRO_CROSSWALK_WALK_AXIS.dx * 4.2,
};
const CROSSWALK_CURB_B: Point2D = {
  x: CENTRO_TRAFFIC_LIGHT_POS.x + CENTRO_CROSSWALK_WALK_AXIS.dz * 4.2,
  z: CENTRO_TRAFFIC_LIGHT_POS.z + CENTRO_CROSSWALK_WALK_AXIS.dx * -4.2,
};

function createZungueiraCalloutSprite(): {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly texture: THREE.CanvasTexture;
} | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#fef3c7';
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 6;
    ctx.fillRect(6, 6, 244, 60);
    ctx.strokeRect(6, 6, 244, 60);
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#78350f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ZUNGUEIRA_SHOUT_TEXT, 128, 36);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 0.62, 1);
  sprite.position.set(0, 2.25, 0);
  sprite.visible = false;
  return { sprite, material, texture };
}

/**
 * NPC Engine (Phase 8 — Living Prenda Ciudad):
 * - Preserves Phase 7 "Prenda Express" passenger at Mercado.
 * - 2 residents walking Mercado <-> Centro sidewalk loop + 1 seated resident (bone pose, no chair primitive).
 * - Zungueira with modeled head tray pausing 5s and shouting "Água fresca!".
 * - Kid (scale 0.7) kicking low-poly bola_low.glb 3m and chasing it.
 * - Crosswalk pedestrian crossing strictly when pedestrian light is GREEN.
 * - Skips skeletal mixer.update beyond 40m focus distance and enforces <= 8 NPCs total.
 */
export class NpcEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'npc',
    index: 4,
    name: 'NPC Engine',
    responsibility:
      'Até 8 NPCs vivos (residentes em passeio, sentado, zungueira, miúdo a jogar à bola e peão na passadeira) com culling de animação >40m.',
    status: 'implemented',
    targetPhase: 'Fase 8 — Cidade Viva',
    dependencies: ['AssetManager', 'WorldEngine', 'CharacterEngine'],
    pendingTasks: [
      'Manter orçamento estrito de <=8 NPCs e culling de animação acima de 40m.',
    ],
  };

  private schedules: NpcScheduleContract[] = [];
  private npcs: SpawnedNpc[] = [];
  private targetScene: THREE.Scene | null = null;
  private mountPromise: Promise<void> | null = null;
  private disposed = false;
  private focusPos: Vector3Like = { x: -4, y: 0, z: 12 };

  private zungueiraState: ZungueiraBehaviorState = {
    x: ZUNGUEIRA_LOOP[0].x,
    z: ZUNGUEIRA_LOOP[0].z,
    yaw: -1.8,
    waypointIndex: 1,
    pauseRemainingSec: 2.0,
    isShouting: true,
  };
  private zungueiraBubble: ReturnType<typeof createZungueiraCalloutSprite> = null;

  private kidState: KidBallBehaviorState = {
    kidX: KID_PLAZA_CENTER.x - 1.5,
    kidZ: KID_PLAZA_CENTER.z - 1.0,
    kidYaw: 0.5,
    ballX: KID_PLAZA_CENTER.x,
    ballZ: KID_PLAZA_CENTER.z,
    ballTargetX: KID_PLAZA_CENTER.x + 2.4,
    ballTargetZ: KID_PLAZA_CENTER.z + 1.2,
    ballMoving: true,
    kickAngleRad: 0.4,
    pauseSec: 0,
  };
  private soccerBallGroup: THREE.Object3D | null = null;

  private crosswalkState: CrosswalkPedestrianState = {
    x: CROSSWALK_CURB_A.x,
    z: CROSSWALK_CURB_A.z,
    yaw: Math.atan2(CROSSWALK_CURB_B.x - CROSSWALK_CURB_A.x, CROSSWALK_CURB_B.z - CROSSWALK_CURB_A.z),
    crossingDirection: 1,
    crossingActive: false,
    progress: 0,
  };

  private pedestrianLight: 'green' | 'red' = 'red';
  private rainSpeedMultiplier = 1.0;

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

  setEnvironmentSignals(pedestrianLight: 'green' | 'red', rainNpcSpeedMultiplier: number): void {
    this.pedestrianLight = pedestrianLight;
    this.rainSpeedMultiplier = rainNpcSpeedMultiplier;
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
        if (npc.rootGroup.parent !== scene) scene.add(npc.rootGroup);
      }
      if (this.soccerBallGroup && this.soccerBallGroup.parent !== scene) {
        scene.add(this.soccerBallGroup);
      }
      this.refreshDistanceCulling();
      return;
    }

    if (this.mountPromise) return this.mountPromise;

    this.mountPromise = Promise.all([
      this.assetManager.loadGltfModel('character:prenda_protagonist', PROTAGONIST_GLB_URL),
      this.assetManager.loadJson<BakedAnimationBundle>(
        'animations:prenda_locomotion',
        PROTAGONIST_CLIPS_URL,
      ),
      this.assetManager.loadGltfModel('props:acessorios_prenda', ACESSORIOS_PRENDA_GLB_URL),
      this.assetManager.loadGltfModel('props:bola_low', BOLA_LOW_GLB_URL),
    ])
      .then(([charGltf, bundle, accGltf, ballGltf]) => {
        if (this.disposed) return;

        const idleClip = THREE.AnimationClip.parse(
          bundle.clips.find((c) => c.name === 'idle') ?? bundle.clips[0],
        );
        const walkClip = THREE.AnimationClip.parse(
          bundle.clips.find((c) => c.name === 'walk') ?? bundle.clips[0],
        );
        const runClip = THREE.AnimationClip.parse(
          bundle.clips.find((c) => c.name === 'run') ?? bundle.clips[0],
        );

        const spawnActor = (opts: {
          id: string;
          kind: NpcBehaviorKind;
          x: number;
          z: number;
          yaw: number;
          tintHex: number;
          scale?: number;
          trayTemplate?: THREE.Object3D | null;
          walkerWaypoints?: readonly Point2D[];
          walkerIdx?: number;
          walkerSpeed?: number;
        }): SpawnedNpc => {
          const clonedScene = cloneSkinnedScene(charGltf.scene);
          const clonedMaterials: THREE.Material[] = [];
          const eyeMeshes: THREE.Mesh[] = [];
          const bones: SpawnedNpc['bones'] = {
            rightShoulder: null,
            rightArm: null,
            rightForeArm: null,
            head: null,
            hips: null,
            leftUpLeg: null,
            leftLeg: null,
            rightUpLeg: null,
            rightLeg: null,
          };

          clonedScene.traverse((obj) => {
            if ((obj as THREE.Bone).isBone) {
              const bone = obj as THREE.Bone;
              if (bone.name === 'RightShoulder') bones.rightShoulder = bone;
              else if (bone.name === 'RightArm') bones.rightArm = bone;
              else if (bone.name === 'RightForeArm') bones.rightForeArm = bone;
              else if (bone.name === 'Head') bones.head = bone;
              else if (bone.name === 'Hips') bones.hips = bone;
              else if (bone.name === 'LeftUpLeg') bones.leftUpLeg = bone;
              else if (bone.name === 'LeftLeg') bones.leftLeg = bone;
              else if (bone.name === 'RightUpLeg') bones.rightUpLeg = bone;
              else if (bone.name === 'RightLeg') bones.rightLeg = bone;
            }
            if ((obj as THREE.Mesh).isMesh) {
              const mesh = obj as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              if (HIDDEN_INNER_FACE_MESHES.has(mesh.name)) {
                mesh.visible = false;
                return;
              }
              if (mesh.name === 'h_L_eye' || mesh.name === 'h_R_eye') {
                eyeMeshes.push(mesh);
              }
              if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
                mesh.frustumCulled = false;
              }
              if (opts.tintHex !== 0xffffff && mesh.name === 'H_DDS_HighRes') {
                const srcMat = Array.isArray(mesh.material)
                  ? mesh.material[0]
                  : mesh.material;
                if (srcMat && (srcMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const tinted = (srcMat as THREE.MeshStandardMaterial).clone();
                  tinted.color.setHex(opts.tintHex);
                  mesh.material = tinted;
                  clonedMaterials.push(tinted);
                }
              }
            }
          });

          if (opts.trayTemplate && bones.head) {
            const tray = opts.trayTemplate.clone(true);
            tray.name = 'Zungueira_Tabuleiro_Head';
            tray.scale.setScalar(100);
            tray.position.set(0, 18.5, 0);
            bones.head.add(tray);
          }

          const y = sampleGroundY(opts.x, opts.z);
          const rootGroup = new THREE.Group();
          rootGroup.name = `NPC_${opts.id}`;
          rootGroup.position.set(opts.x, y, opts.z);
          rootGroup.rotation.set(0, opts.yaw, 0);
          if (opts.scale && opts.scale !== 1) {
            rootGroup.scale.setScalar(opts.scale);
          }
          rootGroup.add(clonedScene);

          const mixer = new THREE.AnimationMixer(clonedScene);
          const idleAction = mixer.clipAction(idleClip);
          const walkAction = mixer.clipAction(walkClip);
          const runAction = mixer.clipAction(runClip);
          for (const a of [idleAction, walkAction, runAction]) {
            a.setLoop(THREE.LoopRepeat, Infinity);
            a.enabled = true;
            a.play();
            a.setEffectiveWeight(0);
          }
          idleAction.setEffectiveWeight(1);
          mixer.update(0.2 * (this.npcs.length + 1));

          const npc: SpawnedNpc = {
            id: opts.id,
            kind: opts.kind,
            rootGroup,
            modelScene: clonedScene,
            mixer,
            idleAction,
            walkAction,
            runAction,
            clonedMaterials,
            eyeMeshes,
            bones,
            homeX: opts.x,
            homeZ: opts.z,
            homeYaw: opts.yaw,
            worldX: opts.x,
            worldZ: opts.z,
            yaw: opts.yaw,
            logicalVisible: true,
            raisingHand: false,
            raiseBlend: 0,
            wavePhase: 0,
            walkerWaypoints: opts.walkerWaypoints,
            walkerIdx: opts.walkerIdx,
            walkerSpeed: opts.walkerSpeed,
          };

          if (this.npcs.length < MAX_TOTAL_NPCS) {
            this.npcs.push(npc);
            if (this.targetScene) {
              this.targetScene.add(rootGroup);
            }
          }
          return npc;
        };

        // 1. Phase 7 Passenger at Mercado stop
        spawnActor({
          id: MERCADO_PASSENGER_NPC_ID,
          kind: 'passenger',
          x: mercadoStop.x + 2.6,
          z: mercadoStop.z - 2.3,
          yaw: Math.atan2(-2.6, 2.3),
          tintHex: 0xffffff,
        });

        // 2. Resident Walker 1 (Mercado <-> Centro long sidewalk loop)
        spawnActor({
          id: 'npc-walker-1',
          kind: 'walker',
          x: CENTRO_SIDEWALK_LOOP_A[2].x,
          z: CENTRO_SIDEWALK_LOOP_A[2].z,
          yaw: -1.5,
          tintHex: 0xded0bc,
          walkerWaypoints: CENTRO_SIDEWALK_LOOP_A,
          walkerIdx: 3,
          walkerSpeed: 1.55,
        });

        // 3. Resident Walker 2 (Centro shops sidewalk loop)
        spawnActor({
          id: 'npc-walker-2',
          kind: 'walker',
          x: CENTRO_SIDEWALK_LOOP_B[0].x,
          z: CENTRO_SIDEWALK_LOOP_B[0].z,
          yaw: -1.8,
          tintHex: 0xbfe0d8,
          walkerWaypoints: CENTRO_SIDEWALK_LOOP_B,
          walkerIdx: 1,
          walkerSpeed: 1.45,
        });

        // 4. Seated Resident on sidewalk outside Cantina (procedural skeletal pose, NO primitive chair)
        spawnActor({
          id: 'npc-seated-1',
          kind: 'seated',
          x: -9.5,
          z: -2.5,
          yaw: 0.45,
          tintHex: 0xc2d3e3,
        });

        // 5. Zungueira with tray on head + "Água fresca!" floating callout
        const trayTemplate = accGltf.scene.getObjectByName('Zungueira_Tabuleiro') ?? null;
        const zungueiraNpc = spawnActor({
          id: 'npc-zungueira',
          kind: 'zungueira',
          x: this.zungueiraState.x,
          z: this.zungueiraState.z,
          yaw: this.zungueiraState.yaw,
          tintHex: 0xf6b885,
          trayTemplate,
        });
        this.zungueiraBubble = createZungueiraCalloutSprite();
        if (this.zungueiraBubble) {
          zungueiraNpc.rootGroup.add(this.zungueiraBubble.sprite);
          this.zungueiraBubble.sprite.visible = this.zungueiraState.isShouting;
        }

        // 6. Kid (0.7 scale) kicking low-poly bola_low.glb at Centro courtyard (-14, 24)
        spawnActor({
          id: 'npc-kid-ball',
          kind: 'kid_ball',
          x: this.kidState.kidX,
          z: this.kidState.kidZ,
          yaw: this.kidState.kidYaw,
          tintHex: 0x99d5f9,
          scale: KID_PLAYER_SCALE,
        });

        this.soccerBallGroup = ballGltf.scene.clone(true);
        this.soccerBallGroup.name = 'PrendaSoccerBallLowPoly';
        const ballY = sampleGroundY(this.kidState.ballX, this.kidState.ballZ) + 0.145;
        this.soccerBallGroup.position.set(this.kidState.ballX, ballY, this.kidState.ballZ);
        scene.add(this.soccerBallGroup);

        // 7. Crosswalk Pedestrian at Centro crossing (15.4, 15.7)
        spawnActor({
          id: 'npc-crosswalk-pedestrian',
          kind: 'crosswalk',
          x: this.crosswalkState.x,
          z: this.crosswalkState.z,
          yaw: this.crosswalkState.yaw,
          tintHex: 0xe9d5ff,
        });

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

  getZungueiraState(): ZungueiraBehaviorState {
    return this.zungueiraState;
  }

  getActiveZungueiraCallout(): string | null {
    return this.zungueiraState.isShouting ? ZUNGUEIRA_SHOUT_TEXT : null;
  }

  getKidBallState(): KidBallBehaviorState {
    return this.kidState;
  }

  getCrosswalkPedestrianState(): CrosswalkPedestrianState {
    return this.crosswalkState;
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
    passenger.yaw = yaw;
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
    passenger.yaw = passenger.homeYaw;
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

  update(
    dt: number,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): void {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);

    // Advance pure Phase 8 NPC state machines
    this.zungueiraState = stepZungueiraBehavior(
      this.zungueiraState,
      ZUNGUEIRA_LOOP,
      clampedDt,
      this.rainSpeedMultiplier,
    );
    const kidStep = stepKidSoccerBallBehavior(this.kidState, KID_PLAZA_CENTER, clampedDt);
    this.kidState = kidStep.state;
    this.crosswalkState = stepCrosswalkPedestrian(
      this.crosswalkState,
      CROSSWALK_CURB_A,
      CROSSWALK_CURB_B,
      this.pedestrianLight,
      clampedDt,
      this.rainSpeedMultiplier,
    );

    if (this.soccerBallGroup) {
      const by = sampleGroundY(this.kidState.ballX, this.kidState.ballZ) + 0.145;
      this.soccerBallGroup.position.set(this.kidState.ballX, by, this.kidState.ballZ);
      if (this.kidState.ballMoving) {
        this.soccerBallGroup.rotation.x += 9.5 * clampedDt;
        this.soccerBallGroup.rotation.z += 5.0 * clampedDt;
      }
    }

    for (const npc of this.npcs) {
      let walkW = 0;
      let runW = 0;
      let idleW = 1;

      if (npc.kind === 'walker' && npc.walkerWaypoints) {
        const wState = {
          x: npc.worldX,
          z: npc.worldZ,
          yaw: npc.yaw,
          waypointIndex: npc.walkerIdx ?? 0,
        };
        stepSidewalkWalker(
          wState,
          npc.walkerWaypoints,
          (npc.walkerSpeed ?? 1.5) * this.rainSpeedMultiplier,
          clampedDt,
        );
        npc.worldX = wState.x;
        npc.worldZ = wState.z;
        npc.yaw = wState.yaw;
        npc.walkerIdx = wState.waypointIndex;
        walkW = 1;
        idleW = 0;
      } else if (npc.kind === 'zungueira') {
        npc.worldX = this.zungueiraState.x;
        npc.worldZ = this.zungueiraState.z;
        npc.yaw = this.zungueiraState.yaw;
        const walking = !this.zungueiraState.isShouting;
        walkW = walking ? 1 : 0;
        idleW = walking ? 0 : 1;
        if (this.zungueiraBubble) {
          this.zungueiraBubble.sprite.visible = this.zungueiraState.isShouting;
        }
      } else if (npc.kind === 'kid_ball') {
        npc.worldX = this.kidState.kidX;
        npc.worldZ = this.kidState.kidZ;
        npc.yaw = this.kidState.kidYaw;
        runW = kidStep.isRunning ? 1 : 0;
        idleW = kidStep.isRunning ? 0 : 1;
      } else if (npc.kind === 'crosswalk') {
        npc.worldX = this.crosswalkState.x;
        npc.worldZ = this.crosswalkState.z;
        npc.yaw = this.crosswalkState.yaw;
        walkW = this.crosswalkState.crossingActive ? 1 : 0;
        idleW = this.crosswalkState.crossingActive ? 0 : 1;
      }

      const gy = sampleGroundY(npc.worldX, npc.worldZ);
      const seatOffset = npc.kind === 'seated' ? -0.36 : 0;
      npc.rootGroup.position.set(npc.worldX, gy + seatOffset, npc.worldZ);
      npc.rootGroup.rotation.set(0, npc.yaw, 0);

      if (!npc.rootGroup.visible) continue;

      // CRITICAL Phase 8 performance budget: skip skeletal animation beyond 40m
      const animateRig = shouldAnimateNpcAtDistance(
        { x: npc.worldX, z: npc.worldZ },
        { x: this.focusPos.x, z: this.focusPos.z },
      );
      if (!animateRig) continue;

      npc.idleAction.setEffectiveWeight(idleW);
      npc.walkAction.setEffectiveWeight(walkW);
      npc.runAction.setEffectiveWeight(runW);
      npc.walkAction.setEffectiveTimeScale(this.rainSpeedMultiplier);
      npc.mixer.update(clampedDt);

      // Seated NPC skeletal pose (no geometric primitive chair)
      if (npc.kind === 'seated') {
        if (npc.bones.leftUpLeg) npc.bones.leftUpLeg.rotation.x -= 1.38;
        if (npc.bones.rightUpLeg) npc.bones.rightUpLeg.rotation.x -= 1.38;
        if (npc.bones.leftLeg) npc.bones.leftLeg.rotation.x += 1.42;
        if (npc.bones.rightLeg) npc.bones.rightLeg.rotation.x += 1.42;
      }

      if (npc.raisingHand || npc.raiseBlend > 0.01) {
        const target = npc.raisingHand ? 1 : 0;
        npc.raiseBlend += (target - npc.raiseBlend) * Math.min(1, clampedDt * 9);
        npc.wavePhase += clampedDt * 6.5;
        const b = npc.raiseBlend;
        if (npc.bones.rightShoulder) npc.bones.rightShoulder.rotation.z -= 0.35 * b;
        if (npc.bones.rightArm) {
          npc.bones.rightArm.rotation.z -= 1.65 * b;
          npc.bones.rightArm.rotation.x -= 0.45 * b;
        }
        if (npc.bones.rightForeArm) {
          npc.bones.rightForeArm.rotation.z -= (0.45 + Math.sin(npc.wavePhase) * 0.25) * b;
        }
      }
    }

    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.zungueiraShout = this.zungueiraState.isShouting
        ? ZUNGUEIRA_SHOUT_TEXT
        : '';
    }
  }

  private findPassenger(): SpawnedNpc | undefined {
    return this.npcs.find((n) => n.id === MERCADO_PASSENGER_NPC_ID);
  }

  private refreshDistanceCulling(): void {
    const cullSq = NPC_CULL_RADIUS_METERS * NPC_CULL_RADIUS_METERS;
    const eyeCullSq = 10 * 10;
    let visibleCount = 0;
    for (const npc of this.npcs) {
      const dx = npc.worldX - this.focusPos.x;
      const dz = npc.worldZ - this.focusPos.z;
      const distSq = dx * dx + dz * dz;
      const withinRange = distSq <= cullSq;
      const isVisible = npc.logicalVisible && withinRange;
      npc.rootGroup.visible = isVisible;
      const showEyes = isVisible && distSq <= eyeCullSq;
      for (const eye of npc.eyeMeshes) {
        eye.visible = showEyes;
      }
      if (isVisible) visibleCount += 1;
    }

    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.npcVisibleCount = String(visibleCount);
      document.body.dataset.npcTotalCount = String(this.npcs.length);
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
      for (const mat of npc.clonedMaterials) mat.dispose();
      npc.rootGroup.removeFromParent();
    }
    this.soccerBallGroup?.removeFromParent();
    this.soccerBallGroup = null;
    this.zungueiraBubble?.texture.dispose();
    this.zungueiraBubble?.material.dispose();
    this.zungueiraBubble = null;
    this.npcs = [];
    this.schedules = [];
  }
}
