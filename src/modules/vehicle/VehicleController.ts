/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { Vector3Like } from '../../core/types';
import {
  resolveBuildingCollision2D,
  type LocalPoint2D,
  type PrendaBuildingRecord,
  type PrendaRoadSegment,
} from '../world/PrendaCartography';
import type { UrbanObstacleCircle } from '../world/PrendaUrbanPropsBuilder';
import { groundHeightAt } from '../world/luandaCoordinates';

export const VEHICLE_ENTER_DISTANCE_METERS = 2.5;
export const VEHICLE_MAX_SPEED_MPS = 8.0;
export const VEHICLE_TURN_SPEED_RAD_S = Math.PI / 2; // 90 deg/s
export const VEHICLE_ACCEL_MPS2 = 14.0;
export const VEHICLE_DECEL_MPS2 = 12.0;
export const VEHICLE_FORWARD_RAY_METERS = 2.0;
export const VEHICLE_BUMPER_HALF_LENGTH = 2.04;
export const VEHICLE_COLLIDER_RADIUS = 0.92;
export const VEHICLE_ROAD_SHOULDER_MARGIN = 3.0;
export const VEHICLE_WHEEL_RADIUS_METERS = 0.35;
export const VEHICLE_WHEEL_MAX_STEER_RAD = 0.45; // ~25.8 deg GTA SA front steer

export const VEHICLE_DRIVING_STATUS_LABEL = 'A conduzir - [E] sair';

export interface VehicleWheelRig {
  readonly frontLeft: THREE.Object3D | null;
  readonly frontRight: THREE.Object3D | null;
  readonly rearLeft: THREE.Object3D | null;
  readonly rearRight: THREE.Object3D | null;
  spinAngleRad: number;
  steerAngleRad: number;
}

export interface VehicleControlInput {
  readonly moveX: number;
  readonly moveY: number;
}

export interface VehicleArcadeState {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly speedMps: number;
  readonly isOccupied: boolean;
  readonly obstacleAhead: boolean;
}

export interface VehicleWorldQuery {
  readonly buildings: readonly PrendaBuildingRecord[];
  readonly obstacleCircles: readonly UrbanObstacleCircle[];
  readonly drivableRoads: readonly PrendaRoadSegment[];
  readonly sampleGroundY?: (x: number, z: number) => number;
}

export interface ForwardObstacleHit {
  readonly hit: boolean;
  readonly distanceMeters: number;
  readonly kind: 'building' | 'prop' | null;
}

function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function intersectRayCircle2D(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
  maxDist: number,
): number | null {
  const fx = ox - cx;
  const fz = oz - cz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - radius * radius;
  if (c <= 0) return 0; // Already inside expanded radius
  const disc = b * b - 4 * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) * 0.5;
  if (t >= 0 && t <= maxDist) return t;
  return null;
}

function intersectRayObb2D(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  obb: PrendaBuildingRecord['obb'],
  expandMargin: number,
  maxDist: number,
): number | null {
  const relX = ox - obb.centerX;
  const relZ = oz - obb.centerZ;
  const cosA = Math.cos(-obb.angleRad);
  const sinA = Math.sin(-obb.angleRad);

  const lOx = relX * cosA - relZ * sinA;
  const lOz = relX * sinA + relZ * cosA;
  const lDx = dx * cosA - dz * sinA;
  const lDz = dx * sinA + dz * cosA;

  const halfU = obb.length * 0.5 + expandMargin;
  const halfV = obb.width * 0.5 + expandMargin;

  let tMin = 0;
  let tMax = maxDist;

  // Slab X (length U)
  if (Math.abs(lDx) < 1e-6) {
    if (lOx < -halfU || lOx > halfU) return null;
  } else {
    let t1 = (-halfU - lOx) / lDx;
    let t2 = (halfU - lOx) / lDx;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  // Slab Z (width V)
  if (Math.abs(lDz) < 1e-6) {
    if (lOz < -halfV || lOz > halfV) return null;
  } else {
    let t1 = (-halfV - lOz) / lDz;
    let t2 = (halfV - lOz) / lDz;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin <= maxDist ? tMin : null;
}

/**
 * Casts a lightweight 2m ray from the vehicle bumper along the travel heading
 * to halt cleanly before buildings and trees/kiosks without heavy physics.
 */
export function raycastVehicleForwardObstacle(
  centerX: number,
  centerZ: number,
  yaw: number,
  directionSign: 1 | -1,
  buildings: readonly PrendaBuildingRecord[],
  obstacleCircles: readonly UrbanObstacleCircle[],
  rayLengthMeters = VEHICLE_FORWARD_RAY_METERS,
): ForwardObstacleHit {
  const dirX = Math.sin(yaw) * directionSign;
  const dirZ = Math.cos(yaw) * directionSign;

  const bumperOriginX = centerX + dirX * VEHICLE_BUMPER_HALF_LENGTH;
  const bumperOriginZ = centerZ + dirZ * VEHICLE_BUMPER_HALF_LENGTH;
  const sweepHalfWidth = 0.78;

  let closest = Infinity;
  let kind: 'building' | 'prop' | null = null;

  for (const b of buildings) {
    const reach =
      Math.hypot(b.obb.length * 0.5, b.obb.width * 0.5) + rayLengthMeters + sweepHalfWidth + 1.0;
    if (
      Math.abs(bumperOriginX - b.obb.centerX) > reach ||
      Math.abs(bumperOriginZ - b.obb.centerZ) > reach
    ) {
      continue;
    }
    const t = intersectRayObb2D(
      bumperOriginX,
      bumperOriginZ,
      dirX,
      dirZ,
      b.obb,
      sweepHalfWidth,
      rayLengthMeters,
    );
    if (t !== null && t < closest) {
      closest = t;
      kind = 'building';
    }
  }

  for (const c of obstacleCircles) {
    const reach = c.radius + rayLengthMeters + sweepHalfWidth + 0.5;
    if (Math.abs(bumperOriginX - c.x) > reach || Math.abs(bumperOriginZ - c.z) > reach) {
      continue;
    }
    const t = intersectRayCircle2D(
      bumperOriginX,
      bumperOriginZ,
      dirX,
      dirZ,
      c.x,
      c.z,
      c.radius + sweepHalfWidth,
      rayLengthMeters,
    );
    if (t !== null && t < closest) {
      closest = t;
      kind = 'prop';
    }
  }

  if (kind !== null && closest <= rayLengthMeters) {
    return { hit: true, distanceMeters: closest, kind };
  }

  return { hit: false, distanceMeters: rayLengthMeters, kind: null };
}

function resolveCircleObstacles2D(
  x: number,
  z: number,
  radius: number,
  circles: readonly UrbanObstacleCircle[],
): LocalPoint2D {
  let outX = x;
  let outZ = z;
  for (const c of circles) {
    const minDist = radius + c.radius;
    const dx = outX - c.x;
    const dz = outZ - c.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = minDist - dist;
        outX += (dx / dist) * push;
        outZ += (dz / dist) * push;
      } else {
        outX += minDist;
      }
    }
  }
  return { x: outX, z: outZ };
}

/**
 * Keeps the Candongueiro inside the connected UV1 V3-V6 road corridor (+ curb shoulder)
 * so players can drive smoothly across intersections without leaving the urban road network.
 */
export function constrainVehicleToDrivableCorridor(
  x: number,
  z: number,
  drivableRoads: readonly PrendaRoadSegment[],
  extraMarginMeters = VEHICLE_ROAD_SHOULDER_MARGIN,
): LocalPoint2D {
  if (drivableRoads.length === 0) return { x, z };

  let bestOverflow = Infinity;
  let bestClampX = x;
  let bestClampZ = z;

  for (const road of drivableRoads) {
    const allowedHalfWidth = road.widthMeters * 0.5 + extraMarginMeters;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const lenSq = vx * vx + vz * vz;
      const t = lenSq > 0 ? clamp(((x - a.x) * vx + (z - a.z) * vz) / lenSq, 0, 1) : 0;
      const px = a.x + t * vx;
      const pz = a.z + t * vz;
      const dx = x - px;
      const dz = z - pz;
      const dist = Math.hypot(dx, dz);
      const overflow = dist - allowedHalfWidth;
      if (overflow <= 0) {
        return { x, z };
      }
      if (overflow < bestOverflow) {
        bestOverflow = overflow;
        const scale = allowedHalfWidth / dist;
        bestClampX = px + dx * scale;
        bestClampZ = pz + dz * scale;
      }
    }
  }

  return { x: bestClampX, z: bestClampZ };
}

/**
 * Checks if player is within 2.5m enter distance of the parked Candongueiro.
 */
export function canEnterVehicleAtDistance(
  playerPos: Vector3Like,
  vehiclePos: { readonly x: number; readonly z: number },
  maxDistanceMeters = VEHICLE_ENTER_DISTANCE_METERS,
): boolean {
  return Math.hypot(playerPos.x - vehiclePos.x, playerPos.z - vehiclePos.z) <= maxDistanceMeters;
}

/**
 * Computes a clear dismount point beside the Candongueiro door upon exiting with [E] or [F].
 */
export function computeVehicleExitPosition(
  vehiclePos: { readonly x: number; readonly z: number },
  vehicleYaw: number,
  resolveCollision: (x: number, z: number, radius: number) => LocalPoint2D,
  sampleGroundY: (x: number, z: number) => number = groundHeightAt,
): Vector3Like {
  const cosY = Math.cos(vehicleYaw);
  const sinY = Math.sin(vehicleYaw);

  // Side offsets (+X right curb / -X left door) then rear/front fallback
  const candidates: readonly { readonly lx: number; readonly lz: number }[] = [
    { lx: -1.85, lz: 0.35 },
    { lx: 1.85, lz: 0.35 },
    { lx: 0, lz: -2.9 },
    { lx: 0, lz: 2.9 },
  ];

  for (const cand of candidates) {
    const wx = vehiclePos.x + cand.lx * cosY + cand.lz * sinY;
    const wz = vehiclePos.z - cand.lx * sinY + cand.lz * cosY;
    const resolved = resolveCollision(wx, wz, 0.48);
    if (Math.hypot(resolved.x - wx, resolved.z - wz) < 0.35) {
      return { x: resolved.x, y: sampleGroundY(resolved.x, resolved.z), z: resolved.z };
    }
  }

  const fallbackX = vehiclePos.x - 1.85 * cosY;
  const fallbackZ = vehiclePos.z + 1.85 * sinY;
  const resolved = resolveCollision(fallbackX, fallbackZ, 0.48);
  return { x: resolved.x, y: sampleGroundY(resolved.x, resolved.z), z: resolved.z };
}

/**
 * Steps arcade driving (translate + rotateY, 8 m/s max, 90 deg/s turn, 2m forward obstacle raycast,
 * and UV1 road corridor guardrail). Zero Rapier / Ammo / drift / wheel physics.
 */
export function stepVehicleArcadeControl(
  state: VehicleArcadeState,
  input: VehicleControlInput,
  dt: number,
  world: VehicleWorldQuery,
): VehicleArcadeState {
  if (!state.isOccupied) return state;

  const clampedDt = clamp(dt, 0.001, 0.05);
  const throttle = Math.abs(input.moveY) > 0.05 ? clamp(input.moveY, -1, 1) : 0;
  const steer = Math.abs(input.moveX) > 0.05 ? clamp(input.moveX, -1, 1) : 0;

  let speedMps = state.speedMps;
  if (throttle !== 0) {
    const targetSpeed = throttle * VEHICLE_MAX_SPEED_MPS;
    const rate =
      Math.sign(targetSpeed) !== Math.sign(speedMps) && Math.abs(speedMps) > 0.1
        ? VEHICLE_ACCEL_MPS2 * 1.6
        : VEHICLE_ACCEL_MPS2;
    const delta = targetSpeed - speedMps;
    const maxStep = rate * clampedDt;
    speedMps += clamp(delta, -maxStep, maxStep);
  } else {
    const coastStep = VEHICLE_DECEL_MPS2 * clampedDt;
    if (Math.abs(speedMps) <= coastStep) {
      speedMps = 0;
    } else {
      speedMps -= Math.sign(speedMps) * coastStep;
    }
  }

  // Arcade Y rotation (90 deg/s)
  const yaw = normalizeAngle(state.yaw - steer * VEHICLE_TURN_SPEED_RAD_S * clampedDt);

  // 2m raycast ahead in current travel direction to stop cleanly before buildings / trees
  const travelSign: 1 | -1 = speedMps >= 0 ? 1 : -1;
  const rayHit = raycastVehicleForwardObstacle(
    state.x,
    state.z,
    yaw,
    travelSign,
    world.buildings,
    world.obstacleCircles,
    VEHICLE_FORWARD_RAY_METERS,
  );

  let nextX = state.x;
  let nextZ = state.z;
  let obstacleAhead = false;

  if (rayHit.hit && Math.abs(speedMps) > 0.02) {
    // Allow nudging only up to safe bumper buffer (~0.35m), stop before penetrating
    if (rayHit.distanceMeters <= 0.35) {
      speedMps = 0;
      obstacleAhead = true;
    } else {
      const stepDist = Math.min(Math.abs(speedMps) * clampedDt, rayHit.distanceMeters - 0.3);
      nextX += Math.sin(yaw) * travelSign * stepDist;
      nextZ += Math.cos(yaw) * travelSign * stepDist;
      if (rayHit.distanceMeters < 1.0) {
        obstacleAhead = true;
      }
    }
  } else {
    nextX += Math.sin(yaw) * speedMps * clampedDt;
    nextZ += Math.cos(yaw) * speedMps * clampedDt;
  }

  // Secondary OBB + prop collision + road corridor check
  const afterBuildings = resolveBuildingCollision2D(
    nextX,
    nextZ,
    VEHICLE_COLLIDER_RADIUS,
    world.buildings,
  );
  const afterProps = resolveCircleObstacles2D(
    afterBuildings.x,
    afterBuildings.z,
    VEHICLE_COLLIDER_RADIUS,
    world.obstacleCircles,
  );
  const clampedRoad = constrainVehicleToDrivableCorridor(
    afterProps.x,
    afterProps.z,
    world.drivableRoads,
  );

  if (
    Math.hypot(clampedRoad.x - nextX, clampedRoad.z - nextZ) > 0.05 &&
    Math.abs(speedMps) > 0.1
  ) {
    speedMps *= 0.5;
  }

  const sampleY = world.sampleGroundY ?? groundHeightAt;
  const nextY = sampleY(clampedRoad.x, clampedRoad.z);

  return {
    x: clampedRoad.x,
    y: nextY,
    z: clampedRoad.z,
    yaw,
    speedMps,
    isOccupied: true,
    obstacleAhead,
  };
}

interface WheelCandidate {
  readonly mesh: THREE.Mesh;
  readonly localCenter: THREE.Vector3;
  readonly lowestFirstScore: number;
}

function getMeshLocalCenterInRoot(root: THREE.Object3D, mesh: THREE.Mesh): THREE.Vector3 {
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  const center = new THREE.Vector3();
  if (box && !box.isEmpty()) {
    box.getCenter(center);
  }
  mesh.localToWorld(center);
  root.worldToLocal(center);
  return center;
}

function assignQuadrantsSpatially(
  candidates: readonly WheelCandidate[],
): Pick<VehicleWheelRig, 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'> {
  if (candidates.length === 0) {
    return { frontLeft: null, frontRight: null, rearLeft: null, rearRight: null };
  }

  let avgX = 0;
  let avgZ = 0;
  for (const c of candidates) {
    avgX += c.localCenter.x;
    avgZ += c.localCenter.z;
  }
  avgX /= candidates.length;
  avgZ /= candidates.length;

  let frontLeft: THREE.Object3D | null = null;
  let frontRight: THREE.Object3D | null = null;
  let rearLeft: THREE.Object3D | null = null;
  let rearRight: THREE.Object3D | null = null;

  const sortedByZ = [...candidates].sort((a, b) => b.localCenter.z - a.localCenter.z);
  const frontPair = sortedByZ.slice(0, 2).sort((a, b) => b.localCenter.x - a.localCenter.x);
  const rearPair = sortedByZ.slice(2, 4).sort((a, b) => b.localCenter.x - a.localCenter.x);

  if (frontPair[0]) frontLeft = frontPair[0].mesh;
  if (frontPair[1]) frontRight = frontPair[1].mesh;
  if (rearPair[0]) rearLeft = rearPair[0].mesh;
  if (rearPair[1]) rearRight = rearPair[1].mesh;

  // Preserve side clarity when fewer than 4 wheels exist
  if (candidates.length < 4) {
    frontLeft = null;
    frontRight = null;
    rearLeft = null;
    rearRight = null;
    for (const c of candidates) {
      const isFront = c.localCenter.z >= avgZ;
      const isLeft = c.localCenter.x >= avgX;
      if (isFront && isLeft && !frontLeft) frontLeft = c.mesh;
      else if (isFront && !isLeft && !frontRight) frontRight = c.mesh;
      else if (!isFront && isLeft && !rearLeft) rearLeft = c.mesh;
      else if (!isFront && !isLeft && !rearRight) rearRight = c.mesh;
    }
  }

  return { frontLeft, frontRight, rearLeft, rearRight };
}

function classifyNamedWheelSlot(
  name: string,
): 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight' | null {
  const normalized = name.toLowerCase();
  if (/wheel[_-]?fl\b|front[_-]?left|\bfl\b/.test(normalized)) return 'frontLeft';
  if (/wheel[_-]?fr\b|front[_-]?right|\bfr\b/.test(normalized)) return 'frontRight';
  if (/wheel[_-]?rl\b|(?:rear|back)[_-]?left|\brl\b/.test(normalized)) return 'rearLeft';
  if (/wheel[_-]?rr\b|(?:rear|back)[_-]?right|\brr\b/.test(normalized)) return 'rearRight';
  return null;
}

/**
 * Finds the 4 modeled wheels on a loaded Candongueiro GLB scene by name
 * (`wheel` / `Wheel_FL` / `FR` / `RL` / `RR`) or falls back to the 4 lowest
 * and outermost meshes in vehicle-local space.
 */
export function resolveCandongueiroWheels(root: THREE.Object3D): VehicleWheelRig {
  root.updateMatrixWorld(true);

  const allMeshes: WheelCandidate[] = [];
  root.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      const localCenter = getMeshLocalCenterInRoot(root, mesh);
      const radialXZ = Math.hypot(localCenter.x, localCenter.z);
      // Lower center Y and larger horizontal corner distance receive lower scores.
      const lowestFirstScore = localCenter.y - radialXZ * 0.5;
      allMeshes.push({ mesh, localCenter, lowestFirstScore });
    }
  });

  const namedWheelCandidates = allMeshes.filter((c) =>
    /wheel|roda|\b(fl|fr|rl|rr)\b|_(fl|fr|rl|rr)$/i.test(c.mesh.name),
  );

  let assigned: Pick<VehicleWheelRig, 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight'> = {
    frontLeft: null,
    frontRight: null,
    rearLeft: null,
    rearRight: null,
  };

  if (namedWheelCandidates.length >= 4) {
    const picked = [...namedWheelCandidates]
      .sort((a, b) => a.lowestFirstScore - b.lowestFirstScore)
      .slice(0, 4);

    const byName: Record<'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight', THREE.Object3D | null> =
      {
        frontLeft: null,
        frontRight: null,
        rearLeft: null,
        rearRight: null,
      };
    let explicitCount = 0;

    for (const cand of picked) {
      const slot = classifyNamedWheelSlot(cand.mesh.name);
      if (slot && !byName[slot]) {
        byName[slot] = cand.mesh;
        explicitCount += 1;
      }
    }

    assigned = explicitCount === 4 ? byName : assignQuadrantsSpatially(picked);
  } else if (allMeshes.length >= 4) {
    const lowestOutermost = [...allMeshes]
      .sort((a, b) => a.lowestFirstScore - b.lowestFirstScore)
      .slice(0, 4);
    assigned = assignQuadrantsSpatially(lowestOutermost);
  } else {
    assigned = assignQuadrantsSpatially(allMeshes);
  }

  for (const wheel of [assigned.frontLeft, assigned.frontRight, assigned.rearLeft, assigned.rearRight]) {
    if (wheel) {
      wheel.rotation.order = 'YXZ';
    }
  }

  return {
    frontLeft: assigned.frontLeft,
    frontRight: assigned.frontRight,
    rearLeft: assigned.rearLeft,
    rearRight: assigned.rearRight,
    spinAngleRad: 0,
    steerAngleRad: 0,
  };
}

/**
 * Converts vehicle input axis `moveX` (-1 left A, +1 right D) into normalized
 * wheel steer direction (+1 left +Y yaw, -1 right -Y yaw).
 */
export function computeWheelSteerInput(moveX: number): number {
  if (Math.abs(moveX) <= 0.05) return 0;
  return -clamp(moveX, -1, 1);
}

/**
 * Animates the 4 wheels in GTA SA style:
 * - Rolling spin around X proportional to `(speed / 0.35) * dt` (frozen when stopped)
 * - Front wheel steering around Y (`steering * 0.45` rad)
 * - Rear wheels strictly locked at `rotation.y = 0`
 */
export function stepVehicleWheelVisuals(
  wheels: VehicleWheelRig,
  speedMps: number,
  steering: number,
  dt: number,
): void {
  const steerYaw = clamp(steering, -1, 1) * VEHICLE_WHEEL_MAX_STEER_RAD;
  wheels.steerAngleRad = steerYaw;

  const isMoving = Math.abs(speedMps) > 1e-3 && dt > 0;
  const spinDelta = isMoving ? (speedMps / VEHICLE_WHEEL_RADIUS_METERS) * dt : 0;
  wheels.spinAngleRad += spinDelta;

  const frontWheels = [wheels.frontLeft, wheels.frontRight];
  for (const wheel of frontWheels) {
    if (!wheel) continue;
    wheel.rotation.order = 'YXZ';
    if (isMoving) {
      wheel.rotation.x += spinDelta;
    }
    wheel.rotation.y = steerYaw;
  }

  const rearWheels = [wheels.rearLeft, wheels.rearRight];
  for (const wheel of rearWheels) {
    if (!wheel) continue;
    wheel.rotation.order = 'YXZ';
    if (isMoving) {
      wheel.rotation.x += spinDelta;
    }
    wheel.rotation.y = 0;
  }
}
