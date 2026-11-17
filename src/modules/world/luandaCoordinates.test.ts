/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GEOGRAPHICAL_INTEGRITY_PRENDA_UV1,
  PRENDA_UV1_PUBLISHED_ORIGIN,
  geoToLocalMeters,
  geoToLocalMetersUtm33S,
  geoToUtm33S,
  getChunkKey,
  groundHeightAt,
  localMetersToGeo,
  utm33SToGeo,
} from './luandaCoordinates';

const SYNTHETIC_TEST_ORIGIN = { lat: -8.8, lon: 13.2 };

test('geoToLocalMeters projects an explicit origin to (0, 0, 0)', () => {
  const originLocal = geoToLocalMeters(SYNTHETIC_TEST_ORIGIN, SYNTHETIC_TEST_ORIGIN);
  assert.equal(originLocal.x, 0);
  assert.equal(originLocal.y, 0);
  assert.equal(originLocal.z, 0);
});

test('localMetersToGeo round-trips meter offsets accurately for a given origin', () => {
  const offset = { x: 185.5, y: 0, z: -142.25 };
  const geo = localMetersToGeo(offset, SYNTHETIC_TEST_ORIGIN);
  const roundTripped = geoToLocalMeters(geo, SYNTHETIC_TEST_ORIGIN);
  assert.ok(Math.abs(roundTripped.x - offset.x) < 0.25);
  assert.ok(Math.abs(roundTripped.z - offset.z) < 0.25);
});

test('geoToUtm33S and utm33SToGeo round-trip Prenda UV1 published origin accurately', () => {
  const utm = geoToUtm33S(PRENDA_UV1_PUBLISHED_ORIGIN);
  assert.equal(utm.epsg, 'EPSG:32733');
  assert.equal(utm.zone, '33S');
  // Luanda at 13.2239E, -8.8361S sits near Easting ~304,637m, Northing ~9,022,742m
  assert.ok(utm.easting > 304000 && utm.easting < 305500);
  assert.ok(utm.northing > 9022000 && utm.northing < 9023500);

  const roundTrip = utm33SToGeo(utm);
  assert.ok(Math.abs(roundTrip.lat - PRENDA_UV1_PUBLISHED_ORIGIN.lat) < 0.0001);
  assert.ok(Math.abs(roundTrip.lon - PRENDA_UV1_PUBLISHED_ORIGIN.lon) < 0.0001);

  const originLocal = geoToLocalMetersUtm33S(PRENDA_UV1_PUBLISHED_ORIGIN);
  assert.equal(originLocal.x, 0);
  assert.equal(originLocal.z, 0);
  assert.equal(originLocal.y, groundHeightAt(0, 0));
});

test('getChunkKey partitions terrain into deterministic 128m chunks', () => {
  assert.equal(getChunkKey({ x: 0, y: 0, z: 0 }, 128), 'chunk_0_0');
  assert.equal(getChunkKey({ x: 129, y: 0, z: -10 }, 128), 'chunk_1_-1');
  assert.equal(getChunkKey({ x: -200, y: 0, z: 260 }, 128), 'chunk_-2_2');
});

test('GEOGRAPHICAL_INTEGRITY_PRENDA_UV1 separates confirmed, historical, ungeoreferenced, and pending items', () => {
  assert.ok(GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.confirmedData.length >= 3);
  assert.ok(GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.historicalData.length >= 2);
  assert.ok(GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.ungeoreferencedData.length >= 2);
  assert.ok(GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.pendingValidation.length >= 2);
});
