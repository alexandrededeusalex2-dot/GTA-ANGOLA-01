/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findNearestStreetLabel,
  loadPrendaCartography,
  resolveBuildingCollision2D,
} from './PrendaCartography';

test('loadPrendaCartography loads exactly 22 historical residential blocks and real 7V roads', () => {
  const dataset = loadPrendaCartography();
  assert.equal(dataset.stats.historical22BlocksCount, 22);
  assert.ok(dataset.stats.totalBuildings >= 34);
  assert.ok(dataset.stats.roadSegmentsCount >= 120);
  assert.ok(dataset.stats.intersectionsCount >= 18);
  assert.ok(dataset.stats.roadCountBy7V.V3 > 0);
  assert.ok(dataset.stats.roadCountBy7V.V4 > 0);
  assert.ok(dataset.stats.roadCountBy7V.V5 > 0);
  assert.ok(dataset.stats.roadCountBy7V.V6 > 0);
  assert.ok(dataset.stats.roadCountBy7V.V7 > 0);

  // Confirm honest confirmation status: the 22 residential blocks remain pending cadastral floor confirmation
  const lote1 = dataset.buildings.find((b) => b.name === 'Lote 1');
  assert.ok(lote1);
  assert.equal(lote1.floorsConfirmed, false);
  assert.equal(lote1.typologyConfirmed, false);

  // Confirm Mesquita do Prenda has OSM-confirmed 2 levels
  const mesquita = dataset.buildings.find((b) => b.name === 'Mesquita do Prenda');
  assert.ok(mesquita);
  assert.equal(mesquita.floorsConfirmed, true);
  assert.equal(mesquita.estimatedFloors, 2);
});

test('resolveBuildingCollision2D pushes explorer smoothly outside rotated building OBB', () => {
  const dataset = loadPrendaCartography();
  const lote1 = dataset.buildings.find((b) => b.name === 'Lote 1')!;
  const pushed = resolveBuildingCollision2D(
    lote1.obb.centerX,
    lote1.obb.centerZ,
    1.2,
    dataset.buildings,
  );
  const distFromCenter = Math.hypot(pushed.x - lote1.obb.centerX, pushed.z - lote1.obb.centerZ);
  assert.ok(distFromCenter >= Math.min(lote1.obb.length, lote1.obb.width) * 0.5);
});

test('findNearestStreetLabel identifies real Prenda street near Sande Lemos corridor', () => {
  const dataset = loadPrendaCartography();
  const label = findNearestStreetLabel(-100, -38, dataset.roads);
  assert.ok(label.includes('Rua Eng Francisco Sande Lemos') || label.includes('V4'));
});
