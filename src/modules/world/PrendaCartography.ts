/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import cartografiaBundle from '../../../CARTOGRAFIA/LUANDA/PRENDA/UV_01/GEOJSON/uv01_cartografia.json';
import type { GeoCoordinate, UrbanSelectionInfo, UtmCoordinate } from '../../core/types';
import { geoToLocalMetersUtm33S, getChunkKey } from './luandaCoordinates';

const edificiosGeoJson = cartografiaBundle.edificios;
const ruasGeoJson = cartografiaBundle.ruas;
const cruzamentosGeoJson = cartografiaBundle.cruzamentos;
const espacosPublicosGeoJson = cartografiaBundle.espacosPublicos;
const ocupacaoContemporaneaGeoJson = cartografiaBundle.ocupacaoContemporanea;

export type System7VRoadTier = 'V3' | 'V4' | 'V5' | 'V6' | 'V7';

export interface LocalPoint2D {
  readonly x: number;
  readonly z: number;
}

export interface BuildingOrientedBox {
  readonly centerX: number;
  readonly centerZ: number;
  readonly length: number;
  readonly width: number;
  readonly angleRad: number;
}

export interface PrendaBuildingRecord {
  readonly id: string;
  readonly osmWayId: number;
  readonly name: string;
  readonly category: string;
  readonly era: 'historical-1965-adapted' | 'contemporary';
  readonly isOneOf22HistoricalBlocks: boolean;
  readonly typologyHypothesis: string;
  readonly typologyConfirmed: boolean;
  readonly estimatedFloors: number;
  readonly floorsConfirmed: boolean;
  readonly hasPilotis: boolean;
  readonly hasGallery: boolean;
  readonly structuralNote: string;
  readonly utm33s: UtmCoordinate;
  readonly centroidGeo: GeoCoordinate;
  readonly localPolygon: readonly LocalPoint2D[];
  readonly obb: BuildingOrientedBox;
  readonly baseElevation: number;
  readonly roofHeightMeters: number;
  readonly chunkKey: string;
}

export interface PrendaRoadSegment {
  readonly id: string;
  readonly osmWayId: number;
  readonly name: string;
  readonly osmHighway: string;
  readonly system7v: System7VRoadTier;
  readonly role: string;
  readonly widthMeters: number;
  readonly sidewalkWidth: number;
  readonly hasNoExit: boolean;
  readonly points: readonly LocalPoint2D[];
  readonly chunkKey: string;
}

export interface PrendaIntersectionNode {
  readonly id: string;
  readonly osmNodeId: number;
  readonly kind: 'cruzamento' | 'cul-de-sac-v6';
  readonly degree: number;
  readonly tiers7V: readonly System7VRoadTier[];
  readonly connectedStreets: readonly string[];
  readonly x: number;
  readonly z: number;
  readonly utm33s: UtmCoordinate;
}

export interface PrendaPublicFeature {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly geometryType: 'Point' | 'LineString' | 'Polygon';
  readonly points: readonly LocalPoint2D[];
  readonly utm33s: UtmCoordinate;
}

export interface PrendaContemporarySpot {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly sourceType: string;
  readonly street: string;
  readonly note: string;
  readonly x: number;
  readonly z: number;
  readonly utm33s: UtmCoordinate;
}

export interface PrendaCartographyDataset {
  readonly buildings: readonly PrendaBuildingRecord[];
  readonly roads: readonly PrendaRoadSegment[];
  readonly intersections: readonly PrendaIntersectionNode[];
  readonly publicSpaces: readonly PrendaPublicFeature[];
  readonly contemporarySpots: readonly PrendaContemporarySpot[];
  readonly stats: {
    readonly totalBuildings: number;
    readonly historical22BlocksCount: number;
    readonly roadSegmentsCount: number;
    readonly intersectionsCount: number;
    readonly publicSpacesCount: number;
    readonly contemporarySpotsCount: number;
    readonly roadCountBy7V: Record<System7VRoadTier, number>;
  };
}

function computePolygonObb(pts: readonly LocalPoint2D[]): BuildingOrientedBox {
  const open = pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].z === pts[pts.length - 1].z
    ? pts.slice(0, -1)
    : pts;

  let cx = 0;
  let cz = 0;
  for (const p of open) {
    cx += p.x;
    cz += p.z;
  }
  cx /= Math.max(1, open.length);
  cz /= Math.max(1, open.length);

  // Find longest edge to align primary axis cleanly with OSM building footprint
  let bestAngle = 0;
  let maxEdgeLen = 0;
  for (let i = 0; i < open.length; i++) {
    const a = open[i];
    const b = open[(i + 1) % open.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      bestAngle = Math.atan2(dz, dx);
    }
  }

  const cosA = Math.cos(-bestAngle);
  const sinA = Math.sin(-bestAngle);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;

  for (const p of open) {
    const dx = p.x - cx;
    const dz = p.z - cz;
    const u = dx * cosA - dz * sinA;
    const v = dx * sinA + dz * cosA;
    if (u < minU) minU = u;
    if (u > maxU) maxU = u;
    if (v < minV) minV = v;
    if (v > maxV) maxV = v;
  }

  // Re-center OBB center in world coords so it fits the exact polygon bounds
  const midU = (minU + maxU) * 0.5;
  const midV = (minV + maxV) * 0.5;
  const cosPos = Math.cos(bestAngle);
  const sinPos = Math.sin(bestAngle);
  const exactCenterX = cx + (midU * cosPos - midV * sinPos);
  const exactCenterZ = cz + (midU * sinPos + midV * cosPos);

  return {
    centerX: exactCenterX,
    centerZ: exactCenterZ,
    length: Math.max(4, maxU - minU),
    width: Math.max(4, maxV - minV),
    angleRad: bestAngle,
  };
}

let cachedDataset: PrendaCartographyDataset | null = null;

export function loadPrendaCartography(): PrendaCartographyDataset {
  if (cachedDataset) return cachedDataset;

  const buildings: PrendaBuildingRecord[] = [];
  for (const feat of edificiosGeoJson.features) {
    const props = feat.properties;
    const ring = feat.geometry.coordinates[0] ?? [];
    if (ring.length < 4) continue;

    let minY = Infinity;
    let lonSum = 0;
    let latSum = 0;
    const openCount = ring.length - 1;
    const localPolygon: LocalPoint2D[] = [];

    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      const local = geoToLocalMetersUtm33S({ lat, lon });
      localPolygon.push({ x: local.x, z: local.z });
      if (local.y < minY) minY = local.y;
      if (i < openCount) {
        lonSum += lon;
        latSum += lat;
      }
    }

    const obb = computePolygonObb(localPolygon);
    const floors = Math.max(1, props.estimatedFloors || 2);
    const floorHeight = props.isOneOf22HistoricalBlocks ? 2.95 : 3.2;
    const pilotisBoost = props.hasPilotis ? 1.15 : 0;
    const roofHeightMeters = Math.round((floors * floorHeight + pilotisBoost) * 100) / 100;

    buildings.push({
      id: props.id,
      osmWayId: props.osmWayId,
      name: props.name,
      category: props.category,
      era: props.era === 'historical-1965-adapted' ? 'historical-1965-adapted' : 'contemporary',
      isOneOf22HistoricalBlocks: Boolean(props.isOneOf22HistoricalBlocks),
      typologyHypothesis: props.typologyHypothesis,
      typologyConfirmed: Boolean(props.typologyConfirmed),
      estimatedFloors: floors,
      floorsConfirmed: Boolean(props.floorsConfirmed),
      hasPilotis: Boolean(props.hasPilotis),
      hasGallery: Boolean(props.hasGallery),
      structuralNote: props.structuralNote,
      utm33s: props.utm33s as UtmCoordinate,
      centroidGeo: {
        lat: Number((latSum / openCount).toFixed(6)),
        lon: Number((lonSum / openCount).toFixed(6)),
      },
      localPolygon,
      obb,
      baseElevation: Number.isFinite(minY) ? minY : 0,
      roofHeightMeters,
      chunkKey: getChunkKey({ x: obb.centerX, y: 0, z: obb.centerZ }, 128),
    });
  }

  const roadCountBy7V: Record<System7VRoadTier, number> = {
    V3: 0,
    V4: 0,
    V5: 0,
    V6: 0,
    V7: 0,
  };

  const roads: PrendaRoadSegment[] = [];
  for (const feat of ruasGeoJson.features) {
    const props = feat.properties;
    const coords = feat.geometry.coordinates;
    if (coords.length < 2) continue;

    const points: LocalPoint2D[] = coords.map(([lon, lat]) => {
      const local = geoToLocalMetersUtm33S({ lat, lon });
      return { x: local.x, z: local.z };
    });

    const tier = props.system7v as System7VRoadTier;
    roadCountBy7V[tier] = (roadCountBy7V[tier] ?? 0) + 1;
    const mid = points[Math.floor(points.length / 2)];

    roads.push({
      id: props.id,
      osmWayId: props.osmWayId,
      name: props.name,
      osmHighway: props.osmHighway,
      system7v: tier,
      role: props.role,
      widthMeters: props.widthMeters,
      sidewalkWidth: props.sidewalkWidth,
      hasNoExit: Boolean(props.hasNoExit),
      points,
      chunkKey: getChunkKey({ x: mid.x, y: 0, z: mid.z }, 128),
    });
  }

  const intersections: PrendaIntersectionNode[] = cruzamentosGeoJson.features.map((feat) => {
    const [lon, lat] = feat.geometry.coordinates;
    const local = geoToLocalMetersUtm33S({ lat, lon });
    return {
      id: feat.properties.id,
      osmNodeId: feat.properties.osmNodeId,
      kind: feat.properties.kind as 'cruzamento' | 'cul-de-sac-v6',
      degree: feat.properties.degree,
      tiers7V: feat.properties.tiers7V as System7VRoadTier[],
      connectedStreets: feat.properties.connectedStreets,
      x: local.x,
      z: local.z,
      utm33s: feat.properties.utm33s as UtmCoordinate,
    };
  });

  const publicSpaces: PrendaPublicFeature[] = espacosPublicosGeoJson.features.map((feat) => {
    const geomType = feat.geometry.type as 'Point' | 'LineString' | 'Polygon';
    let rawCoords: number[][] = [];
    if (geomType === 'Point') {
      rawCoords = [feat.geometry.coordinates as number[]];
    } else if (geomType === 'LineString') {
      rawCoords = feat.geometry.coordinates as number[][];
    } else {
      rawCoords = (feat.geometry.coordinates as number[][][])[0] ?? [];
    }
    const points = rawCoords.map(([lon, lat]) => {
      const local = geoToLocalMetersUtm33S({ lat, lon });
      return { x: local.x, z: local.z };
    });

    return {
      id: feat.properties.id,
      name: feat.properties.name,
      kind: feat.properties.kind,
      geometryType: geomType,
      points,
      utm33s: feat.properties.utm33s as UtmCoordinate,
    };
  });

  const contemporarySpots: PrendaContemporarySpot[] = ocupacaoContemporaneaGeoJson.features.map(
    (feat) => {
      const [lon, lat] = feat.geometry.coordinates;
      const local = geoToLocalMetersUtm33S({ lat, lon });
      const p = feat.properties as Record<string, unknown>;
      return {
        id: String(p.id),
        name: String(p.name),
        kind: String(p.kind),
        sourceType: String(p.sourceType),
        street: typeof p.street === 'string' ? p.street : '',
        note: typeof p.note === 'string' ? p.note : '',
        x: local.x,
        z: local.z,
        utm33s: p.utm33s as UtmCoordinate,
      };
    },
  );

  cachedDataset = {
    buildings,
    roads,
    intersections,
    publicSpaces,
    contemporarySpots,
    stats: {
      totalBuildings: buildings.length,
      historical22BlocksCount: buildings.filter((b) => b.isOneOf22HistoricalBlocks).length,
      roadSegmentsCount: roads.length,
      intersectionsCount: intersections.length,
      publicSpacesCount: publicSpaces.length,
      contemporarySpotsCount: contemporarySpots.length,
      roadCountBy7V,
    },
  };

  return cachedDataset;
}

/**
 * Resolve colisão 2D (círculo vs caixas orientadas OBB) entre explorador em 3.ª pessoa e edifícios reais.
 */
export function resolveBuildingCollision2D(
  x: number,
  z: number,
  radius: number,
  buildings: readonly PrendaBuildingRecord[],
): LocalPoint2D {
  let outX = x;
  let outZ = z;

  for (const b of buildings) {
    const dx = outX - b.obb.centerX;
    const dz = outZ - b.obb.centerZ;
    const maxReach = Math.hypot(b.obb.length * 0.5, b.obb.width * 0.5) + radius + 0.5;
    if (Math.abs(dx) > maxReach || Math.abs(dz) > maxReach) continue;

    const cosA = Math.cos(-b.obb.angleRad);
    const sinA = Math.sin(-b.obb.angleRad);
    const localU = dx * cosA - dz * sinA;
    const localV = dx * sinA + dz * cosA;

    const halfL = b.obb.length * 0.5;
    const halfW = b.obb.width * 0.5;

    const clampedU = Math.max(-halfL, Math.min(halfL, localU));
    const clampedV = Math.max(-halfW, Math.min(halfW, localV));

    const diffU = localU - clampedU;
    const diffV = localV - clampedV;
    const distSq = diffU * diffU + diffV * diffV;

    if (distSq < radius * radius) {
      let pushU = 0;
      let pushV = 0;
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        pushU = (diffU / dist) * overlap;
        pushV = (diffV / dist) * overlap;
      } else {
        // Inside OBB: push out along shortest axis
        const penU = halfL - Math.abs(localU) + radius;
        const penV = halfW - Math.abs(localV) + radius;
        if (penU < penV) {
          pushU = localU >= 0 ? penU : -penU;
        } else {
          pushV = localV >= 0 ? penV : -penV;
        }
      }

      const cosPos = Math.cos(b.obb.angleRad);
      const sinPos = Math.sin(b.obb.angleRad);
      outX += pushU * cosPos - pushV * sinPos;
      outZ += pushU * sinPos + pushV * cosPos;
    }
  }

  return { x: outX, z: outZ };
}

/**
 * Localiza a via mais próxima para exibição contextual no HUD durante a exploração.
 */
export function findNearestStreetLabel(
  x: number,
  z: number,
  roads: readonly PrendaRoadSegment[],
): string {
  let bestDistSq = Infinity;
  let bestLabel = 'Prenda · Núcleo UV n.º 1';

  for (const road of roads) {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i];
      const b = road.points[i + 1];
      const vx = b.x - a.x;
      const vz = b.z - a.z;
      const wx = x - a.x;
      const wz = z - a.z;
      const lenSq = vx * vx + vz * vz;
      const t = lenSq > 0 ? Math.max(0, Math.min(1, (wx * vx + wz * vz) / lenSq)) : 0;
      const px = a.x + t * vx;
      const pz = a.z + t * vz;
      const dSq = (x - px) * (x - px) + (z - pz) * (z - pz);
      if (dSq < bestDistSq) {
        bestDistSq = dSq;
        bestLabel = `${road.name} · ${road.system7v}`;
      }
    }
  }

  return bestDistSq <= 45 * 45 ? bestLabel : 'Prenda · Núcleo UV n.º 1';
}

export function buildingToSelectionInfo(b: PrendaBuildingRecord): UrbanSelectionInfo {
  const confText = b.typologyConfirmed && b.floorsConfirmed
    ? 'Tipologia e pisos confirmados no OpenStreetMap'
    : 'Polígono real OSM · Tipologia/pisos são hipótese zonal HPIP (pendente validação cadastral)';

  return {
    id: b.id,
    title: b.name,
    subtitle: b.typologyHypothesis,
    eraLabel: b.era === 'historical-1965-adapted'
      ? 'Base Histórica 1963–1965 com Adaptação Atual'
      : 'Ocupação Urbana Contemporânea',
    confirmationStatus: confText,
    utm33sLabel: `UTM 33S: ${b.utm33s.easting.toFixed(1)} E, ${b.utm33s.northing.toFixed(1)} N`,
    wgs84Label: `WGS84: ${b.centroidGeo.lat.toFixed(5)}°, ${b.centroidGeo.lon.toFixed(5)}°`,
    details: `${b.estimatedFloors} pisos estimados (${b.roofHeightMeters.toFixed(1)}m) · OSM way/${b.osmWayId} · ${b.structuralNote}`,
  };
}
