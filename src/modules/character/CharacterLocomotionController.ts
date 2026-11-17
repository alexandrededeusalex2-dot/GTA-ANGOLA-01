/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type LocomotionState = 'idle' | 'walk' | 'run' | 'interact' | 'seated';

export interface CharacterLocomotionState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
  speed: number;
  locomotion: LocomotionState;
  idleWeight: number;
  walkWeight: number;
  runWeight: number;
  walkTimeScale: number;
  runTimeScale: number;
  stridePhase: number;
}

export interface LocomotionStepResult {
  readonly state: CharacterLocomotionState;
  readonly stepTriggered: boolean;
  readonly isMoving: boolean;
}

export const WALK_SPEED_MPS = 2.15;
export const RUN_SPEED_MPS = 5.25;
export const CHARACTER_COLLISION_RADIUS = 0.48;
export const CHARACTER_ACCEL_RATE = 11.5;
export const CHARACTER_DECEL_RATE = 14.5;
export const CHARACTER_TURN_RATE = 11.0;

const MOVE_DEADZONE = 0.06;
const WALK_REFERENCE_MPS = 2.15;
const RUN_REFERENCE_MPS = 5.25;
const BLEND_DAMP_RATE = 12.0;

export function normalizeAngle(rad: number): number {
  let a = rad;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function shortestAngleDiff(from: number, to: number): number {
  return normalizeAngle(to - from);
}

function dampValue(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

export function createInitialLocomotionState(
  x: number,
  y: number,
  z: number,
  yaw: number,
): CharacterLocomotionState {
  return {
    x,
    y,
    z,
    yaw: normalizeAngle(yaw),
    vx: 0,
    vz: 0,
    speed: 0,
    locomotion: 'idle',
    idleWeight: 1,
    walkWeight: 0,
    runWeight: 0,
    walkTimeScale: 1,
    runTimeScale: 1,
    stridePhase: 0,
  };
}

/**
 * Converts screen-relative stick/keyboard axes (moveX right, moveY forward)
 * and third-person camera yaw into a normalized world XZ direction vector.
 * Matches ThreeViewportController camera forward: (-sin(orbitYaw), -cos(orbitYaw)).
 */
export function computeCameraRelativeDirection(
  moveX: number,
  moveY: number,
  cameraYaw: number,
): { dirX: number; dirZ: number; magnitude: number } {
  const rawMag = Math.hypot(moveX, moveY);
  if (rawMag <= MOVE_DEADZONE) {
    return { dirX: 0, dirZ: 0, magnitude: 0 };
  }

  const clampedMag = Math.min(1, rawMag);
  const nx = moveX / rawMag;
  const ny = moveY / rawMag;

  const fwdX = -Math.sin(cameraYaw);
  const fwdZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);

  const dirX = fwdX * ny + rightX * nx;
  const dirZ = fwdZ * ny + rightZ * nx;
  const len = Math.hypot(dirX, dirZ) || 1;

  return {
    dirX: dirX / len,
    dirZ: dirZ / len,
    magnitude: clampedMag,
  };
}

/**
 * Pure frame-rate independent locomotion integrator with OBB collision resolution,
 * terrain grounding, shortest-arc yaw steering, and anti-foot-skating blend weights.
 */
export function stepCharacterLocomotion(
  prev: CharacterLocomotionState,
  input: { readonly moveX: number; readonly moveY: number; readonly sprint: boolean },
  cameraYaw: number,
  dt: number,
  resolveCollision: (x: number, z: number, radius: number) => { x: number; z: number },
  sampleGroundY: (x: number, z: number) => number,
): LocomotionStepResult {
  const safeDt = Math.min(Math.max(dt, 0.0005), 0.05);
  const { dirX, dirZ, magnitude } = computeCameraRelativeDirection(
    input.moveX,
    input.moveY,
    cameraYaw,
  );

  const maxSpeed = input.sprint ? RUN_SPEED_MPS : WALK_SPEED_MPS;
  const targetVx = dirX * maxSpeed * magnitude;
  const targetVz = dirZ * maxSpeed * magnitude;

  const rate = magnitude > 0 ? CHARACTER_ACCEL_RATE : CHARACTER_DECEL_RATE;
  const vx = dampValue(prev.vx, targetVx, rate, safeDt);
  const vz = dampValue(prev.vz, targetVz, rate, safeDt);

  const rawNextX = Math.max(-380, Math.min(380, prev.x + vx * safeDt));
  const rawNextZ = Math.max(-380, Math.min(380, prev.z + vz * safeDt));

  const resolved = resolveCollision(rawNextX, rawNextZ, CHARACTER_COLLISION_RADIUS);
  const actualDx = resolved.x - prev.x;
  const actualDz = resolved.z - prev.z;
  const actualSpeed = Math.hypot(actualDx, actualDz) / safeDt;
  const nextY = sampleGroundY(resolved.x, resolved.z);

  // Rotate character cleanly toward movement intent (or actual motion)
  let nextYaw = prev.yaw;
  if (magnitude > MOVE_DEADZONE) {
    // Model faces +Z when yaw === 0: forward = (sin(yaw), cos(yaw))
    const desiredYaw = Math.atan2(dirX, dirZ);
    const diff = shortestAngleDiff(prev.yaw, desiredYaw);
    const turnAlpha = 1 - Math.exp(-CHARACTER_TURN_RATE * safeDt);
    nextYaw = normalizeAngle(prev.yaw + diff * turnAlpha);
  }

  // Zero-foot-skating speed-matched blend targets
  const effectiveSpeed = actualSpeed < 0.08 ? 0 : actualSpeed;
  let targetIdleW = 1;
  let targetWalkW = 0;
  let targetRunW = 0;
  let locomotion: LocomotionState = 'idle';

  if (effectiveSpeed > 0.12) {
    if (effectiveSpeed <= WALK_REFERENCE_MPS + 0.35) {
      const t = Math.min(1, effectiveSpeed / WALK_REFERENCE_MPS);
      targetIdleW = 1 - t;
      targetWalkW = t;
      targetRunW = 0;
      locomotion = 'walk';
    } else {
      const t = Math.min(
        1,
        (effectiveSpeed - WALK_REFERENCE_MPS) / (RUN_REFERENCE_MPS - WALK_REFERENCE_MPS),
      );
      targetIdleW = 0;
      targetWalkW = 1 - t;
      targetRunW = t;
      locomotion = t >= 0.45 ? 'run' : 'walk';
    }
  }

  const idleWeight = dampValue(prev.idleWeight, targetIdleW, BLEND_DAMP_RATE, safeDt);
  const walkWeight = dampValue(prev.walkWeight, targetWalkW, BLEND_DAMP_RATE, safeDt);
  const runWeight = dampValue(prev.runWeight, targetRunW, BLEND_DAMP_RATE, safeDt);

  const weightSum = idleWeight + walkWeight + runWeight || 1;
  const normIdle = idleWeight / weightSum;
  const normWalk = walkWeight / weightSum;
  const normRun = runWeight / weightSum;

  const walkTimeScale = Math.max(0.55, Math.min(1.45, effectiveSpeed / WALK_REFERENCE_MPS || 0.75));
  const runTimeScale = Math.max(0.75, Math.min(1.25, effectiveSpeed / RUN_REFERENCE_MPS || 0.9));

  // Track stride phase for footstep cadence (2 steps per ~1.35m stride cycle)
  const strideFreq = locomotion === 'run' ? 2.85 : locomotion === 'walk' ? 1.85 : 0;
  const prevCycle = Math.floor(prev.stridePhase);
  const nextStridePhase =
    strideFreq > 0 ? prev.stridePhase + strideFreq * safeDt : prev.stridePhase;
  const stepTriggered = strideFreq > 0 && Math.floor(nextStridePhase) > prevCycle;

  return {
    state: {
      x: resolved.x,
      y: nextY,
      z: resolved.z,
      yaw: nextYaw,
      vx: actualSpeed < 0.05 && magnitude === 0 ? 0 : vx,
      vz: actualSpeed < 0.05 && magnitude === 0 ? 0 : vz,
      speed: effectiveSpeed,
      locomotion,
      idleWeight: normIdle,
      walkWeight: normWalk,
      runWeight: normRun,
      walkTimeScale,
      runTimeScale,
      stridePhase: nextStridePhase,
    },
    stepTriggered,
    isMoving: effectiveSpeed > 0.15,
  };
}
