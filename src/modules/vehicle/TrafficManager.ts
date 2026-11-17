/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import {
  buildCentroTrafficLightVisual,
  CENTRO_TRAFFIC_LIGHT_POS,
  type TrafficLightVisualHandle,
} from '../world/TrafficLightPropBuilder';
import { loadPrendaCartography, type PrendaRoadSegment } from '../world/PrendaCartography';
import { groundHeightAt } from '../world/luandaCoordinates';
import {
  resolveCandongueiroWheels,
  stepVehicleWheelVisuals,
  type VehicleWheelRig,
} from './VehicleController';
import vehicleManifest from '../vehicles/manifest.json';

export const MAX_NPC_CANDONGUEIROS = 2;
export const NPC_CANDONGUEIRO_SPEED_MPS = 6.0;
export const NPC_CANDONGUEIRO_STOP_WAIT_SECONDS = 3.0;
export const TRAFFIC_LIGHT_GREEN_SECONDS = 10.0;
export const TRAFFIC_LIGHT_RED_SECONDS = 7.0;
export const TRAFFIC_FINE_KZ = 50;
export const TRAFFIC_FINE_MESSAGE = 'Multa -50 Kz';

export interface TrafficLightState {
  readonly phase: 'green' | 'red';
  readonly pedestrianLight: 'green' | 'red';
  readonly phaseRemainingSec: number;
}

export interface RoadWaypoint {
  readonly x: number;
  readonly z: number;
  readonly isStop?: 'mercado' | 'centro';
  readonly isTrafficSignalStop?: boolean;
}

export interface NpcVehicleRouteState {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly speedMps: number;
  readonly waypointIndex: number;
  readonly stopWaitRemainingSec: number;
  readonly waitingAtRedLight: boolean;
}

export function createInitialTrafficLightState(): TrafficLightState {
  return {
    phase: 'green',
    pedestrianLight: 'red',
    phaseRemainingSec: TRAFFIC_LIGHT_GREEN_SECONDS,
  };
}

export function stepTrafficLight(current: TrafficLightState, dt: number): TrafficLightState {
  let remaining = current.phaseRemainingSec - Math.max(0, dt);
  let phase = current.phase;

  while (remaining <= 0) {
    if (phase === 'green') {
      phase = 'red';
      remaining += TRAFFIC_LIGHT_RED_SECONDS;
    } else {
      phase = 'green';
      remaining += TRAFFIC_LIGHT_GREEN_SECONDS;
    }
  }

  return {
    phase,
    pedestrianLight: phase === 'red' ? 'green' : 'red',
    phaseRemainingSec: Math.round(remaining * 1000) / 1000,
  };
}

/**
 * Checks whether the player drove into the Centro traffic light intersection during RED.
 */
export function detectRedLightViolation(
  prevPos: { readonly x: number; readonly z: number },
  currPos: { readonly x: number; readonly z: number },
  isDrivingVehicle: boolean,
  speedMps: number,
  lightPhase: 'green' | 'red',
  cooldownRemainingSec: number,
): boolean {
  if (!isDrivingVehicle || lightPhase !== 'red' || cooldownRemainingSec > 0) return false;
  if (Math.abs(speedMps) < 0.7) return false;

  const lx = CENTRO_TRAFFIC_LIGHT_POS.x;
  const lz = CENTRO_TRAFFIC_LIGHT_POS.z;
  const prevDist = Math.hypot(prevPos.x - lx, prevPos.z - lz);
  const currDist = Math.hypot(currPos.x - lx, currPos.z - lz);

  // Trigger as player crosses inside the intersection box (< 7.5m) from outside (>= 7.5m) or drives fast inside
  return (prevDist >= 7.5 && currDist < 7.5) || (currDist < 4.5 && prevDist >= 4.5);
}

interface GraphNode {
  readonly key: string;
  readonly x: number;
  readonly z: number;
  readonly edges: { readonly to: string; readonly cost: number }[];
}

function quantKey(x: number, z: number): string {
  return `${Math.round(x * 10)},${Math.round(z * 10)}`;
}

function findShortestRoadPath(
  roads: readonly PrendaRoadSegment[],
  start: { readonly x: number; readonly z: number },
  goal: { readonly x: number; readonly z: number },
): RoadWaypoint[] {
  const drivable = roads.filter((r) => r.system7v === 'V4' || r.system7v === 'V5');
  const nodes = new Map<string, GraphNode>();

  const ensureNode = (x: number, z: number): string => {
    const key = quantKey(x, z);
    if (!nodes.has(key)) {
      nodes.set(key, { key, x, z, edges: [] });
    }
    return key;
  };

  for (const r of drivable) {
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      const ka = ensureNode(a.x, a.z);
      const kb = ensureNode(b.x, b.z);
      if (ka === kb) continue;
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      nodes.get(ka)!.edges.push({ to: kb, cost: dist });
      nodes.get(kb)!.edges.push({ to: ka, cost: dist });
    }
  }

  const nearestKey = (px: number, pz: number): string | null => {
    let best: string | null = null;
    let bestD = Infinity;
    for (const [k, n] of nodes.entries()) {
      const d = Math.hypot(n.x - px, n.z - pz);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  };

  const sKey = nearestKey(start.x, start.z);
  const gKey = nearestKey(goal.x, goal.z);
  if (!sKey || !gKey) {
    return [
      { x: start.x, z: start.z, isStop: 'mercado' },
      { x: CENTRO_TRAFFIC_LIGHT_POS.x, z: CENTRO_TRAFFIC_LIGHT_POS.z, isStop: 'centro' },
    ];
  }

  const distMap = new Map<string, number>([[sKey, 0]]);
  const prevMap = new Map<string, string>();
  const unvisited = new Set<string>(nodes.keys());

  while (unvisited.size > 0) {
    let cur: string | null = null;
    let bestD = Infinity;
    for (const k of unvisited) {
      const d = distMap.get(k) ?? Infinity;
      if (d < bestD) {
        bestD = d;
        cur = k;
      }
    }
    if (!cur || !Number.isFinite(bestD) || cur === gKey) break;
    unvisited.delete(cur);

    const node = nodes.get(cur)!;
    for (const edge of node.edges) {
      if (!unvisited.has(edge.to)) continue;
      const alt = bestD + edge.cost;
      if (alt < (distMap.get(edge.to) ?? Infinity)) {
        distMap.set(edge.to, alt);
        prevMap.set(edge.to, cur);
      }
    }
  }

  const chain: RoadWaypoint[] = [];
  let walk: string | undefined = gKey;
  while (walk) {
    const n = nodes.get(walk)!;
    chain.push({ x: n.x, z: n.z });
    if (walk === sKey) break;
    walk = prevMap.get(walk);
  }
  chain.reverse();

  return chain;
}

/**
 * Builds the connected Prenda UV1 V4/V5 road loop: Mercado <-> Centro UV1.
 */
export function buildMercadoCentroLoopWaypoints(): RoadWaypoint[] {
  const dataset = loadPrendaCartography();
  const mercadoStop = { x: 338.82, z: -11.78 };
  const centroTarget = CENTRO_TRAFFIC_LIGHT_POS;

  const forwardRaw = findShortestRoadPath(dataset.roads, mercadoStop, centroTarget);
  if (forwardRaw.length < 2) {
    return [
      { x: 338.82, z: -11.78, isStop: 'mercado' },
      { x: 250, z: -85 },
      { x: 151.8, z: 71.8 },
      { x: 15.4, z: 15.7, isStop: 'centro', isTrafficSignalStop: true },
      { x: 151.8, z: 71.8 },
      { x: 250, z: -85 },
    ];
  }

  const outbound: RoadWaypoint[] = forwardRaw.map((pt, idx) => ({
    x: pt.x,
    z: pt.z,
    ...(idx === 0 ? { isStop: 'mercado' as const } : {}),
    ...(idx === forwardRaw.length - 1
      ? { isStop: 'centro' as const, isTrafficSignalStop: true }
      : {}),
  }));

  // Return trip along the same OSM road centerline (right-hand lane offset is applied when rendering)
  const inbound: RoadWaypoint[] = [];
  for (let i = forwardRaw.length - 2; i >= 1; i--) {
    const pt = forwardRaw[i];
    const nearSignal = Math.hypot(pt.x - centroTarget.x, pt.z - centroTarget.z) < 28;
    inbound.push({
      x: pt.x,
      z: pt.z,
      ...(nearSignal ? { isTrafficSignalStop: true } : {}),
    });
  }

  return [...outbound, ...inbound];
}

/**
 * Steps a single NPC Candongueiro along the Mercado <-> Centro loop, pausing 3s at stops
 * and stopping on Red at the Centro traffic light.
 */
export function stepNpcCandongueiroRoute(
  state: NpcVehicleRouteState,
  waypoints: readonly RoadWaypoint[],
  lightPhase: 'green' | 'red',
  dt: number,
  sampleGroundY: (x: number, z: number) => number = groundHeightAt,
): NpcVehicleRouteState {
  if (waypoints.length < 2) return state;
  const clampedDt = Math.max(0.001, Math.min(0.1, dt));

  if (state.stopWaitRemainingSec > 0) {
    const nextWait = Math.max(0, state.stopWaitRemainingSec - clampedDt);
    return {
      ...state,
      speedMps: 0,
      stopWaitRemainingSec: nextWait,
      waitingAtRedLight: false,
    };
  }

  const targetIdx = state.waypointIndex % waypoints.length;
  const target = waypoints[targetIdx];

  // Check red light hold before entering Centro intersection zone
  const distToSignal = Math.hypot(
    CENTRO_TRAFFIC_LIGHT_POS.x - state.x,
    CENTRO_TRAFFIC_LIGHT_POS.z - state.z,
  );
  const targetIsSignalApproach =
    Math.hypot(target.x - CENTRO_TRAFFIC_LIGHT_POS.x, target.z - CENTRO_TRAFFIC_LIGHT_POS.z) < 20;

  if (lightPhase === 'red' && targetIsSignalApproach && distToSignal >= 6.5 && distToSignal <= 16.5) {
    return {
      ...state,
      speedMps: 0,
      waitingAtRedLight: true,
    };
  }

  const dx = target.x - state.x;
  const dz = target.z - state.z;
  const dist = Math.hypot(dx, dz);

  const yaw = dist > 0.05 ? Math.atan2(dx, dz) : state.yaw;
  const stepDist = NPC_CANDONGUEIRO_SPEED_MPS * clampedDt;

  if (dist <= stepDist + 0.6) {
    const nextIdx = (targetIdx + 1) % waypoints.length;
    const waitSec = target.isStop ? NPC_CANDONGUEIRO_STOP_WAIT_SECONDS : 0;
    const ny = sampleGroundY(target.x, target.z);
    return {
      ...state,
      x: target.x,
      y: ny,
      z: target.z,
      yaw,
      speedMps: waitSec > 0 ? 0 : NPC_CANDONGUEIRO_SPEED_MPS,
      waypointIndex: nextIdx,
      stopWaitRemainingSec: waitSec,
      waitingAtRedLight: false,
    };
  }

  const nx = state.x + (dx / dist) * stepDist;
  const nz = state.z + (dz / dist) * stepDist;
  const ny = sampleGroundY(nx, nz);

  return {
    ...state,
    x: nx,
    y: ny,
    z: nz,
    yaw,
    speedMps: NPC_CANDONGUEIRO_SPEED_MPS,
    waitingAtRedLight: false,
  };
}

interface SpawnedTrafficVehicle {
  route: NpcVehicleRouteState;
  readonly rootGroup: THREE.Group;
  readonly wheels: VehicleWheelRig;
  readonly clonedMaterials: THREE.Material[];
}

const NPC_TRAFFIC_SPECS: readonly {
  readonly id: string;
  readonly startWaypointIndex: number;
  readonly tintHex: number;
}[] = [
  { id: 'candongueiro-npc-1', startWaypointIndex: 3, tintHex: 0xbae6fd }, // Light sky Candongueiro
  { id: 'candongueiro-npc-2', startWaypointIndex: 28, tintHex: 0xfde68a }, // Warm cream/gold stripe tint
];

/**
 * Manages live Phase 8 Prenda road traffic: 2 looping NPC Candongueiros (using
 * candongueiro_low.glb) + functional Centro traffic light (10s green / 7s red)
 * + red-light violation detection (-50 Kz fine).
 */
export class TrafficManager {
  private lightState: TrafficLightState = createInitialTrafficLightState();
  private lightVisual: TrafficLightVisualHandle | null = null;
  private waypoints: RoadWaypoint[] = [];
  private vehicles: SpawnedTrafficVehicle[] = [];
  private disposed = false;
  private mountPromise: Promise<void> | null = null;
  private prevPlayerPos: { x: number; z: number } | null = null;
  private fineCooldownSec = 0;
  private fineBannerMessage: string | null = null;
  private fineBannerSec = 0;

  constructor(private readonly assetManager?: AssetManager) {
    this.waypoints = buildMercadoCentroLoopWaypoints();
  }

  async mountToScene(
    scene: THREE.Scene,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): Promise<void> {
    if (this.disposed) return;

    if (!this.lightVisual) {
      this.lightVisual = buildCentroTrafficLightVisual(sampleGroundY);
      this.lightVisual.updateSignal(this.lightState.phase);
    }
    if (this.lightVisual.group.parent !== scene) {
      scene.add(this.lightVisual.group);
    }

    if (!this.assetManager || this.vehicles.length > 0) {
      for (const v of this.vehicles) {
        if (v.rootGroup.parent !== scene) scene.add(v.rootGroup);
      }
      return;
    }

    if (this.mountPromise) return this.mountPromise;

    this.mountPromise = this.assetManager
      .loadGltfModel('vehicle-candongueiro-low', vehicleManifest.url)
      .then((gltf) => {
        if (this.disposed) return;
        for (const spec of NPC_TRAFFIC_SPECS.slice(0, MAX_NPC_CANDONGUEIROS)) {
          const idx = spec.startWaypointIndex % this.waypoints.length;
          const startWp = this.waypoints[idx];
          const nextIdx = (idx + 1) % this.waypoints.length;
          const nextWp = this.waypoints[nextIdx];
          const yaw = Math.atan2(nextWp.x - startWp.x, nextWp.z - startWp.z);
          const y = sampleGroundY(startWp.x, startWp.z);

          const modelClone = gltf.scene.clone(true);
          const clonedMaterials: THREE.Material[] = [];

          modelClone.traverse((node) => {
            if ((node as THREE.Mesh).isMesh) {
              const mesh = node as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              if (!mesh.name.startsWith('wheel-') && mesh.material) {
                const srcMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                if (srcMat && (srcMat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const clonedMat = (srcMat as THREE.MeshStandardMaterial).clone();
                  clonedMat.color.setHex(spec.tintHex);
                  mesh.material = clonedMat;
                  clonedMaterials.push(clonedMat);
                }
              }
            }
          });

          const wheels = resolveCandongueiroWheels(modelClone);
          const rootGroup = new THREE.Group();
          rootGroup.name = `Traffic_${spec.id}`;
          rootGroup.add(modelClone);
          rootGroup.position.set(startWp.x, y, startWp.z);
          rootGroup.rotation.set(0, yaw, 0);
          scene.add(rootGroup);

          this.vehicles.push({
            route: {
              id: spec.id,
              x: startWp.x,
              y,
              z: startWp.z,
              yaw,
              speedMps: NPC_CANDONGUEIRO_SPEED_MPS,
              waypointIndex: nextIdx,
              stopWaitRemainingSec: 0,
              waitingAtRedLight: false,
            },
            rootGroup,
            wheels,
            clonedMaterials,
          });
        }
        this.syncDomAttributes();
      })
      .finally(() => {
        this.mountPromise = null;
      });

    return this.mountPromise;
  }

  step(
    dt: number,
    playerPos: Vector3Like,
    isPlayerDriving: boolean,
    playerSpeedMps: number,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): { readonly finedAmountKz: number; readonly fineMessage: string | null } {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.1);
    this.lightState = stepTrafficLight(this.lightState, clampedDt);
    this.lightVisual?.updateSignal(this.lightState.phase);

    if (this.fineCooldownSec > 0) {
      this.fineCooldownSec = Math.max(0, this.fineCooldownSec - clampedDt);
    }
    if (this.fineBannerSec > 0) {
      this.fineBannerSec = Math.max(0, this.fineBannerSec - clampedDt);
      if (this.fineBannerSec === 0) {
        this.fineBannerMessage = null;
      }
    }

    let finedAmountKz = 0;
    if (this.prevPlayerPos) {
      const violated = detectRedLightViolation(
        this.prevPlayerPos,
        playerPos,
        isPlayerDriving,
        playerSpeedMps,
        this.lightState.phase,
        this.fineCooldownSec,
      );
      if (violated) {
        finedAmountKz = TRAFFIC_FINE_KZ;
        this.fineCooldownSec = 6.0;
        this.fineBannerMessage = TRAFFIC_FINE_MESSAGE;
        this.fineBannerSec = 4.5;
      }
    }
    this.prevPlayerPos = { x: playerPos.x, z: playerPos.z };

    for (const v of this.vehicles) {
      const prevYaw = v.route.yaw;
      v.route = stepNpcCandongueiroRoute(
        v.route,
        this.waypoints,
        this.lightState.phase,
        clampedDt,
        sampleGroundY,
      );
      v.rootGroup.position.set(v.route.x, v.route.y, v.route.z);
      v.rootGroup.rotation.set(0, v.route.yaw, 0);
      const steer = Math.max(-1, Math.min(1, (v.route.yaw - prevYaw) * 6));
      stepVehicleWheelVisuals(v.wheels, v.route.speedMps, steer, clampedDt);
    }

    this.syncDomAttributes();
    return {
      finedAmountKz,
      fineMessage: this.fineBannerMessage,
    };
  }

  getTrafficLightState(): TrafficLightState {
    return this.lightState;
  }

  getWaypoints(): readonly RoadWaypoint[] {
    return this.waypoints;
  }

  getNpcVehicleCount(): number {
    return this.vehicles.length;
  }

  getNpcVehiclesSnapshot(): readonly NpcVehicleRouteState[] {
    return this.vehicles.map((v) => v.route);
  }

  getFineBannerMessage(): string | null {
    return this.fineBannerMessage;
  }

  private syncDomAttributes(): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.trafficLight = this.lightState.phase;
    document.body.dataset.pedestrianLight = this.lightState.pedestrianLight;
    document.body.dataset.trafficVehicles = String(this.vehicles.length);
  }

  dispose(): void {
    this.disposed = true;
    this.lightVisual?.dispose();
    this.lightVisual = null;
    for (const v of this.vehicles) {
      v.rootGroup.removeFromParent();
      for (const m of v.clonedMaterials) m.dispose();
    }
    this.vehicles = [];
  }
}
