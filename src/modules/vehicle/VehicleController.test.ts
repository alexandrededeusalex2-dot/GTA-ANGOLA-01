/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadPrendaCartography } from '../world/PrendaCartography';
import {
  VEHICLE_CAMERA_DISTANCE,
  VEHICLE_CAMERA_HEIGHT,
  VEHICLE_CAMERA_LERP,
  computeDesiredVehicleCameraPose,
  lerpVehicleCameraPose,
} from './VehicleCamera';
import {
  VEHICLE_MAX_SPEED_MPS,
  VEHICLE_TURN_SPEED_RAD_S,
  VEHICLE_WHEEL_MAX_STEER_RAD,
  VEHICLE_WHEEL_RADIUS_METERS,
  computeWheelSteerInput,
  constrainVehicleToDrivableCorridor,
  raycastVehicleForwardObstacle,
  resolveCandongueiroWheels,
  stepVehicleArcadeControl,
  stepVehicleWheelVisuals,
  type VehicleArcadeState,
} from './VehicleController';

test('VehicleController enforces 8m/s max, 90deg/s Y steer, 2m obstacle raycast, and UV1 road bounds', () => {
  const dataset = loadPrendaCartography();
  const drivableRoads = dataset.roads.filter((r) => r.system7v !== 'V7');

  let state: VehicleArcadeState = {
    x: 338.82,
    y: 0.4,
    z: -11.78,
    yaw: 1.234549,
    speedMps: 0,
    isOccupied: true,
    obstacleAhead: false,
  };

  // Accelerate along V5 road without leaving corridor, verify max speed cap <= 8 m/s
  for (let i = 0; i < 30; i++) {
    state = stepVehicleArcadeControl(
      state,
      { moveX: 0, moveY: 1 },
      0.04,
      { buildings: dataset.buildings, obstacleCircles: [], drivableRoads },
    );
  }
  assert.ok(state.speedMps > 6.5 && state.speedMps <= VEHICLE_MAX_SPEED_MPS + 1e-6);
  const clampedCheck = constrainVehicleToDrivableCorridor(state.x, state.z, drivableRoads);
  assert.equal(clampedCheck.x, state.x);
  assert.equal(clampedCheck.z, state.z);

  // Rotate Y at 90 deg/s cleanly (steered for 0.5s => ~45 deg)
  const startYaw = state.yaw;
  for (let i = 0; i < 10; i++) {
    state = stepVehicleArcadeControl(
      state,
      { moveX: -1, moveY: 0 },
      0.05,
      { buildings: [], obstacleCircles: [], drivableRoads: [] },
    );
  }
  const deltaYaw = Math.abs(state.yaw - startYaw);
  assert.ok(Math.abs(deltaYaw - VEHICLE_TURN_SPEED_RAD_S * 0.5) < 0.05);

  // 2m forward raycast detects tree/kiosk directly ahead and halts speed
  const treeHit = raycastVehicleForwardObstacle(
    0,
    0,
    0,
    1,
    [],
    [{ x: 0, z: 3.1, radius: 0.6 }],
  );
  assert.equal(treeHit.hit, true);
  assert.equal(treeHit.kind, 'prop');
  assert.ok(treeHit.distanceMeters <= 2.0);
});

test('VehicleCamera tracks 8m behind, 4m above vehicle and interpolates smoothly at lerp 0.1', () => {
  const vehiclePos = { x: 10, y: 0.5, z: -20 };
  const yaw = 0; // Facing +Z
  const desired = computeDesiredVehicleCameraPose(vehiclePos, yaw, () => 0.5);

  assert.equal(desired.position.x, 10);
  assert.equal(desired.position.y, 0.5 + VEHICLE_CAMERA_HEIGHT);
  assert.equal(desired.position.z, -20 - VEHICLE_CAMERA_DISTANCE);
  assert.ok(desired.target.z > -20);

  const camPos = { x: 0, y: 10, z: 0 };
  const camTarget = { x: 0, y: 0, z: 0 };
  lerpVehicleCameraPose(camPos, camTarget, desired, VEHICLE_CAMERA_LERP);

  // 10% progress per step on deterministic 0.1 lerp
  assert.ok(Math.abs(camPos.x - desired.position.x * 0.1) < 1e-6);
  assert.ok(Math.abs(camPos.z - desired.position.z * 0.1) < 1e-6);
});

function makeDummyMesh(name: string, x: number, y: number, z: number): THREE.Mesh {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([-0.1, -0.35, -0.35, 0.1, 0.35, 0.35]), 3),
  );
  const mesh = new THREE.Mesh(geom);
  mesh.name = name;
  mesh.position.set(x, y, z);
  return mesh;
}

test('WheelSteering finds 4 wheels (by name or lowest/outermost), spins X proportional to speed/0.35, and steers front ±0.45 rad with rear=0', () => {
  // 1. Resolve by explicit GLB wheel names (candongueiro_low.glb pattern & Wheel_FL pattern)
  const namedGroup = new THREE.Group();
  namedGroup.add(
    makeDummyMesh('body', 0, 1.1, 0),
    makeDummyMesh('wheel-front-left', 0.345, 0.366, 1.125),
    makeDummyMesh('wheel-front-right', -0.345, 0.366, 1.125),
    makeDummyMesh('wheel-back-left', 0.345, 0.366, -1.125),
    makeDummyMesh('wheel-back-right', -0.345, 0.366, -1.125),
  );
  const namedRig = resolveCandongueiroWheels(namedGroup);
  assert.equal(namedRig.frontLeft?.name, 'wheel-front-left');
  assert.equal(namedRig.frontRight?.name, 'wheel-front-right');
  assert.equal(namedRig.rearLeft?.name, 'wheel-back-left');
  assert.equal(namedRig.rearRight?.name, 'wheel-back-right');
  assert.equal(namedRig.frontLeft?.rotation.order, 'YXZ');

  // 2. Fallback resolution by 4 lowest and outermost meshes when unnamed
  const fallbackGroup = new THREE.Group();
  fallbackGroup.add(
    makeDummyMesh('chassis', 0, 1.0, 0),
    makeDummyMesh('roof', 0, 1.8, 0),
    makeDummyMesh('corner_a', 0.7, 0.35, 1.1),
    makeDummyMesh('corner_b', -0.7, 0.35, 1.1),
    makeDummyMesh('corner_c', 0.7, 0.35, -1.1),
    makeDummyMesh('corner_d', -0.7, 0.35, -1.1),
  );
  const fallbackRig = resolveCandongueiroWheels(fallbackGroup);
  assert.equal(fallbackRig.frontLeft?.name, 'corner_a');
  assert.equal(fallbackRig.frontRight?.name, 'corner_b');
  assert.equal(fallbackRig.rearLeft?.name, 'corner_c');
  assert.equal(fallbackRig.rearRight?.name, 'corner_d');

  // 3. Spin on X: (speed / 0.35) * dt while moving, frozen when stopped
  const expectedSpin = (7.0 / VEHICLE_WHEEL_RADIUS_METERS) * 0.05; // 1.0 rad
  stepVehicleWheelVisuals(namedRig, 7.0, computeWheelSteerInput(-1), 0.05); // W + A (left)
  assert.ok(Math.abs((namedRig.frontLeft?.rotation.x ?? 0) - expectedSpin) < 1e-6);
  assert.ok(Math.abs((namedRig.rearRight?.rotation.x ?? 0) - expectedSpin) < 1e-6);

  // Front wheels steer +0.45 rad when turning left (A -> moveX=-1 -> steering=+1)
  assert.ok(Math.abs((namedRig.frontLeft?.rotation.y ?? 0) - VEHICLE_WHEEL_MAX_STEER_RAD) < 1e-6);
  assert.ok(Math.abs((namedRig.frontRight?.rotation.y ?? 0) - VEHICLE_WHEEL_MAX_STEER_RAD) < 1e-6);
  // Rear wheels always rotation.y === 0
  assert.equal(namedRig.rearLeft?.rotation.y, 0);
  assert.equal(namedRig.rearRight?.rotation.y, 0);

  // Turning right (D -> moveX=+1 -> steering=-1) steers front wheels -0.45 rad
  stepVehicleWheelVisuals(namedRig, 7.0, computeWheelSteerInput(1), 0.05);
  assert.ok(
    Math.abs((namedRig.frontLeft?.rotation.y ?? 0) - -VEHICLE_WHEEL_MAX_STEER_RAD) < 1e-6,
  );
  assert.ok(
    Math.abs((namedRig.frontRight?.rotation.y ?? 0) - -VEHICLE_WHEEL_MAX_STEER_RAD) < 1e-6,
  );
  assert.equal(namedRig.rearLeft?.rotation.y, 0);
  assert.equal(namedRig.rearRight?.rotation.y, 0);

  // Stopped (speed = 0): wheels do not spin on X
  const spinBeforeStop = namedRig.frontLeft?.rotation.x ?? 0;
  stepVehicleWheelVisuals(namedRig, 0, 0, 0.05);
  assert.equal(namedRig.frontLeft?.rotation.x, spinBeforeStop);
  assert.equal(namedRig.rearRight?.rotation.x, spinBeforeStop);
  assert.equal(namedRig.frontLeft?.rotation.y, 0);
});
