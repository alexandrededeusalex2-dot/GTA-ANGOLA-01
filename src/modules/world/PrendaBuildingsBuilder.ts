/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PrendaPbrMaterialPack } from '../../resources/PrendaTextures';
import type {
  LocalPoint2D,
  PrendaBuildingRecord,
  PrendaCartographyDataset,
} from './PrendaCartography';
import { groundHeightAt } from './luandaCoordinates';

export interface PrendaBuildingsBuildResult {
  readonly group: THREE.Group;
  readonly historicalGroup: THREE.Group;
  readonly contemporaryAdaptationsGroup: THREE.Group;
  readonly interactableMeshes: readonly THREE.Mesh[];
  readonly buildingMap: ReadonlyMap<string, PrendaBuildingRecord>;
}

function buildFootprintShape(
  polygon: readonly LocalPoint2D[],
  centerX: number,
  centerZ: number,
  scaleFactor = 1,
): THREE.Shape {
  const shape = new THREE.Shape();
  const openCount =
    polygon.length > 1 &&
    polygon[0].x === polygon[polygon.length - 1].x &&
    polygon[0].z === polygon[polygon.length - 1].z
      ? polygon.length - 1
      : polygon.length;

  for (let i = 0; i < openCount; i++) {
    const px = (polygon[i].x - centerX) * scaleFactor;
    // Shape uses +Y which maps to -Z after rotateX(-Math.PI/2)
    const py = -(polygon[i].z - centerZ) * scaleFactor;
    if (i === 0) shape.moveTo(px, py);
    else shape.lineTo(px, py);
  }
  shape.closePath();
  return shape;
}

/**
 * Computes clean metric world UVs on vertical building walls so 1 vertical tile = 2.95m (1 story)
 * and 1 horizontal tile = 7.5m (2 Prenda facade bays), avoiding stretched textures on any polygon.
 */
function applyArchitecturalWallUvs(geom: THREE.BufferGeometry, storyHeightMeters = 2.95): void {
  const pos = geom.attributes.position;
  const norm = geom.attributes.normal;
  const uv = geom.attributes.uv;
  if (!pos || !norm || !uv) return;

  for (let i = 0; i < pos.count; i++) {
    const nx = norm.getX(i);
    const ny = norm.getY(i);
    const nz = norm.getZ(i);
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (Math.abs(ny) > 0.7) {
      // Roof / soffit planar UVs
      uv.setXY(i, x / 8, z / 8);
    } else {
      // Side wall UVs projected along dominant horizontal tangent
      const uHoriz = Math.abs(nx) > Math.abs(nz) ? z : x;
      uv.setXY(i, uHoriz / 7.5, y / storyHeightMeters);
    }
  }
  uv.needsUpdate = true;
}

function createExtrudedPrism(
  shape: THREE.Shape,
  height: number,
  storyHeightMeters = 2.95,
): THREE.ExtrudeGeometry {
  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.06,
    bevelSegments: 1,
    curveSegments: 1,
  });
  geom.rotateX(-Math.PI / 2);
  applyArchitecturalWallUvs(geom, storyHeightMeters);
  geom.computeVertexNormals();
  return geom;
}

function pickBlockFacadeMaterial(
  b: PrendaBuildingRecord,
  materials: PrendaPbrMaterialPack,
  index: number,
): THREE.MeshStandardMaterial {
  if (b.category === 'religious-community') return materials.mosqueStucco;
  if (b.category === 'commercial-retail' || b.category === 'contemporary-urban') {
    return materials.facadeContemporaryPaint;
  }
  if (b.category === 'civic-health') return materials.facadeIvoryPlaster;

  // Varied Tropical Modernist concrete & sun-bleached Luanda plaster finishes across the 22 blocks
  const mod = index % 4;
  if (mod === 0) return materials.facadeConcrete;
  if (mod === 1) return materials.facadeWarmOchre;
  if (mod === 2) return materials.facadeIvoryPlaster;
  return materials.facadeContemporaryPaint;
}

interface MatrixRecord {
  readonly position: THREE.Vector3;
  readonly rotationY: number;
  readonly scale: THREE.Vector3;
}

function createInstancedBoxes(
  records: readonly MatrixRecord[],
  material: THREE.Material,
  name: string,
  castShadow = true,
): THREE.InstancedMesh | null {
  if (records.length === 0) return null;
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geom, material, records.length);
  inst.name = name;
  inst.castShadow = castShadow;
  inst.receiveShadow = true;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    dummy.position.copy(r.position);
    dummy.rotation.set(0, r.rotationY, 0);
    dummy.scale.copy(r.scale);
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  inst.instanceMatrix.needsUpdate = true;
  inst.computeBoundingSphere();
  return inst;
}

export function buildPrendaBuildings(
  dataset: PrendaCartographyDataset,
  materials: PrendaPbrMaterialPack,
): PrendaBuildingsBuildResult {
  const group = new THREE.Group();
  group.name = 'PrendaBuildingsUV01';

  const historicalGroup = new THREE.Group();
  historicalGroup.name = 'PrendaHistoricalCore1965';
  const contemporaryAdaptationsGroup = new THREE.Group();
  contemporaryAdaptationsGroup.name = 'PrendaContemporaryAdaptations';

  group.add(historicalGroup);
  group.add(contemporaryAdaptationsGroup);

  const interactableMeshes: THREE.Mesh[] = [];
  const buildingMap = new Map<string, PrendaBuildingRecord>();

  // Instanced architectural ribs across all 22 residential blocks (minimizes draw calls for Android)
  const pilotisPierMatrices: MatrixRecord[] = [];
  const briseSoleilMatrices: MatrixRecord[] = [];
  const roofTankMatrices: MatrixRecord[] = [];
  const groundKioskMatrices: MatrixRecord[] = [];
  const groundAwningMatrices: MatrixRecord[] = [];

  const batchedPlinths: { historical: THREE.BufferGeometry[]; contemporary: THREE.BufferGeometry[] } = {
    historical: [],
    contemporary: [],
  };
  const batchedCobogo: { historical: THREE.BufferGeometry[]; contemporary: THREE.BufferGeometry[] } = {
    historical: [],
    contemporary: [],
  };
  const batchedRoofs: { historical: THREE.BufferGeometry[]; contemporary: THREE.BufferGeometry[] } = {
    historical: [],
    contemporary: [],
  };

  const pushTranslatedGeom = (
    bucket: THREE.BufferGeometry[],
    geom: THREE.BufferGeometry,
    tx: number,
    ty: number,
    tz: number,
    rotY = 0,
  ) => {
    const g = geom.index ? geom.toNonIndexed() : geom;
    if (g !== geom) geom.dispose();
    if (rotY !== 0) g.rotateY(rotY);
    g.translate(tx, ty, tz);
    bucket.push(g);
  };

  dataset.buildings.forEach((b, idx) => {
    buildingMap.set(b.id, b);

    const eraKey = b.era === 'historical-1965-adapted' ? 'historical' : 'contemporary';
    const targetGroup = eraKey === 'historical' ? historicalGroup : contemporaryAdaptationsGroup;

    const buildingGroup = new THREE.Group();
    buildingGroup.name = `Building_${b.id}`;
    buildingGroup.position.set(b.obb.centerX, b.baseElevation, b.obb.centerZ);

    const outerShape = buildFootprintShape(b.localPolygon, b.obb.centerX, b.obb.centerZ, 1);
    const pilotisHeight = b.hasPilotis ? 3.55 : 0;
    const upperHeight = Math.max(3.2, b.roofHeightMeters - pilotisHeight);

    // 1. Foundation concrete plinth anchored below terrain (-0.6m) - batched per era
    const plinthGeom = createExtrudedPrism(outerShape, 0.85, 1);
    pushTranslatedGeom(batchedPlinths[eraKey], plinthGeom, b.obb.centerX, b.baseElevation - 0.6, b.obb.centerZ);

    // 2. Main Architectural Volume (elevated on pilotis for the 22 modernist blocks)
    const bodyShape = outerShape;
    const bodyGeom = createExtrudedPrism(bodyShape, upperHeight, 2.95);
    const facadeMat = pickBlockFacadeMaterial(b, materials, idx);
    const bodyMesh = new THREE.Mesh(bodyGeom, facadeMat);
    bodyMesh.position.y = pilotisHeight + 0.15;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    bodyMesh.userData.buildingId = b.id;
    buildingGroup.add(bodyMesh);
    interactableMeshes.push(bodyMesh);

    // 3. Recessed Pilotis Undercroft Lobby & Cobogó Stairwell Core for Modernist Blocks
    if (b.hasPilotis) {
      const coreShape = buildFootprintShape(b.localPolygon, b.obb.centerX, b.obb.centerZ, 0.54);
      const coreGeom = createExtrudedPrism(coreShape, pilotisHeight + 0.3, 2.95);
      pushTranslatedGeom(batchedCobogo[eraKey], coreGeom, b.obb.centerX, b.baseElevation + 0.05, b.obb.centerZ);

      // Projecting stairwell / elevator core tower with perforated cobogó screen
      const stairW = Math.min(4.6, b.obb.width * 0.34);
      const stairD = Math.min(5.2, b.obb.length * 0.14);
      const stairH = b.roofHeightMeters + 2.4;
      const stairGeom = new THREE.BoxGeometry(stairD, stairH, stairW);
      const cosA = Math.cos(b.obb.angleRad);
      const sinA = Math.sin(b.obb.angleRad);
      const stairOffsetV = b.obb.width * 0.44;
      pushTranslatedGeom(
        batchedCobogo[eraKey],
        stairGeom,
        b.obb.centerX - stairOffsetV * sinA,
        b.baseElevation + stairH * 0.5,
        b.obb.centerZ + stairOffsetV * cosA,
        -b.obb.angleRad,
      );

      // Cantilevered roof overhang slab + parapet
      const roofShape = buildFootprintShape(b.localPolygon, b.obb.centerX, b.obb.centerZ, 1.035);
      const roofGeom = createExtrudedPrism(roofShape, 0.55, 1);
      pushTranslatedGeom(
        batchedRoofs[eraKey],
        roofGeom,
        b.obb.centerX,
        b.baseElevation + pilotisHeight + upperHeight + 0.12,
        b.obb.centerZ,
      );

      // Collect instanced pilotis columns along both long facades
      const halfL = b.obb.length * 0.44;
      const halfW = b.obb.width * 0.43;
      const colSteps = Math.max(3, Math.floor(b.obb.length / 6.2));
      for (let s = 0; s <= colSteps; s++) {
        const u = -halfL + (s / colSteps) * (halfL * 2);
        for (const vSign of [-1, 1]) {
          const v = vSign * halfW;
          const wx = b.obb.centerX + u * cosA - v * sinA;
          const wz = b.obb.centerZ + u * sinA + v * cosA;
          pilotisPierMatrices.push({
            position: new THREE.Vector3(wx, b.baseElevation + pilotisHeight * 0.5, wz),
            rotationY: -b.obb.angleRad,
            scale: new THREE.Vector3(0.68, pilotisHeight + 0.45, 0.68),
          });
        }
      }

      // Collect instanced vertical brise-soleil concrete fins along gallery facades
      const finSteps = Math.max(4, Math.floor(b.obb.length / 4.8));
      for (let s = 1; s < finSteps; s++) {
        const u = -halfL + (s / finSteps) * (halfL * 2);
        for (const vSign of [-1, 1]) {
          const v = vSign * (b.obb.width * 0.515);
          const wx = b.obb.centerX + u * cosA - v * sinA;
          const wz = b.obb.centerZ + u * sinA + v * cosA;
          briseSoleilMatrices.push({
            position: new THREE.Vector3(
              wx,
              b.baseElevation + pilotisHeight + upperHeight * 0.5 + 0.15,
              wz,
            ),
            rotationY: -b.obb.angleRad,
            scale: new THREE.Vector3(0.24, upperHeight - 0.3, 0.68),
          });
        }
      }

      // Rooftop water tanks (*depósitos de água*)
      const tankCount = b.obb.length > 42 ? 2 : 1;
      for (let t = 0; t < tankCount; t++) {
        const u = tankCount === 1 ? 0 : (t === 0 ? -12 : 12);
        const wx = b.obb.centerX + u * cosA;
        const wz = b.obb.centerZ + u * sinA;
        roofTankMatrices.push({
          position: new THREE.Vector3(wx, b.baseElevation + b.roofHeightMeters + 1.4, wz),
          rotationY: -b.obb.angleRad,
          scale: new THREE.Vector3(3.4, 2.1, 2.4),
        });
      }

      // Contemporary ground-floor adaptations (cantinas / enclosed pilotis shops on selected bays)
      if (idx % 2 === 0) {
        const u = (idx % 4 === 0 ? 1 : -1) * Math.min(8, b.obb.length * 0.22);
        const v = b.obb.width * 0.36;
        const wx = b.obb.centerX + u * cosA - v * sinA;
        const wz = b.obb.centerZ + u * sinA + v * cosA;
        groundKioskMatrices.push({
          position: new THREE.Vector3(wx, b.baseElevation + 1.4, wz),
          rotationY: -b.obb.angleRad,
          scale: new THREE.Vector3(5.6, 2.75, 3.2),
        });
        groundAwningMatrices.push({
          position: new THREE.Vector3(
            wx - 1.8 * sinA,
            b.baseElevation + 2.72,
            wz + 1.8 * cosA,
          ),
          rotationY: -b.obb.angleRad,
          scale: new THREE.Vector3(6.0, 0.14, 2.1),
        });
      }
    } else if (b.category === 'religious-community') {
      // Mesquita do Prenda: Portico roof parapet + iconic minaret tower
      const roofShape = buildFootprintShape(b.localPolygon, b.obb.centerX, b.obb.centerZ, 1.04);
      const parapet = new THREE.Mesh(
        createExtrudedPrism(roofShape, 0.7, 1),
        materials.structuralConcrete,
      );
      parapet.position.y = upperHeight;
      buildingGroup.add(parapet);

      const minaretTower = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.4, 14.5, 12),
        materials.mosqueStucco,
      );
      minaretTower.position.set(b.obb.length * 0.4, 7.25, -b.obb.width * 0.36);
      minaretTower.castShadow = true;
      buildingGroup.add(minaretTower);

      const minaretDome = new THREE.Mesh(
        new THREE.SphereGeometry(1.22, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
        materials.civicGlass,
      );
      minaretDome.position.set(b.obb.length * 0.4, 14.45, -b.obb.width * 0.36);
      buildingGroup.add(minaretDome);
    } else if (b.category === 'commercial-retail') {
      // Supermercado Kibabo / Magnite: Glazed storefront band + corrugated entrance canopy
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(b.obb.length * 0.86, 0.24, 3.4),
        materials.corrugatedZinc,
      );
      canopy.position.set(0, 3.3, b.obb.width * 0.5 + 1.2);
      canopy.rotation.y = -b.obb.angleRad;
      canopy.castShadow = true;
      buildingGroup.add(canopy);
    } else {
      // Standard civic/contemporary roof cornice (batched per era)
      const roofShape = buildFootprintShape(b.localPolygon, b.obb.centerX, b.obb.centerZ, 1.03);
      const roofGeom = createExtrudedPrism(roofShape, 0.45, 1);
      pushTranslatedGeom(batchedRoofs[eraKey], roofGeom, b.obb.centerX, b.baseElevation + upperHeight + 0.1, b.obb.centerZ);
    }

    targetGroup.add(buildingGroup);
  });

  // Mount batched plinths, cobogo cores/stairs, and roofs per era
  for (const eraKey of ['historical', 'contemporary'] as const) {
    const parent = eraKey === 'historical' ? historicalGroup : contemporaryAdaptationsGroup;
    if (batchedPlinths[eraKey].length > 0) {
      const merged = mergeGeometries(batchedPlinths[eraKey], false);
      for (const g of batchedPlinths[eraKey]) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, materials.structuralConcrete);
        m.receiveShadow = true;
        parent.add(m);
      }
    }
    if (batchedCobogo[eraKey].length > 0) {
      const merged = mergeGeometries(batchedCobogo[eraKey], false);
      for (const g of batchedCobogo[eraKey]) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, materials.cobogoCore);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
      }
    }
    if (batchedRoofs[eraKey].length > 0) {
      const merged = mergeGeometries(batchedRoofs[eraKey], false);
      for (const g of batchedRoofs[eraKey]) g.dispose();
      if (merged) {
        const m = new THREE.Mesh(merged, materials.roofDeck);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
      }
    }
  }

  // Add batched InstancedMeshes to keep draw calls well within Android budgets
  const pilotisInst = createInstancedBoxes(
    pilotisPierMatrices,
    materials.structuralConcrete,
    'PrendaPilotisColumns',
  );
  if (pilotisInst) historicalGroup.add(pilotisInst);

  const briseInst = createInstancedBoxes(
    briseSoleilMatrices,
    materials.structuralConcrete,
    'PrendaBriseSoleilFins',
  );
  if (briseInst) historicalGroup.add(briseInst);

  const tanksInst = createInstancedBoxes(
    roofTankMatrices,
    materials.darkMetal,
    'PrendaRooftopWaterTanks',
    false,
  );
  if (tanksInst) historicalGroup.add(tanksInst);

  const kioskInst = createInstancedBoxes(
    groundKioskMatrices,
    materials.facadeContemporaryPaint,
    'PrendaPilotisCantinas',
  );
  if (kioskInst) contemporaryAdaptationsGroup.add(kioskInst);

  const awningInst = createInstancedBoxes(
    groundAwningMatrices,
    materials.corrugatedZinc,
    'PrendaPilotisAwnings',
  );
  if (awningInst) contemporaryAdaptationsGroup.add(awningInst);

  // Build real OSM perimeter walls & hedges (barrier=wall / barrier=hedge)
  const wallMatrices: MatrixRecord[] = [];
  for (const pub of dataset.publicSpaces) {
    if (!pub.kind.startsWith('barrier:') || pub.points.length < 2) continue;
    for (let i = 0; i < pub.points.length - 1; i++) {
      const a = pub.points[i];
      const b = pub.points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      if (len < 0.8) continue;
      const mx = (a.x + b.x) * 0.5;
      const mz = (a.z + b.z) * 0.5;
      wallMatrices.push({
        position: new THREE.Vector3(mx, groundHeightAt(mx, mz) + 0.95, mz),
        rotationY: -Math.atan2(dz, dx),
        scale: new THREE.Vector3(len, 2.0, 0.35),
      });
    }
  }
  const wallsInst = createInstancedBoxes(
    wallMatrices,
    materials.structuralConcrete,
    'PrendaOsmPerimeterWalls',
    false,
  );
  if (wallsInst) contemporaryAdaptationsGroup.add(wallsInst);

  return {
    group,
    historicalGroup,
    contemporaryAdaptationsGroup,
    interactableMeshes,
    buildingMap,
  };
}
