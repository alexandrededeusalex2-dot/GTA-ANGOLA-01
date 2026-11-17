/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EconomyEngine } from '../economy/EconomyEngine';
import { MAX_LIGHTWEIGHT_NPCS } from '../npc/NpcEngine';
import {
  computeMiniMapArrowAngleRad,
  MINIMAP_SIZE_PX,
  MINIMAP_UPDATE_INTERVAL_MS,
  projectWorldToMiniMap,
} from '../ui/MiniMap';
import {
  cancelPrendaExpressMission,
  createInitialMissionState,
  createMissionWaypointSprite,
  PRENDA_CENTRO_TARGET,
  PRENDA_EXPRESS_COMPLETE_MESSAGE,
  PRENDA_EXPRESS_HAND_WAVE_SECONDS,
  PRENDA_EXPRESS_REWARD_KZ,
  PRENDA_EXPRESS_START_MESSAGE,
  PRENDA_EXPRESS_WAYPOINT_HEIGHT_METERS,
  startPrendaExpressMission,
  stepPrendaExpressMission,
} from './MissionManager';

const MERCADO_STOP_POS = { x: 338.82, z: -11.78 };

test('Prenda Express starts upon entering Candongueiro and waves before boarding passenger', () => {
  const initial = createInitialMissionState(MERCADO_STOP_POS, PRENDA_CENTRO_TARGET);
  assert.equal(initial.status, 'idle');
  assert.equal(initial.distanceMeters, 344);

  const started = startPrendaExpressMission(initial, MERCADO_STOP_POS);
  assert.equal(started.justStarted, true);
  assert.equal(started.state.status, 'boarding');
  assert.equal(started.state.bannerMessage, PRENDA_EXPRESS_START_MESSAGE);
  assert.equal(started.state.distanceMeters, 344);

  // Mid-wave: still boarding
  const mid = stepPrendaExpressMission(started.state, 0.4, MERCADO_STOP_POS, true);
  assert.equal(mid.state.status, 'boarding');
  assert.equal(mid.passengerShouldBoard, false);

  // After hand-raise duration: passenger boards (invisible) and mission is active
  const boarded = stepPrendaExpressMission(
    mid.state,
    PRENDA_EXPRESS_HAND_WAVE_SECONDS,
    MERCADO_STOP_POS,
    true,
  );
  assert.equal(boarded.state.status, 'active');
  assert.equal(boarded.passengerShouldBoard, true);
  assert.equal(boarded.state.passengerBoarded, true);
  assert.equal(boarded.justCompleted, false);
});

test('Prenda Express completes within <10m of Centro UV1 and awards +100 Kz', () => {
  const economy = new EconomyEngine();
  economy.init();
  assert.equal(economy.getBalanceAoa(), 0);

  let state = startPrendaExpressMission(
    createInitialMissionState(MERCADO_STOP_POS, PRENDA_CENTRO_TARGET),
    MERCADO_STOP_POS,
  ).state;

  // Board passenger
  state = stepPrendaExpressMission(state, 1.0, MERCADO_STOP_POS, true).state;
  assert.equal(state.status, 'active');

  // Even after long idle cruise (never fails / no timer), mission stays active
  const cruising = stepPrendaExpressMission(state, 10.0, { x: 120, z: 5 }, true);
  assert.equal(cruising.state.status, 'active');
  assert.equal(cruising.justCompleted, false);

  // Arrival < 10m at Centro UV1 (-4, 12)
  const arrival = stepPrendaExpressMission(
    cruising.state,
    0.016,
    { x: PRENDA_CENTRO_TARGET.x + 6.5, z: PRENDA_CENTRO_TARGET.z - 2.0 },
    true,
  );
  assert.equal(arrival.justCompleted, true);
  assert.equal(arrival.state.status, 'completed');
  assert.equal(arrival.state.bannerMessage, PRENDA_EXPRESS_COMPLETE_MESSAGE);
  assert.equal(arrival.state.rewardAwardedKz, PRENDA_EXPRESS_REWARD_KZ);

  const newBalance = economy.awardKwanza(arrival.state.rewardAwardedKz, 'Prenda Express');
  assert.equal(newBalance, 100);
});

test('Prenda Express can be cancelled cleanly and restarted on next entry', () => {
  const started = startPrendaExpressMission(
    createInitialMissionState(MERCADO_STOP_POS, PRENDA_CENTRO_TARGET),
    MERCADO_STOP_POS,
  ).state;

  const cancelled = cancelPrendaExpressMission(started);
  assert.equal(cancelled.wasActive, true);
  assert.equal(cancelled.state.status, 'cancelled');
  assert.equal(cancelled.state.bannerMessage, null);

  const restarted = startPrendaExpressMission(cancelled.state, MERCADO_STOP_POS);
  assert.equal(restarted.justStarted, true);
  assert.equal(restarted.state.status, 'boarding');
});

test('3D Centro waypoint marker uses lightweight THREE.Sprite at 30m height (no Box/Cylinder)', () => {
  const groundY = 0.25;
  const marker = createMissionWaypointSprite(
    PRENDA_CENTRO_TARGET.x,
    PRENDA_CENTRO_TARGET.z,
    groundY,
  );
  assert.equal(marker.sprite instanceof THREE.Sprite, true);
  assert.equal(marker.sprite.position.x, PRENDA_CENTRO_TARGET.x);
  assert.equal(marker.sprite.position.z, PRENDA_CENTRO_TARGET.z);
  assert.equal(marker.baseY, groundY + PRENDA_EXPRESS_WAYPOINT_HEIGHT_METERS);
  assert.equal(marker.sprite.material.depthTest, false);
  assert.equal(MAX_LIGHTWEIGHT_NPCS, 3);
  marker.dispose();
});

test('MiniMap projects North-up coordinates, 140x140 @ 10Hz, and rotates arrow with yaw', () => {
  assert.equal(MINIMAP_SIZE_PX, 140);
  assert.equal(MINIMAP_UPDATE_INTERVAL_MS, 100);

  const northPt = projectWorldToMiniMap(0, -100);
  const southPt = projectWorldToMiniMap(0, 100);
  const westPt = projectWorldToMiniMap(-50, 0);
  const eastPt = projectWorldToMiniMap(50, 0);

  assert.equal(northPt.py < southPt.py, true, 'North (-Z) must map higher on canvas');
  assert.equal(eastPt.px > westPt.px, true, 'East (+X) must map further right on canvas');

  // yaw = PI faces -Z (North -> canvas rotation 0)
  assert.ok(Math.abs(computeMiniMapArrowAngleRad(Math.PI) - 0) < 1e-6);
  // yaw = PI/2 faces +X (East -> canvas rotation +PI/2)
  assert.ok(Math.abs(computeMiniMapArrowAngleRad(Math.PI * 0.5) - Math.PI * 0.5) < 1e-6);
});
