/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeightAt } from './luandaCoordinates';

export const CENTRO_TRAFFIC_LIGHT_POS = { x: 15.4, z: 15.7 } as const;
export const CENTRO_CROSSWALK_WALK_AXIS = { dx: 0.48, dz: -0.877 } as const;

export interface TrafficLightVisualHandle {
  readonly group: THREE.Group;
  updateSignal(vehiclePhase: 'green' | 'red'): void;
  dispose(): void;
}

/**
 * Builds the functional traffic light pole, vehicle red/green lamp lenses,
 * pedestrian green indicator, and white zebra crosswalk markings at
 * the Centro UV1 intersection (merged into 5 total draw calls).
 */
export function buildCentroTrafficLightVisual(
  sampleGroundY: (x: number, z: number) => number = groundHeightAt,
): TrafficLightVisualHandle {
  const group = new THREE.Group();
  group.name = 'CentroTrafficLightAndCrosswalk';

  const cx = CENTRO_TRAFFIC_LIGHT_POS.x;
  const cz = CENTRO_TRAFFIC_LIGHT_POS.z;
  const groundY = sampleGroundY(cx, cz);

  const poleX = cx - 4.2;
  const poleZ = cz + 3.4;
  const poleY = sampleGroundY(poleX, poleZ);

  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x262c36,
    roughness: 0.55,
    metalness: 0.35,
  });

  // 1 draw: Merged pole + overhang arm + signal box + pedestrian box
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 4.4, 8);
  poleGeo.translate(poleX, poleY + 2.2, poleZ);

  const armGeo = new THREE.BoxGeometry(2.2, 0.12, 0.12);
  armGeo.rotateY(0.55);
  armGeo.translate(poleX + 0.9, poleY + 4.25, poleZ - 0.65);

  const boxCenter = new THREE.Vector3(poleX + 1.65, poleY + 3.85, poleZ - 1.15);
  const boxGeo = new THREE.BoxGeometry(0.42, 0.85, 0.36);
  boxGeo.rotateY(0.55);
  boxGeo.translate(boxCenter.x, boxCenter.y, boxCenter.z);

  const pedBoxGeo = new THREE.BoxGeometry(0.28, 0.42, 0.24);
  pedBoxGeo.rotateY(0.55);
  pedBoxGeo.translate(poleX, poleY + 2.35, poleZ);

  const metalMerged = mergeGeometries([poleGeo, armGeo, boxGeo, pedBoxGeo], false)!;
  poleGeo.dispose();
  armGeo.dispose();
  boxGeo.dispose();
  pedBoxGeo.dispose();
  const metalMesh = new THREE.Mesh(metalMerged, metalMat);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xff2b2b,
    emissive: 0xff1e1e,
    emissiveIntensity: 0.15,
    roughness: 0.25,
  });
  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x22e66b,
    emissive: 0x16e060,
    emissiveIntensity: 3.4,
    roughness: 0.25,
  });

  // 2 draws: Merged front+back red lenses, merged front+back green lenses
  const makeDualLens = (yLocal: number): THREE.BufferGeometry => {
    const f = new THREE.CircleGeometry(0.11, 10);
    f.translate(0, yLocal, 0.19);
    f.rotateY(0.55);
    f.translate(boxCenter.x, boxCenter.y, boxCenter.z);

    const b = new THREE.CircleGeometry(0.11, 10);
    b.rotateY(Math.PI);
    b.translate(0, yLocal, -0.19);
    b.rotateY(0.55);
    b.translate(boxCenter.x, boxCenter.y, boxCenter.z);

    const merged = mergeGeometries([f, b], false)!;
    f.dispose();
    b.dispose();
    return merged;
  };

  const redLensGeo = makeDualLens(0.2);
  const greenLensGeo = makeDualLens(-0.2);
  const redMesh = new THREE.Mesh(redLensGeo, redMat);
  const greenMesh = new THREE.Mesh(greenLensGeo, greenMat);

  // 1 draw: Pedestrian green signal lens
  const pedGreenMat = new THREE.MeshStandardMaterial({
    color: 0x22e66b,
    emissive: 0x16e060,
    emissiveIntensity: 0.15,
    roughness: 0.25,
  });
  const pedLensGeo = new THREE.CircleGeometry(0.08, 10);
  pedLensGeo.translate(0, 0.08, 0.13);
  pedLensGeo.rotateY(0.55);
  pedLensGeo.translate(poleX, poleY + 2.35, poleZ);
  const pedLens = new THREE.Mesh(pedLensGeo, pedGreenMat);

  // 1 draw: Merged white zebra crosswalk stripes
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.82,
    metalness: 0.0,
  });
  const walkAngle = Math.atan2(CENTRO_CROSSWALK_WALK_AXIS.dx, CENTRO_CROSSWALK_WALK_AXIS.dz);
  const stripeParts: THREE.BufferGeometry[] = [];
  for (let i = -3; i <= 3; i++) {
    const s = new THREE.PlaneGeometry(0.55, 2.5);
    s.rotateX(-Math.PI / 2);
    s.translate(i * 1.1, 0, 0);
    s.rotateY(walkAngle);
    s.translate(cx, groundY + 0.045, cz);
    stripeParts.push(s);
  }
  const crosswalkGeo = mergeGeometries(stripeParts, false)!;
  for (const p of stripeParts) p.dispose();
  const crosswalkMesh = new THREE.Mesh(crosswalkGeo, stripeMat);

  group.add(metalMesh, redMesh, greenMesh, pedMeshCompat(pedLens), crosswalkMesh);

  return {
    group,
    updateSignal(vehiclePhase: 'green' | 'red') {
      const isVehicleGreen = vehiclePhase === 'green';
      greenMat.emissiveIntensity = isVehicleGreen ? 3.8 : 0.12;
      redMat.emissiveIntensity = isVehicleGreen ? 0.12 : 3.8;
      pedGreenMat.emissiveIntensity = isVehicleGreen ? 0.12 : 3.6;
    },
    dispose() {
      group.removeFromParent();
      metalMerged.dispose();
      redLensGeo.dispose();
      greenLensGeo.dispose();
      pedLensGeo.dispose();
      crosswalkGeo.dispose();
      metalMat.dispose();
      redMat.dispose();
      greenMat.dispose();
      pedGreenMat.dispose();
      stripeMat.dispose();
    },
  };
}

function pedMeshCompat(mesh: THREE.Mesh): THREE.Mesh {
  return mesh;
}
