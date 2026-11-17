/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import cartografiaBundle from '../../../CARTOGRAFIA/LUANDA/PRENDA/UV_01/GEOJSON/uv01_cartografia.json';
import type { UtmCoordinate, Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import type { LocalPoint2D } from '../world/PrendaCartography';
import { geoToLocalMetersUtm33S, groundHeightAt } from '../world/luandaCoordinates';
import { resolveCandongueiroWheels, type VehicleWheelRig } from './VehicleController';
import vehicleManifest from '../vehicles/manifest.json';

export const CANDONGUEIRO_INTERACTION_RADIUS_METERS = 2.5;
export const CANDONGUEIRO_ENTER_PROMPT = 'Entrar [E]';
export const CANDONGUEIRO_EXIT_PROMPT = 'Sair [E]';
export const CANDONGUEIRO_LOCKED_FEEDBACK = 'Candongueiro fechado';

export interface CandongueiroManifest {
  readonly id: string;
  readonly name: string;
  readonly phase: string;
  readonly url: string;
  readonly license: string;
  readonly origin: string;
  readonly tris: number;
}

export interface ParagemStopSpec {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly street: string;
  readonly osmWayId: number;
  readonly vehicleId: string;
  readonly headingRad: number;
  readonly localPosition: Vector3Like;
  readonly utm33s: UtmCoordinate;
}

export interface VehicleCollisionObb {
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
  readonly angleRad: number;
}

export interface FourWheelPlacement {
  readonly groundY: number;
  readonly pitchRad: number;
  readonly rollRad: number;
  readonly wheelGroundYs: {
    readonly frontLeft: number;
    readonly frontRight: number;
    readonly backLeft: number;
    readonly backRight: number;
  };
}

export interface VehicleInteractionState {
  readonly nearVehicle: boolean;
  readonly distanceMeters: number;
  readonly promptText: string | null;
  readonly feedbackText: string | null;
}

export interface SpawnedCandongueiro {
  readonly id: string;
  readonly stop: ParagemStopSpec;
  readonly rootGroup: THREE.Group;
  obb: VehicleCollisionObb;
  readonly placement: FourWheelPlacement;
  readonly meshCount: number;
  readonly wheelMeshNames: readonly string[];
  readonly wheels: VehicleWheelRig;
}

export const CANDONGUEIRO_DIMENSIONS = {
  width: vehicleManifest.dimensionsMeters.width,
  height: vehicleManifest.dimensionsMeters.height,
  length: vehicleManifest.dimensionsMeters.length,
  wheelRadius: vehicleManifest.dimensionsMeters.wheelRadius,
} as const;

const WHEEL_CONTACT_OFFSETS = {
  frontLeft: { x: 0.69, z: 1.125 },
  frontRight: { x: -0.69, z: 1.125 },
  backLeft: { x: 0.69, z: -1.125 },
  backRight: { x: -0.69, z: -1.125 },
} as const;

export function getCandongueiroManifest(): CandongueiroManifest {
  return vehicleManifest;
}

export function getParagensUv01(): readonly ParagemStopSpec[] {
  const paragensGeoJson = cartografiaBundle.paragens;
  return paragensGeoJson.features.map((feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    const localPosition = geoToLocalMetersUtm33S({ lat, lon });
    const p = feat.properties;
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      street: p.street,
      osmWayId: p.osmWayId,
      vehicleId: p.vehicleId,
      headingRad: p.headingRad,
      localPosition,
      utm33s: p.utm33s as UtmCoordinate,
    };
  });
}

function rotateLocalXZ(
  localX: number,
  localZ: number,
  headingRad: number,
): { x: number; z: number } {
  const sinY = Math.sin(headingRad);
  const cosY = Math.cos(headingRad);
  return {
    x: localX * cosY + localZ * sinY,
    z: -localX * sinY + localZ * cosY,
  };
}

/**
 * Computes downward wheel raycast contact heights at the 4 modeled wheel positions
 * so all 4 wheels settle cleanly onto the sloped Luanda asphalt surface.
 */
export function computeFourWheelGroundPlacement(
  centerX: number,
  centerZ: number,
  headingRad: number,
  sampleGroundY: (x: number, z: number) => number = groundHeightAt,
): FourWheelPlacement {
  const sampleWheel = (offset: { readonly x: number; readonly z: number }): number => {
    const rotated = rotateLocalXZ(offset.x, offset.z, headingRad);
    return sampleGroundY(centerX + rotated.x, centerZ + rotated.z);
  };

  const frontLeft = sampleWheel(WHEEL_CONTACT_OFFSETS.frontLeft);
  const frontRight = sampleWheel(WHEEL_CONTACT_OFFSETS.frontRight);
  const backLeft = sampleWheel(WHEEL_CONTACT_OFFSETS.backLeft);
  const backRight = sampleWheel(WHEEL_CONTACT_OFFSETS.backRight);

  const groundY = (frontLeft + frontRight + backLeft + backRight) * 0.25;
  const frontAvg = (frontLeft + frontRight) * 0.5;
  const backAvg = (backLeft + backRight) * 0.5;
  const leftAvg = (frontLeft + backLeft) * 0.5;
  const rightAvg = (frontRight + backRight) * 0.5;

  const wheelbase = WHEEL_CONTACT_OFFSETS.frontLeft.z - WHEEL_CONTACT_OFFSETS.backLeft.z;
  const trackWidth = WHEEL_CONTACT_OFFSETS.frontLeft.x - WHEEL_CONTACT_OFFSETS.frontRight.x;

  // Three.js +Z forward: nose up = negative rotation.x; left up = negative rotation.z
  const pitchRad = THREE.MathUtils.clamp(-Math.atan2(frontAvg - backAvg, wheelbase), -0.18, 0.18);
  const rollRad = THREE.MathUtils.clamp(-Math.atan2(leftAvg - rightAvg, trackWidth), -0.18, 0.18);

  return {
    groundY,
    pitchRad,
    rollRad,
    wheelGroundYs: {
      frontLeft,
      frontRight,
      backLeft,
      backRight,
    },
  };
}

/**
 * Creates a lightweight 2D oriented bounding box strictly for collision (never rendered).
 */
export function createVehicleObb(
  centerX: number,
  centerZ: number,
  headingRad: number,
  length = CANDONGUEIRO_DIMENSIONS.length,
  width = CANDONGUEIRO_DIMENSIONS.width,
): VehicleCollisionObb {
  return {
    centerX,
    centerZ,
    length,
    width,
    angleRad: Math.PI * 0.5 - headingRad,
  };
}

/**
 * Resolves 2D circle-vs-OBB collision between the walking explorer and the parked Candongueiro.
 */
export function resolveVehicleCollision2D(
  x: number,
  z: number,
  radius: number,
  obb: VehicleCollisionObb,
): LocalPoint2D {
  const dx = x - obb.centerX;
  const dz = z - obb.centerZ;
  const maxReach = Math.hypot(obb.length * 0.5, obb.width * 0.5) + radius + 0.25;
  if (Math.abs(dx) > maxReach || Math.abs(dz) > maxReach) {
    return { x, z };
  }

  const cosA = Math.cos(-obb.angleRad);
  const sinA = Math.sin(-obb.angleRad);
  const localU = dx * cosA - dz * sinA;
  const localV = dx * sinA + dz * cosA;

  const halfL = obb.length * 0.5;
  const halfW = obb.width * 0.5;

  const clampedU = Math.max(-halfL, Math.min(halfL, localU));
  const clampedV = Math.max(-halfW, Math.min(halfW, localV));

  const diffU = localU - clampedU;
  const diffV = localV - clampedV;
  const distSq = diffU * diffU + diffV * diffV;

  if (distSq >= radius * radius) {
    return { x, z };
  }

  let pushU = 0;
  let pushV = 0;
  if (distSq > 1e-6) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    pushU = (diffU / dist) * overlap;
    pushV = (diffV / dist) * overlap;
  } else {
    const penU = halfL - Math.abs(localU) + radius;
    const penV = halfW - Math.abs(localV) + radius;
    if (penU < penV) {
      pushU = localU >= 0 ? penU : -penU;
    } else {
      pushV = localV >= 0 ? penV : -penV;
    }
  }

  const cosPos = Math.cos(obb.angleRad);
  const sinPos = Math.sin(obb.angleRad);
  return {
    x: x + (pushU * cosPos - pushV * sinPos),
    z: z + (pushU * sinPos + pushV * cosPos),
  };
}

export function computeVehicleInteractionState(
  playerPos: Vector3Like,
  vehiclePos: { readonly x: number; readonly z: number },
  feedbackRemainingSeconds: number,
  interactionRadius = CANDONGUEIRO_INTERACTION_RADIUS_METERS,
): VehicleInteractionState {
  const distanceMeters = Math.hypot(playerPos.x - vehiclePos.x, playerPos.z - vehiclePos.z);
  const nearVehicle = distanceMeters <= interactionRadius;
  return {
    nearVehicle,
    distanceMeters,
    promptText: nearVehicle ? CANDONGUEIRO_ENTER_PROMPT : null,
    feedbackText: feedbackRemainingSeconds > 0 ? CANDONGUEIRO_LOCKED_FEEDBACK : null,
  };
}

/**
 * Loads and places the real low-poly Candongueiro GLB at the Mercado UV1 stop.
 * Strict Phase 5 constraints: no geometric primitives, no shadows, no skeleton, no physics body.
 */
export async function spawnCandongueiroVehicle(
  assetManager: AssetManager,
  stop: ParagemStopSpec,
  sampleGroundY: (x: number, z: number) => number,
): Promise<SpawnedCandongueiro> {
  const manifest = getCandongueiroManifest();
  const gltf = await assetManager.loadGltfModel('vehicle-candongueiro-low', manifest.url);

  const rootGroup = new THREE.Group();
  rootGroup.name = `Vehicle_${stop.vehicleId}`;

  const modelRoot = gltf.scene;
  let meshCount = 0;
  const wheelMeshNames: string[] = [];

  modelRoot.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) {
      const mesh = node as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;
      meshCount += 1;
      if (node.name.startsWith('wheel-')) {
        wheelMeshNames.push(node.name);
      }
    }
  });

  if (meshCount < 5 || wheelMeshNames.length !== 4) {
    throw new Error(
      `Modelo GLB de veículo inválido em ${manifest.url}: esperados carroçaria + 4 rodas modeladas.`,
    );
  }

  const wheels = resolveCandongueiroWheels(modelRoot);
  if (!wheels.frontLeft || !wheels.frontRight || !wheels.rearLeft || !wheels.rearRight) {
    throw new Error(
      `Modelo GLB de veículo inválido em ${manifest.url}: não foi possível identificar as 4 rodas.`,
    );
  }

  rootGroup.add(modelRoot);

  const placement = computeFourWheelGroundPlacement(
    stop.localPosition.x,
    stop.localPosition.z,
    stop.headingRad,
    sampleGroundY,
  );

  rootGroup.position.set(stop.localPosition.x, placement.groundY, stop.localPosition.z);
  rootGroup.rotation.order = 'YXZ';
  rootGroup.rotation.set(placement.pitchRad, stop.headingRad, placement.rollRad);
  rootGroup.updateMatrixWorld(true);

  const obb = createVehicleObb(stop.localPosition.x, stop.localPosition.z, stop.headingRad);

  return {
    id: stop.vehicleId,
    stop,
    rootGroup,
    obb,
    placement,
    meshCount,
    wheelMeshNames,
    wheels,
  };
}
