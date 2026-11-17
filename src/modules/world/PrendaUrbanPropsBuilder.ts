/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PrendaPbrMaterialPack } from '../../resources/PrendaTextures';
import type {
  PrendaBuildingRecord,
  PrendaCartographyDataset,
  PrendaRoadSegment,
} from './PrendaCartography';
import { groundHeightAt } from './luandaCoordinates';

export interface UrbanObstacleCircle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

export interface PrendaUrbanPropsResult {
  readonly group: THREE.Group;
  readonly contemporaryPropsGroup: THREE.Group;
  readonly fineDetailGroup: THREE.Group;
  readonly obstacleCircles: readonly UrbanObstacleCircle[];
  readonly propsSummary: {
    readonly kiosksCount: number;
    readonly streetlightsCount: number;
    readonly acaciaTreesCount: number;
    readonly palmTreesCount: number;
    readonly hasCommunityCourt: boolean;
  };
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function pointDistanceToSegmentSq(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const vx = bx - ax;
  const vz = bz - az;
  const wx = px - ax;
  const wz = pz - az;
  const lenSq = vx * vx + vz * vz;
  const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
  const cx = ax + t * vx;
  const cz = az + t * vz;
  return (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
}

function isInsideAnyBuilding(
  x: number,
  z: number,
  margin: number,
  buildings: readonly PrendaBuildingRecord[],
): boolean {
  for (const b of buildings) {
    const dx = x - b.obb.centerX;
    const dz = z - b.obb.centerZ;
    const reach = Math.hypot(b.obb.length * 0.5, b.obb.width * 0.5) + margin;
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;

    const cosA = Math.cos(-b.obb.angleRad);
    const sinA = Math.sin(-b.obb.angleRad);
    const u = dx * cosA - dz * sinA;
    const v = dx * sinA + dz * cosA;
    if (Math.abs(u) <= b.obb.length * 0.5 + margin && Math.abs(v) <= b.obb.width * 0.5 + margin) {
      return true;
    }
  }
  return false;
}

function isOnAnyRoad(
  x: number,
  z: number,
  extraClearance: number,
  roads: readonly PrendaRoadSegment[],
): boolean {
  for (const r of roads) {
    const minDist = r.widthMeters * 0.5 + r.sidewalkWidth + extraClearance;
    const minDistSq = minDist * minDist;
    for (let i = 0; i < r.points.length - 1; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      if (pointDistanceToSegmentSq(x, z, a.x, a.z, b.x, b.z) < minDistSq) {
        return true;
      }
    }
  }
  return false;
}

function isClearPosition(
  x: number,
  z: number,
  buildingMargin: number,
  roadClearance: number,
  buildings: readonly PrendaBuildingRecord[],
  roads: readonly PrendaRoadSegment[],
): boolean {
  return (
    !isInsideAnyBuilding(x, z, buildingMargin, buildings) &&
    !isOnAnyRoad(x, z, roadClearance, roads)
  );
}

function createPalmCrownGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const frondCount = 7;
  for (let i = 0; i < frondCount; i++) {
    const angle = (i / frondCount) * Math.PI * 2;
    const frond = new THREE.ConeGeometry(0.42, 2.9, 4);
    frond.rotateX(Math.PI * 0.42);
    frond.translate(0, 0.1, 1.35);
    frond.rotateY(angle);
    parts.push(frond);
  }
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(nonIndexed, false);
  for (const g of nonIndexed) g.dispose();
  for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  return merged;
}

function createAcaciaCanopyGeometry(): THREE.BufferGeometry {
  const main = new THREE.IcosahedronGeometry(1.0, 1);
  main.scale(2.5, 0.72, 2.3);
  const subA = new THREE.IcosahedronGeometry(0.75, 1);
  subA.scale(1.8, 0.65, 1.7);
  subA.translate(1.15, -0.18, 0.55);
  const subB = new THREE.IcosahedronGeometry(0.72, 1);
  subB.scale(1.75, 0.62, 1.65);
  subB.translate(-1.05, -0.14, -0.65);

  const parts = [main, subA, subB].map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(parts, false);
  main.dispose();
  subA.dispose();
  subB.dispose();
  for (const g of parts) g.dispose();
  merged.computeVertexNormals();
  return merged;
}

export function buildPrendaUrbanProps(
  dataset: PrendaCartographyDataset,
  materials: PrendaPbrMaterialPack,
): PrendaUrbanPropsResult {
  const group = new THREE.Group();
  group.name = 'PrendaUrbanPropsUV01';

  const contemporaryPropsGroup = new THREE.Group();
  contemporaryPropsGroup.name = 'PrendaContemporaryStreetCommerce';
  const fineDetailGroup = new THREE.Group();
  fineDetailGroup.name = 'PrendaFineStreetDetails';

  group.add(contemporaryPropsGroup);
  group.add(fineDetailGroup);

  const rand = seededRand(1975);
  const dummy = new THREE.Object3D();

  // 1. Contemporary street-commerce kiosks / bancas (Mercado zone & V4 Sande Lemos)
  const kioskCandidates: { x: number; z: number; yaw: number }[] = [];
  for (const spot of dataset.contemporarySpots) {
    if (spot.kind.includes('commerce') || spot.kind.includes('marketplace')) {
      for (let k = -1; k <= 1; k++) {
        const kx = spot.x + k * 5.2 + (rand() - 0.5) * 1.4;
        const kz = spot.z + (k % 2 === 0 ? 3.5 : -3.5) + (rand() - 0.5) * 1.4;
        if (isClearPosition(kx, kz, 2.2, 0.5, dataset.buildings, dataset.roads)) {
          kioskCandidates.push({ x: kx, z: kz, yaw: (rand() - 0.5) * 0.6 });
        }
      }
    }
  }

  // Also sprinkle a few clear informal bancas along V4 corridor pockets
  for (const road of dataset.roads) {
    if (road.system7v !== 'V4' || road.points.length < 2) continue;
    const mid = road.points[Math.floor(road.points.length / 2)];
    const prev = road.points[Math.max(0, Math.floor(road.points.length / 2) - 1)];
    const dx = mid.x - prev.x;
    const dz = mid.z - prev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    const offset = road.widthMeters * 0.5 + road.sidewalkWidth + 2.6;
    const kx = mid.x + nx * offset;
    const kz = mid.z + nz * offset;
    if (
      kioskCandidates.length < 20 &&
      isClearPosition(kx, kz, 2.2, 0.6, dataset.buildings, dataset.roads)
    ) {
      kioskCandidates.push({ x: kx, z: kz, yaw: Math.atan2(dx, dz) });
    }
  }

  if (kioskCandidates.length > 0) {
    const count = kioskCandidates.length;
    const baseGeom = new THREE.BoxGeometry(3.2, 1.05, 2.1);
    const roofGeom = new THREE.BoxGeometry(3.75, 0.14, 2.65);
    const counterGeom = new THREE.BoxGeometry(3.35, 0.12, 0.65);
    const postGeom = new THREE.CylinderGeometry(0.06, 0.06, 2.45, 6);

    const kioskTintMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
      metalness: 0.05,
    });
    const timberMat = new THREE.MeshStandardMaterial({
      color: 0x6f4a2e,
      roughness: 0.88,
      metalness: 0.02,
    });

    const baseInst = new THREE.InstancedMesh(baseGeom, kioskTintMat, count);
    const roofInst = new THREE.InstancedMesh(roofGeom, materials.corrugatedZinc, count);
    const counterInst = new THREE.InstancedMesh(counterGeom, timberMat, count);
    const postsInst = new THREE.InstancedMesh(postGeom, timberMat, count * 4);

    baseInst.castShadow = true;
    baseInst.receiveShadow = true;
    roofInst.castShadow = true;

    const palette = [
      new THREE.Color(0xc85d38),
      new THREE.Color(0x3a6d8c),
      new THREE.Color(0xd29b38),
      new THREE.Color(0x527a57),
    ];

    kioskCandidates.forEach((k, idx) => {
      const y = groundHeightAt(k.x, k.z);
      dummy.position.set(k.x, y + 0.52, k.z);
      dummy.rotation.set(0, k.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseInst.setMatrixAt(idx, dummy.matrix);
      baseInst.setColorAt(idx, palette[idx % palette.length]);

      dummy.position.set(k.x, y + 2.48, k.z);
      dummy.rotation.set(0.08, k.yaw, 0);
      dummy.updateMatrix();
      roofInst.setMatrixAt(idx, dummy.matrix);

      const cosY = Math.cos(k.yaw);
      const sinY = Math.sin(k.yaw);
      dummy.position.set(k.x + sinY * 1.15, y + 1.05, k.z + cosY * 1.15);
      dummy.rotation.set(0, k.yaw, 0);
      dummy.updateMatrix();
      counterInst.setMatrixAt(idx, dummy.matrix);

      const corners = [
        [-1.45, -0.92],
        [1.45, -0.92],
        [-1.45, 0.92],
        [1.45, 0.92],
      ];
      corners.forEach(([lx, lz], cIdx) => {
        const wx = k.x + lx * cosY + lz * sinY;
        const wz = k.z - lx * sinY + lz * cosY;
        dummy.position.set(wx, y + 1.22, wz);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        postsInst.setMatrixAt(idx * 4 + cIdx, dummy.matrix);
      });
    });

    baseInst.instanceMatrix.needsUpdate = true;
    if (baseInst.instanceColor) baseInst.instanceColor.needsUpdate = true;
    roofInst.instanceMatrix.needsUpdate = true;
    counterInst.instanceMatrix.needsUpdate = true;
    postsInst.instanceMatrix.needsUpdate = true;

    contemporaryPropsGroup.add(baseInst, roofInst, counterInst, postsInst);
  }

  // 2. Community Multi-Sport Court (*Campo Multiusos*) placed deterministically in clear courtyard
  const courtSearchCenters = [
    [-25, -45],
    [-40, 22],
    [18, 28],
    [-58, -18],
    [52, -55],
    [0, -70],
    [-85, 65],
    [60, 48],
  ];
  let courtSpot: { x: number; z: number } | null = null;
  for (const [cx, cz] of courtSearchCenters) {
    if (isClearPosition(cx, cz, 11.5, 4.0, dataset.buildings, dataset.roads)) {
      courtSpot = { x: cx, z: cz };
      break;
    }
  }

  if (courtSpot) {
    const cy = groundHeightAt(courtSpot.x, courtSpot.z);
    const courtGroup = new THREE.Group();
    courtGroup.name = 'PrendaCampoMultiusos';
    courtGroup.position.set(courtSpot.x, cy, courtSpot.z);

    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(20, 0.16, 12.6),
      materials.structuralConcrete,
    );
    apron.position.y = 0.04;
    apron.receiveShadow = true;

    const deck = new THREE.Mesh(new THREE.PlaneGeometry(18, 10.6), materials.sportsCourt);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = 0.13;
    deck.receiveShadow = true;

    const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 10.4), materials.laneMarking);
    centerLine.rotation.x = -Math.PI / 2;
    centerLine.position.y = 0.14;

    courtGroup.add(apron, deck, centerLine);

    // Multi-part goal / basketball backstop frames at both ends
    for (const side of [-1, 1]) {
      const gx = side * 8.6;
      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), materials.darkMetal);
      postL.position.set(gx, 1.2, -1.6);
      const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8), materials.darkMetal);
      postR.position.set(gx, 1.2, 1.6);
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 3.35), materials.darkMetal);
      crossbar.position.set(gx, 2.38, 0);
      courtGroup.add(postL, postR, crossbar);
    }

    contemporaryPropsGroup.add(courtGroup);
  }

  // 3. Instanced Streetlights along V3/V4/V5 curbs
  const lightSpecs: { x: number; z: number; yaw: number }[] = [];
  for (const road of dataset.roads) {
    if (road.system7v !== 'V3' && road.system7v !== 'V4' && road.system7v !== 'V5') continue;
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 22) continue;

      const dirX = dx / len;
      const dirZ = dz / len;
      const nx = -dirZ;
      const nz = dirX;
      const side = i % 2 === 0 ? 1 : -1;
      const offset = road.widthMeters * 0.5 + 0.85;

      for (let d = 10; d < len - 6; d += 38) {
        const lx = a.x + dirX * d + nx * side * offset;
        const lz = a.z + dirZ * d + nz * side * offset;
        if (!isInsideAnyBuilding(lx, lz, 1.8, dataset.buildings)) {
          lightSpecs.push({
            x: lx,
            z: lz,
            yaw: Math.atan2(-nx * side, -nz * side),
          });
        }
      }
    }
  }

  const cappedLights = lightSpecs.slice(0, 140);
  if (cappedLights.length > 0) {
    const poleGeom = new THREE.CylinderGeometry(0.09, 0.13, 6.4, 6);
    const armGeom = new THREE.BoxGeometry(0.1, 0.1, 1.45);
    const lampGeom = new THREE.BoxGeometry(0.28, 0.1, 0.52);

    const poleInst = new THREE.InstancedMesh(poleGeom, materials.darkMetal, cappedLights.length);
    const armInst = new THREE.InstancedMesh(armGeom, materials.darkMetal, cappedLights.length);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xfff0c8,
      emissive: 0xffd27d,
      emissiveIntensity: 0.45,
      roughness: 0.35,
    });
    const lampInst = new THREE.InstancedMesh(lampGeom, lampMat, cappedLights.length);

    cappedLights.forEach((l, i) => {
      const y = groundHeightAt(l.x, l.z);
      dummy.position.set(l.x, y + 3.2, l.z);
      dummy.rotation.set(0, l.yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poleInst.setMatrixAt(i, dummy.matrix);

      const sinY = Math.sin(l.yaw);
      const cosY = Math.cos(l.yaw);
      dummy.position.set(l.x + sinY * 0.68, y + 6.32, l.z + cosY * 0.68);
      dummy.updateMatrix();
      armInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(l.x + sinY * 1.25, y + 6.26, l.z + cosY * 1.25);
      dummy.updateMatrix();
      lampInst.setMatrixAt(i, dummy.matrix);
    });

    poleInst.instanceMatrix.needsUpdate = true;
    armInst.instanceMatrix.needsUpdate = true;
    lampInst.instanceMatrix.needsUpdate = true;
    fineDetailGroup.add(poleInst, armInst, lampInst);
  }

  // 4. Instanced Tropical Acacia & Luanda Palm Trees in open courtyards & street edges
  const acaciaSpots: { x: number; z: number; scale: number; yaw: number }[] = [];
  const palmSpots: { x: number; z: number; scale: number; yaw: number }[] = [];

  for (let attempt = 0; attempt < 420 && acaciaSpots.length + palmSpots.length < 135; attempt++) {
    const tx = (rand() - 0.5) * 440;
    const tz = (rand() - 0.5) * 440;
    if (Math.hypot(tx - -1, tz - 15) < 14) continue;
    if (courtSpot && Math.hypot(tx - courtSpot.x, tz - courtSpot.z) < 14) continue;
    if (!isClearPosition(tx, tz, 4.2, 2.2, dataset.buildings, dataset.roads)) continue;

    // Ensure minimum spacing between trees
    let tooClose = false;
    for (const t of acaciaSpots) {
      if ((t.x - tx) ** 2 + (t.z - tz) ** 2 < 100) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    for (const p of palmSpots) {
      if ((p.x - tx) ** 2 + (p.z - tz) ** 2 < 85) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    const scale = 0.85 + rand() * 0.3;
    const yaw = rand() * Math.PI * 2;
    if (attempt % 3 === 0) {
      palmSpots.push({ x: tx, z: tz, scale, yaw });
    } else {
      acaciaSpots.push({ x: tx, z: tz, scale, yaw });
    }
  }

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x5c4636,
    roughness: 0.92,
    metalness: 0.02,
  });
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.02,
  });

  if (acaciaSpots.length > 0) {
    const trunkGeom = new THREE.CylinderGeometry(0.18, 0.3, 3.8, 7);
    const canopyGeom = createAcaciaCanopyGeometry();
    const trunkInst = new THREE.InstancedMesh(trunkGeom, barkMat, acaciaSpots.length);
    const canopyInst = new THREE.InstancedMesh(canopyGeom, canopyMat, acaciaSpots.length);
    trunkInst.castShadow = true;
    canopyInst.castShadow = true;
    canopyInst.receiveShadow = true;

    const greenPalette = [
      new THREE.Color(0x4b6e35),
      new THREE.Color(0x5b7c3e),
      new THREE.Color(0x3f612d),
      new THREE.Color(0x6c8644),
    ];

    acaciaSpots.forEach((t, i) => {
      const y = groundHeightAt(t.x, t.z);
      dummy.position.set(t.x, y + 1.9 * t.scale, t.z);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(t.scale, t.scale, t.scale);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(t.x, y + 4.05 * t.scale, t.z);
      dummy.updateMatrix();
      canopyInst.setMatrixAt(i, dummy.matrix);
      canopyInst.setColorAt(i, greenPalette[i % greenPalette.length]);
    });

    trunkInst.instanceMatrix.needsUpdate = true;
    canopyInst.instanceMatrix.needsUpdate = true;
    if (canopyInst.instanceColor) canopyInst.instanceColor.needsUpdate = true;
    group.add(trunkInst, canopyInst);
  }

  if (palmSpots.length > 0) {
    const palmTrunkGeom = new THREE.CylinderGeometry(0.16, 0.26, 7.6, 7);
    const palmCrownGeom = createPalmCrownGeometry();
    const palmTrunkInst = new THREE.InstancedMesh(palmTrunkGeom, barkMat, palmSpots.length);
    const palmCrownInst = new THREE.InstancedMesh(palmCrownGeom, canopyMat, palmSpots.length);
    palmTrunkInst.castShadow = true;
    palmCrownInst.castShadow = true;

    const palmGreens = [
      new THREE.Color(0x527a3a),
      new THREE.Color(0x426b2f),
      new THREE.Color(0x648842),
    ];

    palmSpots.forEach((p, i) => {
      const y = groundHeightAt(p.x, p.z);
      dummy.position.set(p.x, y + 3.8 * p.scale, p.z);
      dummy.rotation.set(0.03, p.yaw, -0.02);
      dummy.scale.set(p.scale, p.scale, p.scale);
      dummy.updateMatrix();
      palmTrunkInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(p.x, y + 7.5 * p.scale, p.z);
      dummy.rotation.set(0, p.yaw, 0);
      dummy.updateMatrix();
      palmCrownInst.setMatrixAt(i, dummy.matrix);
      palmCrownInst.setColorAt(i, palmGreens[i % palmGreens.length]);
    });

    palmTrunkInst.instanceMatrix.needsUpdate = true;
    palmCrownInst.instanceMatrix.needsUpdate = true;
    if (palmCrownInst.instanceColor) palmCrownInst.instanceColor.needsUpdate = true;
    group.add(palmTrunkInst, palmCrownInst);
  }

  const obstacleCircles: UrbanObstacleCircle[] = [
    ...kioskCandidates.map((k) => ({ x: k.x, z: k.z, radius: 1.8 })),
    ...acaciaSpots.map((t) => ({ x: t.x, z: t.z, radius: 0.65 })),
    ...palmSpots.map((p) => ({ x: p.x, z: p.z, radius: 0.55 })),
  ];

  return {
    group,
    contemporaryPropsGroup,
    fineDetailGroup,
    obstacleCircles,
    propsSummary: {
      kiosksCount: kioskCandidates.length,
      streetlightsCount: cappedLights.length,
      acaciaTreesCount: acaciaSpots.length,
      palmTreesCount: palmSpots.length,
      hasCommunityCourt: courtSpot !== null,
    },
  };
}
