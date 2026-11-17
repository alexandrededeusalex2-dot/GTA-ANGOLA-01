/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_COLLISION_RADIUS,
  computeCameraRelativeDirection,
  createInitialLocomotionState,
  RUN_SPEED_MPS,
  shortestAngleDiff,
  stepCharacterLocomotion,
  WALK_SPEED_MPS,
} from './CharacterLocomotionController';

const noCollision = (x: number, z: number) => ({ x, z });
const flatGround = () => 1.25;

test('computeCameraRelativeDirection maps stick axes to camera-relative world XZ', () => {
  // Camera yaw = 0 looks along -Z, right is +X
  const fwd = computeCameraRelativeDirection(0, 1, 0);
  assert.ok(Math.abs(fwd.dirX) < 1e-6);
  assert.ok(Math.abs(fwd.dirZ + 1) < 1e-6);
  assert.equal(fwd.magnitude, 1);

  const right = computeCameraRelativeDirection(1, 0, 0);
  assert.ok(Math.abs(right.dirX - 1) < 1e-6);
  assert.ok(Math.abs(right.dirZ) < 1e-6);

  // Small deadzone noise returns zero
  const dead = computeCameraRelativeDirection(0.02, -0.03, 0.5);
  assert.equal(dead.magnitude, 0);
});

test('shortestAngleDiff wraps smoothly across +/- PI boundary', () => {
  const diff = shortestAngleDiff(Math.PI - 0.1, -Math.PI + 0.1);
  assert.ok(Math.abs(diff - 0.2) < 1e-6);

  const diffNeg = shortestAngleDiff(-Math.PI + 0.1, Math.PI - 0.1);
  assert.ok(Math.abs(diffNeg + 0.2) < 1e-6);
});

test('stepCharacterLocomotion accelerates smoothly to walk and run speeds with grounding', () => {
  let state = createInitialLocomotionState(-4, 0, 12, 0);

  // Zero input keeps idle state and grounds Y
  const idleRes = stepCharacterLocomotion(
    state,
    { moveX: 0, moveY: 0, sprint: false },
    0,
    0.016,
    noCollision,
    flatGround,
  );
  assert.equal(idleRes.state.locomotion, 'idle');
  assert.equal(idleRes.state.y, 1.25);
  assert.ok(idleRes.state.idleWeight > 0.9);

  // Walk forward for 1.2s
  state = idleRes.state;
  for (let i = 0; i < 60; i++) {
    state = stepCharacterLocomotion(
      state,
      { moveX: 0, moveY: 1, sprint: false },
      0,
      0.02,
      noCollision,
      flatGround,
    ).state;
  }
  assert.equal(state.locomotion, 'walk');
  assert.ok(Math.abs(state.speed - WALK_SPEED_MPS) < 0.05);
  assert.ok(state.walkWeight > 0.92);
  assert.ok(state.z < 12, 'character moved along -Z camera forward');
  // Facing -Z means yaw is +/- PI
  assert.ok(Math.abs(Math.abs(state.yaw) - Math.PI) < 0.05);

  // Sprint for 1.2s
  for (let i = 0; i < 60; i++) {
    state = stepCharacterLocomotion(
      state,
      { moveX: 0, moveY: 1, sprint: true },
      0,
      0.02,
      noCollision,
      flatGround,
    ).state;
  }
  assert.equal(state.locomotion, 'run');
  assert.ok(Math.abs(state.speed - RUN_SPEED_MPS) < 0.08);
  assert.ok(state.runWeight > 0.92);
});

test('stepCharacterLocomotion prevents foot skating when blocked by a Prenda building', () => {
  let state = createInitialLocomotionState(0, 0, 0, Math.PI);
  const blockedCollision = (_x: number, _z: number, radius: number) => {
    assert.equal(radius, CHARACTER_COLLISION_RADIUS);
    return { x: 0, z: 0 }; // Hard wall blocks position
  };

  for (let i = 0; i < 20; i++) {
    state = stepCharacterLocomotion(
      state,
      { moveX: 0, moveY: 1, sprint: true },
      0,
      0.02,
      blockedCollision,
      flatGround,
    ).state;
  }

  assert.equal(state.x, 0);
  assert.equal(state.z, 0);
  assert.equal(state.speed, 0);
  assert.equal(state.locomotion, 'idle');
  assert.ok(state.idleWeight > 0.85);
});
