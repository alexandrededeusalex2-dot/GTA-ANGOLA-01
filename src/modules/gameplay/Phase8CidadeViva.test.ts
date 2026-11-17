/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  createInitialLocomotionState,
  stepCharacterLocomotion,
} from '../character/CharacterLocomotionController';
import { EconomyEngine } from '../economy/EconomyEngine';
import {
  BOLA_LOW_GLB_URL,
  KID_BALL_KICK_DISTANCE_METERS,
  KID_PLAYER_SCALE,
  MAX_TOTAL_NPCS,
  NPC_ANIMATION_CULL_RADIUS_METERS,
  shouldAnimateNpcAtDistance,
  stepCrosswalkPedestrian,
  stepKidSoccerBallBehavior,
  stepZungueiraBehavior,
  ZUNGUEIRA_PAUSE_SECONDS,
  ZUNGUEIRA_SHOUT_TEXT,
} from '../npc/NpcEngine';
import {
  buildMercadoCentroLoopWaypoints,
  createInitialTrafficLightState,
  detectRedLightViolation,
  MAX_NPC_CANDONGUEIROS,
  NPC_CANDONGUEIRO_SPEED_MPS,
  NPC_CANDONGUEIRO_STOP_WAIT_SECONDS,
  stepNpcCandongueiroRoute,
  stepTrafficLight,
  TRAFFIC_FINE_KZ,
  TRAFFIC_FINE_MESSAGE,
  TRAFFIC_LIGHT_GREEN_SECONDS,
  TRAFFIC_LIGHT_RED_SECONDS,
} from '../vehicle/TrafficManager';
import { CENTRO_TRAFFIC_LIGHT_POS } from '../world/TrafficLightPropBuilder';
import {
  createInitialDayNightState,
  RAIN_PARTICLE_COUNT,
  RainParticleSystem,
  sampleLuandaAtmosphere,
  stepDayNightWeather,
} from '../world/DayNightWeather';
import {
  BARBEARIA_LOWFADE_PRICE_KZ,
  BOUTIQUE_TSHIRT_PRICE_KZ,
  ESTABLISHMENT_DOOR_OPEN_RADIUS_METERS,
  ESTABELECIMENTO_INTERIOR_GLB_URL,
  findNearestEstablishment,
  PRENDA_ESTABLISHMENTS,
  stepEstablishmentDoorAngle,
} from '../world/EstablishmentsManager';
import {
  applyCantinaItemToNeeds,
  deriveNeedsState,
  LOW_HUNGER_SPEED_MULTIPLIER,
  NEED_SLEEP_MESSAGE,
  sleepAtHomeNeeds,
  stepPlayerNeeds,
} from './PlayerNeeds';

test('Phase8 Living NPCs: <=8 limit, Zungueira 5s pause shout, 0.7x kid + 3m ball, crosswalk green-only, >40m animation culling', () => {
  assert.ok(MAX_TOTAL_NPCS <= 8);
  assert.equal(KID_PLAYER_SCALE, 0.7);
  assert.equal(KID_BALL_KICK_DISTANCE_METERS, 3.0);
  assert.equal(ZUNGUEIRA_PAUSE_SECONDS, 5.0);
  assert.equal(ZUNGUEIRA_SHOUT_TEXT, 'Água fresca!');
  assert.equal(NPC_ANIMATION_CULL_RADIUS_METERS, 40);

  // Zungueira arrives at stop -> pauses 5s and shouts "Água fresca!"
  const zLoop = [{ x: 0, z: 0 }, { x: 1, z: 0 }];
  let z = { x: 0, z: 0, yaw: 0, waypointIndex: 1, pauseRemainingSec: 0, isShouting: false };
  z = stepZungueiraBehavior(z, zLoop, 1.0);
  assert.equal(z.pauseRemainingSec, 5.0);
  assert.equal(z.isShouting, true);
  z = stepZungueiraBehavior(z, zLoop, 5.0);
  assert.equal(z.pauseRemainingSec, 0);
  assert.equal(z.isShouting, false);

  // Kid kicks ball 3m and chases after it
  let kid = {
    kidX: -14,
    kidZ: 24,
    kidYaw: 0,
    ballX: -14,
    ballZ: 24.3,
    ballTargetX: -14,
    ballTargetZ: 24.3,
    ballMoving: false,
    kickAngleRad: 0,
    pauseSec: 0,
  };
  const kicked = stepKidSoccerBallBehavior(kid, { x: -14, z: 24 }, 0.05);
  assert.equal(kicked.state.ballMoving, true);
  const kickDist = Math.hypot(
    kicked.state.ballTargetX - kid.ballX,
    kicked.state.ballTargetZ - kid.ballZ,
  );
  assert.ok(Math.abs(kickDist - 3.0) < 0.05);

  // Crosswalk pedestrian moves ONLY when pedestrian light is GREEN
  const start = { x: 12, z: 12 };
  const end = { x: 18, z: 18 };
  let ped: import('../npc/NpcEngine').CrosswalkPedestrianState = {
    x: start.x,
    z: start.z,
    yaw: 0,
    crossingDirection: 1,
    crossingActive: false,
    progress: 0,
  };
  ped = stepCrosswalkPedestrian(ped, start, end, 'red', 1.0);
  assert.equal(ped.crossingActive, false);
  assert.equal(ped.x, start.x);

  ped = stepCrosswalkPedestrian(ped, start, end, 'green', 1.0);
  assert.equal(ped.crossingActive, true);

  // > 40m skips skeletal animation
  assert.equal(shouldAnimateNpcAtDistance({ x: 30, z: 0 }, { x: 0, z: 0 }), true);
  assert.equal(shouldAnimateNpcAtDistance({ x: 45, z: 0 }, { x: 0, z: 0 }), false);
});

test('Phase8 Living Traffic: 2 NPC Candongueiros (6 m/s, 3s stop), 10s/7s traffic light, Red-light fine -50 Kz', () => {
  assert.equal(MAX_NPC_CANDONGUEIROS, 2);
  assert.equal(NPC_CANDONGUEIRO_SPEED_MPS, 6.0);
  assert.equal(NPC_CANDONGUEIRO_STOP_WAIT_SECONDS, 3.0);
  assert.equal(TRAFFIC_LIGHT_GREEN_SECONDS, 10.0);
  assert.equal(TRAFFIC_LIGHT_RED_SECONDS, 7.0);
  assert.equal(TRAFFIC_FINE_MESSAGE, 'Multa -50 Kz');

  const waypoints = buildMercadoCentroLoopWaypoints();
  assert.ok(waypoints.length >= 6);

  // Light flips Green (10s) -> Red (7s)
  let light = createInitialTrafficLightState();
  assert.equal(light.phase, 'green');
  assert.equal(light.pedestrianLight, 'red');
  light = stepTrafficLight(light, 10.1);
  assert.equal(light.phase, 'red');
  assert.equal(light.pedestrianLight, 'green');

  // NPC Candongueiro approaching Centro intersection stops on RED
  const stoppedVehicle = stepNpcCandongueiroRoute(
    {
      id: 'candongueiro-npc-1',
      x: CENTRO_TRAFFIC_LIGHT_POS.x + 10,
      y: 0,
      z: CENTRO_TRAFFIC_LIGHT_POS.z,
      yaw: 0,
      speedMps: 6,
      waypointIndex: 1,
      stopWaitRemainingSec: 0,
      waitingAtRedLight: false,
    },
    [
      { x: CENTRO_TRAFFIC_LIGHT_POS.x + 25, z: CENTRO_TRAFFIC_LIGHT_POS.z },
      { x: CENTRO_TRAFFIC_LIGHT_POS.x, z: CENTRO_TRAFFIC_LIGHT_POS.z, isTrafficSignalStop: true },
    ],
    'red',
    0.05,
    () => 0,
  );
  assert.equal(stoppedVehicle.speedMps, 0);
  assert.equal(stoppedVehicle.waitingAtRedLight, true);

  // Player driving through RED incurs -50 Kz fine
  const violated = detectRedLightViolation(
    { x: CENTRO_TRAFFIC_LIGHT_POS.x + 9, z: CENTRO_TRAFFIC_LIGHT_POS.z },
    { x: CENTRO_TRAFFIC_LIGHT_POS.x + 5, z: CENTRO_TRAFFIC_LIGHT_POS.z },
    true,
    7.5,
    'red',
    0,
  );
  assert.equal(violated, true);

  const economy = new EconomyEngine();
  economy.init();
  economy.awardKwanza(200, 'Saldo');
  assert.equal(economy.deductKwanza(TRAFFIC_FINE_KZ, TRAFFIC_FINE_MESSAGE), 150);
});

test('Phase8 Day/Night Cycle (07:00->20:00 streetlamps ON) & Light Rain (200 points, dark sky, faster NPCs)', () => {
  let env = createInitialDayNightState();
  assert.equal(env.clockLabel, '07:00');
  assert.equal(env.streetlightsOn, false);

  // 13 real minutes = 13 game hours -> 20:00 night
  env = stepDayNightWeather(env, 13 * 60);
  assert.equal(env.clockLabel, '20:00');
  assert.equal(env.isNight, true);
  assert.equal(env.streetlightsOn, true);

  const nightAtmo = sampleLuandaAtmosphere(20.0, false);
  assert.equal(nightAtmo.streetlightsOn, true);
  assert.ok(nightAtmo.lampEmissiveIntensity > 3.0);

  // Rain triggers at ~600s, speeds NPCs up, and uses 200-point THREE.Points
  const rainy = stepDayNightWeather(createInitialDayNightState(13.0), 605, () => 0.5);
  assert.equal(rainy.isRaining, true);
  assert.ok(rainy.npcSpeedMultiplier > 1.2);
  const rainAtmo = sampleLuandaAtmosphere(13.0, true);
  const clearAtmo = sampleLuandaAtmosphere(13.0, false);
  assert.ok(rainAtmo.sunIntensity < clearAtmo.sunIntensity);

  const pts = new RainParticleSystem();
  assert.equal(pts.particleCount, 200);
  assert.equal(RAIN_PARTICLE_COUNT, 200);
  pts.dispose();
});

test('Phase8 Establishments: door opens on <4.5m proximity, Boutique 200 Kz, Barbearia 150 Kz, Cantina', () => {
  assert.ok(PRENDA_ESTABLISHMENTS.length >= 3);
  const cantina = PRENDA_ESTABLISHMENTS.find((e) => e.id === 'cantina')!;
  const near = findNearestEstablishment({ x: cantina.x + 1.5, z: cantina.z + 1.5 });
  assert.equal(near?.spec.id, 'cantina');

  const closedAngle = stepEstablishmentDoorAngle(0, false, 0.5);
  assert.equal(closedAngle, 0);
  const openingAngle = stepEstablishmentDoorAngle(0, true, 0.4);
  assert.ok(openingAngle > 0.5);
  assert.equal(ESTABLISHMENT_DOOR_OPEN_RADIUS_METERS, 4.5);

  const economy = new EconomyEngine();
  economy.init();
  economy.awardKwanza(500, 'Inicial');
  assert.equal(economy.spendKwanza(BOUTIQUE_TSHIRT_PRICE_KZ, 'Mudar T-shirt'), true);
  assert.equal(economy.spendKwanza(BARBEARIA_LOWFADE_PRICE_KZ, 'Corte Low Fade'), true);
  assert.equal(economy.getBalanceAoa(), 150);
});

test('Phase8 Player Needs: Hunger <20 reduces walk speed by 30% & blinks; Night Energy=0 demands sleeping at home', () => {
  const lowHunger = deriveNeedsState(15, 60, 80, false);
  assert.equal(lowHunger.hungerBlinking, true);
  assert.equal(lowHunger.speedMultiplier, LOW_HUNGER_SPEED_MULTIPLIER);

  const normalStep = stepCharacterLocomotion(
    createInitialLocomotionState(0, 0, 0, 0),
    { moveX: 0, moveY: 1, sprint: false },
    0,
    0.05,
    (x, z) => ({ x, z }),
    () => 0,
    1.0,
  );
  const hungryStep = stepCharacterLocomotion(
    createInitialLocomotionState(0, 0, 0, 0),
    { moveX: 0, moveY: 1, sprint: false },
    0,
    0.05,
    (x, z) => ({ x, z }),
    () => 0,
    lowHunger.speedMultiplier,
  );
  assert.ok(hungryStep.state.speed < normalStep.state.speed * 0.75);

  // Night energy decay hits 0 -> "Precisas dormir em casa"
  let needs = deriveNeedsState(60, 60, 10, true);
  needs = stepPlayerNeeds(needs, 1.5, true, true);
  assert.equal(needs.energy, 0);
  assert.equal(needs.mustSleepHome, true);
  assert.equal(NEED_SLEEP_MESSAGE, 'Precisas dormir em casa');

  const rested = sleepAtHomeNeeds(needs);
  assert.equal(rested.energy, 100);
  assert.equal(rested.mustSleepHome, false);

  const fed = applyCantinaItemToNeeds(lowHunger, 'cachupa');
  assert.ok(fed.hunger >= 65);
  assert.equal(fed.hungerBlinking, false);
});

test('Phase8 Real GLB Props & Zero Geometric Primitives Policy', () => {
  const propPaths = [
    path.resolve(process.cwd(), 'public' + BOLA_LOW_GLB_URL),
    path.resolve(process.cwd(), 'public' + ESTABELECIMENTO_INTERIOR_GLB_URL),
    path.resolve(process.cwd(), 'public/assets/models/props/acessorios_prenda.glb'),
  ];
  for (const p of propPaths) {
    assert.equal(fs.existsSync(p), true, `Missing GLB prop: ${p}`);
    const header = fs.readFileSync(p).subarray(0, 4).toString('utf8');
    assert.equal(header, 'glTF', `Invalid GLB header at ${p}`);
  }

  for (const srcPath of [
    path.resolve(process.cwd(), 'src/modules/npc/NpcEngine.ts'),
    path.resolve(process.cwd(), 'src/modules/world/EstablishmentsManager.ts'),
    path.resolve(process.cwd(), 'src/modules/vehicle/TrafficManager.ts'),
  ]) {
    const code = fs.readFileSync(srcPath, 'utf8');
    assert.equal(
      /\b(BoxGeometry|CylinderGeometry|SphereGeometry|ConeGeometry|TorusGeometry|PlaneGeometry)\b/.test(
        code,
      ),
      false,
      `Forbidden primitive geometry found in ${srcPath}`,
    );
  }
});
