/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PrendaPbrMaterialPack } from '../../resources/PrendaTextures';
import type { LocalPoint2D, PrendaCartographyDataset } from './PrendaCartography';
import { groundHeightAt } from './luandaCoordinates';

export interface TerrainAndRoadsResult {
  readonly group: THREE.Group;
  readonly roadMeshes: readonly THREE.Mesh[];
  readonly walkableSurfaceMeshes: readonly THREE.Mesh[];
}

function buildTerrainGeometry(
  sizeMeters: number,
  segments: number,
): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(sizeMeters, sizeMeters, segments, segments);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSoil = new THREE.Color(0xc28a6e);
  const cDust = new THREE.Color(0xd1b398);
  const cGrass = new THREE.Color(0x9da473);
  const cTmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = groundHeightAt(x, z);
    pos.setY(i, y);

    const n1 = Math.sin(x * 0.025 + 0.7) * Math.cos(z * 0.021 - 0.4);
    const n2 = Math.sin((x + z) * 0.045);
    if (n1 > 0.28) {
      cTmp.copy(cSoil).lerp(cGrass, (n1 - 0.28) * 0.9);
    } else if (n2 > 0.15) {
      cTmp.copy(cSoil).lerp(cDust, 0.45);
    } else {
      cTmp.copy(cSoil);
    }
    colors[i * 3] = cTmp.r;
    colors[i * 3 + 1] = cTmp.g;
    colors[i * 3 + 2] = cTmp.b;
  }

  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

function buildPolylineRibbon(
  points: readonly LocalPoint2D[],
  width: number,
  yOffset: number,
  lateralOffset = 0,
  uvTileLength = 8,
): THREE.BufferGeometry | null {
  if (points.length < 2) return null;

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const halfW = width * 0.5;
  let accumDist = 0;

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)];
    const curr = points[i];
    const next = points[Math.min(points.length - 1, i + 1)];

    if (i > 0) {
      accumDist += Math.hypot(curr.x - prev.x, curr.z - prev.z);
    }

    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz);
    if (tLen < 1e-4) {
      tx = 1;
      tz = 0;
    } else {
      tx /= tLen;
      tz /= tLen;
    }

    // Perpendicular right-hand normal in XZ plane
    const nx = -tz;
    const nz = tx;

    const cx = curr.x + nx * lateralOffset;
    const cz = curr.z + nz * lateralOffset;

    const lx = cx - nx * halfW;
    const lz = cz - nz * halfW;
    const rx = cx + nx * halfW;
    const rz = cz + nz * halfW;

    const ly = groundHeightAt(lx, lz) + yOffset;
    const ry = groundHeightAt(rx, rz) + yOffset;

    positions.push(lx, ly, lz, rx, ry, rz);
    normals.push(0, 1, 0, 0, 1, 0);
    uvs.push(0, accumDist / uvTileLength, 1, accumDist / uvTileLength);

    if (i > 0) {
      const base = (i - 1) * 2;
      indices.push(base, base + 1, base + 2);
      indices.push(base + 1, base + 3, base + 2);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  return geom;
}

function buildDiscPad(
  cx: number,
  cz: number,
  radius: number,
  yOffset: number,
  segments = 14,
): THREE.BufferGeometry {
  const geom = new THREE.CylinderGeometry(radius, radius * 1.04, 0.1, segments);
  geom.translate(cx, groundHeightAt(cx, cz) + yOffset - 0.03, cz);
  return geom;
}

function buildDashMarkingsForSegment(
  points: readonly LocalPoint2D[],
  yOffset: number,
): THREE.BufferGeometry[] {
  const geoms: THREE.BufferGeometry[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 6) continue;

    const angle = Math.atan2(dx, dz);
    const step = 7.5;
    for (let d = 2.5; d < len - 2.5; d += step) {
      const t = d / len;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const dash = new THREE.PlaneGeometry(0.18, 2.8);
      dash.rotateX(-Math.PI / 2);
      dash.rotateY(angle);
      dash.translate(px, groundHeightAt(px, pz) + yOffset, pz);
      geoms.push(dash);
    }
  }
  return geoms;
}

function safeMerge(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(nonIndexed, false);
  for (const g of nonIndexed) g.dispose();
  for (const g of list) g.dispose();
  return merged;
}

export function buildPrendaTerrainAndRoads(
  dataset: PrendaCartographyDataset,
  materials: PrendaPbrMaterialPack,
): TerrainAndRoadsResult {
  const group = new THREE.Group();
  group.name = 'PrendaTerrainAndRoads7V';
  const roadMeshes: THREE.Mesh[] = [];
  const walkableSurfaceMeshes: THREE.Mesh[] = [];

  // 1. Continuous Luanda terrain (1800m horizon + 920m detailed Prenda relief)
  const terrainGeom = buildTerrainGeometry(1800, 128);
  const terrainMesh = new THREE.Mesh(terrainGeom, materials.terrainSoil);
  terrainMesh.name = 'LuandaPrendaTerrain';
  terrainMesh.receiveShadow = true;
  group.add(terrainMesh);
  walkableSurfaceMeshes.push(terrainMesh);

  // 2. Categorized 7V Road Geometry Buckets
  const v3v4Geoms: THREE.BufferGeometry[] = [];
  const v5v6Geoms: THREE.BufferGeometry[] = [];
  const v7Geoms: THREE.BufferGeometry[] = [];
  const sidewalkGeoms: THREE.BufferGeometry[] = [];
  const laneMarkGeoms: THREE.BufferGeometry[] = [];
  const parkingPadGeoms: THREE.BufferGeometry[] = [];

  for (const road of dataset.roads) {
    if (road.system7v === 'V3' || road.system7v === 'V4') {
      const g = buildPolylineRibbon(road.points, road.widthMeters, 0.18, 0, 10);
      if (g) v3v4Geoms.push(g);

      if (road.sidewalkWidth > 0) {
        const offset = road.widthMeters * 0.5 + road.sidewalkWidth * 0.5;
        const leftSw = buildPolylineRibbon(road.points, road.sidewalkWidth, 0.25, -offset, 6);
        const rightSw = buildPolylineRibbon(road.points, road.sidewalkWidth, 0.25, offset, 6);
        if (leftSw) sidewalkGeoms.push(leftSw);
        if (rightSw) sidewalkGeoms.push(rightSw);
      }

      if (road.system7v === 'V3') {
        laneMarkGeoms.push(...buildDashMarkingsForSegment(road.points, 0.205));
      }
    } else if (road.system7v === 'V5' || road.system7v === 'V6') {
      const g = buildPolylineRibbon(road.points, road.widthMeters, 0.16, 0, 8);
      if (g) v5v6Geoms.push(g);

      if (road.sidewalkWidth > 0) {
        const offset = road.widthMeters * 0.5 + road.sidewalkWidth * 0.5;
        const leftSw = buildPolylineRibbon(road.points, road.sidewalkWidth, 0.23, -offset, 5);
        const rightSw = buildPolylineRibbon(road.points, road.sidewalkWidth, 0.23, offset, 5);
        if (leftSw) sidewalkGeoms.push(leftSw);
        if (rightSw) sidewalkGeoms.push(rightSw);
      }
    } else {
      const g = buildPolylineRibbon(road.points, road.widthMeters, 0.19, 0, 5);
      if (g) v7Geoms.push(g);
    }
  }

  // 3. Intersections & Cul-de-sacs (V6)
  for (const node of dataset.intersections) {
    const radius = node.kind === 'cul-de-sac-v6' ? 4.4 : node.tiers7V.includes('V3') ? 7.2 : 5.2;
    v3v4Geoms.push(buildDiscPad(node.x, node.z, radius, 0.16, 14));
  }

  // 4. OSM Mapped Parking Pockets & Public Courtyard Pads
  for (const pub of dataset.publicSpaces) {
    if (pub.geometryType === 'Point' && pub.kind === 'amenity:parking' && pub.points[0]) {
      const p = pub.points[0];
      const pad = new THREE.BoxGeometry(10.5, 0.14, 6.2);
      pad.translate(p.x, groundHeightAt(p.x, p.z) + 0.13, p.z);
      parkingPadGeoms.push(pad);
    }
  }

  const addMergedLayer = (
    geoms: THREE.BufferGeometry[],
    mat: THREE.Material,
    name: string,
    receiveShadow = true,
    walkable = true,
  ) => {
    const merged = safeMerge(geoms);
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
    roadMeshes.push(mesh);
    if (walkable) {
      walkableSurfaceMeshes.push(mesh);
    }
  };

  addMergedLayer(v3v4Geoms, materials.roadAsphaltV3V4, 'PrendaRoads_V3_V4_Cruzamentos');
  addMergedLayer(v5v6Geoms, materials.roadAsphaltLocal, 'PrendaRoads_V5_V6');
  addMergedLayer(v7Geoms, materials.pedestrianWalkway, 'PrendaWalkways_V7');
  addMergedLayer(sidewalkGeoms, materials.sidewalkCurb, 'PrendaSidewalks');
  addMergedLayer(parkingPadGeoms, materials.pedestrianWalkway, 'PrendaParkingPockets');
  addMergedLayer(laneMarkGeoms, materials.laneMarking, 'PrendaLaneMarkings', false, false);

  return { group, roadMeshes, walkableSurfaceMeshes };
}
