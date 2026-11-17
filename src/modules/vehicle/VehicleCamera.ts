/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Vector3Like } from '../../core/types';
import { groundHeightAt } from '../world/luandaCoordinates';

export const VEHICLE_CAMERA_DISTANCE = 8;
export const VEHICLE_CAMERA_HEIGHT = 4;
export const VEHICLE_CAMERA_LERP = 0.1;

export interface VehicleCameraPose {
  readonly position: Vector3Like;
  readonly target: Vector3Like;
}

/**
 * Computes the GTA-style third-person chase camera pose 8m behind and 4m above the Candongueiro.
 */
export function computeDesiredVehicleCameraPose(
  vehiclePos: Vector3Like,
  vehicleYaw: number,
  sampleGroundY: (x: number, z: number) => number = groundHeightAt,
): VehicleCameraPose {
  const sinY = Math.sin(vehicleYaw);
  const cosY = Math.cos(vehicleYaw);

  const camX = vehiclePos.x - sinY * VEHICLE_CAMERA_DISTANCE;
  const camZ = vehiclePos.z - cosY * VEHICLE_CAMERA_DISTANCE;
  const minClearY = sampleGroundY(camX, camZ) + 1.2;
  const camY = Math.max(minClearY, vehiclePos.y + VEHICLE_CAMERA_HEIGHT);

  return {
    position: { x: camX, y: camY, z: camZ },
    target: {
      x: vehiclePos.x + sinY * 1.8,
      y: vehiclePos.y + 1.35,
      z: vehiclePos.z + cosY * 1.8,
    },
  };
}

/**
 * Smoothly interpolates current chase camera position & look-at target using base lerp 0.1.
 * When `dt` is provided, normalizes around 60 Hz so lower-FPS mobile devices stay responsive.
 */
export function lerpVehicleCameraPose(
  currentPos: { x: number; y: number; z: number },
  currentTarget: { x: number; y: number; z: number },
  desired: VehicleCameraPose,
  lerpFactor = VEHICLE_CAMERA_LERP,
  dt?: number,
): VehicleCameraPose {
  const alpha =
    dt !== undefined
      ? Math.min(1, 1 - Math.pow(1 - lerpFactor, Math.max(dt, 0.001) * 60))
      : lerpFactor;

  currentPos.x += (desired.position.x - currentPos.x) * alpha;
  currentPos.y += (desired.position.y - currentPos.y) * alpha;
  currentPos.z += (desired.position.z - currentPos.z) * alpha;

  currentTarget.x += (desired.target.x - currentTarget.x) * alpha;
  currentTarget.y += (desired.target.y - currentTarget.y) * alpha;
  currentTarget.z += (desired.target.z - currentTarget.z) * alpha;

  return {
    position: { x: currentPos.x, y: currentPos.y, z: currentPos.z },
    target: { x: currentTarget.x, y: currentTarget.y, z: currentTarget.z },
  };
}
