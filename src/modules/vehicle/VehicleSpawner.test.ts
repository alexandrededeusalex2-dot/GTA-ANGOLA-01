/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadPrendaCartography, resolveBuildingCollision2D } from '../world/PrendaCartography';
import { MAX_ACTIVE_VEHICLES, VehicleEngine } from './VehicleEngine';
import {
  CANDONGUEIRO_DIMENSIONS,
  CANDONGUEIRO_ENTER_PROMPT,
  CANDONGUEIRO_EXIT_PROMPT,
  computeFourWheelGroundPlacement,
  computeVehicleInteractionState,
  createVehicleObb,
  getCandongueiroManifest,
  getParagensUv01,
  resolveVehicleCollision2D,
} from './VehicleSpawner';

test('vehicle module never uses Three.js geometric primitives as vehicle visuals', () => {
  const vehicleDir = path.resolve(process.cwd(), 'src/modules/vehicle');
  const sourceFiles = fs
    .readdirSync(vehicleDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  assert.ok(sourceFiles.length >= 2);
  const forbiddenPrimitives = [
    'BoxGeometry',
    'CylinderGeometry',
    'SphereGeometry',
    'ConeGeometry',
    'TorusGeometry',
    'PlaneGeometry',
  ];

  for (const file of sourceFiles) {
    const content = fs.readFileSync(path.join(vehicleDir, file), 'utf8');
    for (const prim of forbiddenPrimitives) {
      assert.equal(
        content.includes(prim),
        false,
        `Forbidden geometric primitive ${prim} found in ${file}`,
      );
    }
  }
});

test('vehicles/manifest.json declares MIT/CC0 license, origin, tris, and local GLB url', () => {
  const manifest = getCandongueiroManifest();
  assert.equal(manifest.url, '/assets/vehicles/candongueiro_low.glb');
  assert.match(manifest.license, /CC0|MIT/i);
  assert.ok(manifest.origin.length > 10);
  assert.equal(manifest.tris, 2082);
});

test('candongueiro_low.glb is valid GLB with WebP texture, 1 body + 4 modeled wheels, and no skeleton', () => {
  const glbPath = path.resolve(process.cwd(), 'public/assets/vehicles/candongueiro_low.glb');
  assert.equal(fs.existsSync(glbPath), true, 'Missing candongueiro_low.glb');
  const buf = fs.readFileSync(glbPath);
  assert.equal(buf.readUInt32LE(0), 0x46546c67); // 'glTF'
  assert.equal(buf.readUInt32LE(4), 2);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

  assert.ok(gltf.extensionsUsed?.includes('EXT_texture_webp'));
  assert.equal(gltf.images?.[0]?.mimeType, 'image/webp');
  assert.equal(gltf.skins ?? undefined, undefined);
  assert.equal(gltf.meshes.length, 5);
  const meshNames = gltf.meshes.map((m: { name: string }) => m.name);
  assert.equal(meshNames.includes('body'), true);
  assert.equal(
    meshNames.filter((n: string) => n.startsWith('wheel-')).length,
    4,
  );
});

test('paragens_uv01 GeoJSON projects Paragem do Mercado UV1 clear of all building OBBs', () => {
  const geojsonPath = path.resolve(
    process.cwd(),
    'CARTOGRAFIA/LUANDA/PRENDA/UV_01/ESPACOS_PUBLICOS/paragens_uv01.geojson',
  );
  assert.equal(fs.existsSync(geojsonPath), true);
  const rawGeo = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const stops = getParagensUv01();
  assert.equal(stops.length, rawGeo.features.length);
  const mercado = stops.find((s) => s.id === 'paragem_mercado_uv1');
  assert.ok(mercado);
  assert.equal(mercado.vehicleId, 'candongueiro-uv1-01');
  assert.ok(Math.hypot(mercado.localPosition.x - 338.8, mercado.localPosition.z - -11.8) < 2.0);

  const dataset = loadPrendaCartography();
  const resolved = resolveBuildingCollision2D(
    mercado.localPosition.x,
    mercado.localPosition.z,
    2.5,
    dataset.buildings,
  );
  assert.equal(resolved.x, mercado.localPosition.x);
  assert.equal(resolved.z, mercado.localPosition.z);
});

test('computeFourWheelGroundPlacement samples 4 wheel positions and computes slope pitch/roll', () => {
  const sampledPoints: { x: number; z: number }[] = [];
  const placement = computeFourWheelGroundPlacement(100, -20, 0, (x, z) => {
    sampledPoints.push({ x, z });
    // Simple ramp rising along +Z
    return 1.0 + z * 0.04;
  });

  assert.equal(sampledPoints.length, 4);
  assert.ok(Math.abs(placement.groundY - (1.0 + -20 * 0.04)) < 1e-6);
  assert.ok(placement.pitchRad < 0, 'Front higher than rear tilts pitch negative around X');
  assert.ok(Math.abs(placement.rollRad) < 1e-6);
});

test('resolveVehicleCollision2D enforces rotated OBB boundaries for collision only', () => {
  const heading = 1.234549;
  const obb = createVehicleObb(338.82, -11.78, heading);
  // Explorer standing at vehicle center is pushed strictly outside width/2 + radius
  const pushed = resolveVehicleCollision2D(338.82, -11.78, 0.5, obb);
  const dist = Math.hypot(pushed.x - 338.82, pushed.z - -11.78);
  assert.ok(dist >= CANDONGUEIRO_DIMENSIONS.width * 0.5 + 0.49);

  // Explorer far away is untouched
  const clear = resolveVehicleCollision2D(345, -2, 0.5, obb);
  assert.equal(clear.x, 345);
  assert.equal(clear.z, -2);
});

test('computeVehicleInteractionState displays Entrar [E] within 2.5m and null when distant', () => {
  const near = computeVehicleInteractionState(
    { x: 339.67, y: 0.4, z: -9.83 },
    { x: 338.82, z: -11.78 },
    0,
  );
  assert.equal(near.nearVehicle, true);
  assert.equal(near.promptText, CANDONGUEIRO_ENTER_PROMPT);
  assert.equal(near.feedbackText, null);

  const far = computeVehicleInteractionState(
    { x: -4, y: 0, z: 12 },
    { x: 338.82, z: -11.78 },
    0,
  );
  assert.equal(far.nearVehicle, false);
  assert.equal(far.promptText, null);
});

test('VehicleEngine registers Candongueiro spec with MAX_ACTIVE_VEHICLES === 1', () => {
  assert.equal(MAX_ACTIVE_VEHICLES, 1);
  const engine = new VehicleEngine();
  engine.init();
  assert.equal(engine.descriptor.status, 'implemented');
  assert.equal(engine.getSpawnedCount(), 0);
  const stop = engine.getMercadoStopWorldTransform();
  assert.ok(stop.length > stop.width);
  engine.dispose();
});

test('VehicleEngine tryInteract enters driving mode within 2.5m and exits beside door on second press', () => {
  const engine = new VehicleEngine();
  engine.init();
  const stop = engine.getMercadoStopWorldTransform();

  const farAttempt = engine.tryInteract({ x: 0, y: 0, z: 0 });
  assert.equal(farAttempt.action, 'none');
  assert.equal(engine.isDriving(), false);

  const nearAttempt = engine.tryInteract({ x: stop.x - 0.85, y: stop.y, z: stop.z + 1.95 });
  assert.equal(nearAttempt.action, 'entered');
  assert.equal(nearAttempt.promptText, CANDONGUEIRO_EXIT_PROMPT);
  assert.equal(engine.isDriving(), true);

  const exitAttempt = engine.tryInteract({ x: stop.x, y: stop.y, z: stop.z });
  assert.equal(exitAttempt.action, 'exited');
  assert.ok(exitAttempt.exitPosition);
  assert.equal(engine.isDriving(), false);
  engine.dispose();
});
