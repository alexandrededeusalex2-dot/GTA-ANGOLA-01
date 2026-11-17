/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GeoCoordinate, TimeOfDayPreset, UtmCoordinate, Vector3Like } from '../../core/types';

export interface GeographicalIntegrityRecord {
  readonly confirmedData: readonly string[];
  readonly historicalData: readonly string[];
  readonly ungeoreferencedData: readonly string[];
  readonly pendingValidation: readonly string[];
}

/**
 * Coordenada de referência publicada para a Unidade de Vizinhança n.º 1 do Prenda:
 * 08°50'10" S, 13°13'26" E.
 * Identifica um ponto de referência da unidade, não os seus limites cadastrais completos.
 */
export const PRENDA_UV1_PUBLISHED_ORIGIN: GeoCoordinate = {
  lat: -(8 + 50 / 60 + 10 / 3600), // -8.8361111111
  lon: 13 + 13 / 60 + 26 / 3600,   // 13.2238888889
};

export const PRENDA_UV1_PUBLISHED_DMS = '08°50\'10" S, 13°13\'26" E';

/**
 * Registo explícito de integridade geográfica para a Unidade de Vizinhança n.º 1 (Prenda).
 * Separa claramente a base histórica (1963–1965), a ocupação urbana atual verificável (OSM)
 * e os elementos cadastrais ainda pendentes de validação oficial.
 */
export const GEOGRAPHICAL_INTEGRITY_PRENDA_UV1: GeographicalIntegrityRecord = {
  confirmedData: [
    'Ponto de referência publicado: 08°50\'10" S, 13°13\'26" E (WGS84 / EPSG:4326) projetado para UTM 33 Sul (EPSG:32733).',
    '34 polígonos de edifícios reais do OpenStreetMap na envolvente da UV n.º 1, incluindo os 22 blocos residenciais coletivos (com Lotes 1 a 6 nominados).',
    '133 segmentos viários reais (Rua Comandante Arguelles, Av. Revolução de Outubro, Rua Eng. Francisco Sande Lemos, Rua dos Sertanejos, Rua dos Mareantes, vias locais e pedonais) e 20 cruzamentos/impasses.',
    'Equipamentos reais mapeados: Mesquita do Prenda (2 pisos confirmados no OSM), Supermercados Kibabo e Magnite, Hospital do Prenda, Colégio e área de Mercado.',
  ],
  historicalData: [
    'Plano urbanístico de Fernão Lopes Simões de Carvalho (1963–1965, Gabinete de Urbanização da CML / HPIP / Modernism in Africa / Optimistic Suburbia?).',
    'Hierarquia viária do sistema 7V (V3 perimetrais, V4 comercial/coletora, V5 residenciais, V6 acessos locais/impasses, V7 percursos pedonais).',
    'Referência histórica de 22 edifícios residenciais construídos (de 28 previstos), nas tipologias Tipo A (12 pisos), A2/A3, B1 (7 pisos), D1 (7 pisos), D2 (6 pisos) e torres de 16 pisos sobre pilotis com galerias horizontais.',
  ],
  ungeoreferencedData: [
    'Cotas altimétricas topográficas oficiais por edifício e perfis transversais exatos de drenagem e passeios.',
    'Levantamento integral das construções informais individuais e bancas móveis não mapeadas em cartografia aberta.',
    'Plantas de arquitetura individuais digitalizadas por bloco (A2, A3, B1, D1, D2) para atribuição cadastral individual.',
  ],
  pendingValidation: [
    'Confirmação cadastral individual do número exato de pisos e tipologia (A/A2/A3/B1/D1/D2/16P) em cada um dos 22 blocos residenciais onde o OSM não publica building:levels.',
    'Limites oficiais do perímetro histórico e matriz predial da Unidade de Vizinhança n.º 1.',
    'Modelos 3D fotogramétricos ou BIM definitivos em GLB/GLTF por edifício.',
  ],
};

const EARTH_RADIUS_METERS = 6371000;
const DEG_TO_RAD = Math.PI / 180;

// WGS84 ellipsoid constants for EPSG:32733 (UTM Zone 33 South, central meridian 15° E)
const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;
const WGS84_EP2 = WGS84_E2 / (1 - WGS84_E2);
const UTM_K0 = 0.9996;
const UTM_33_LON0_RAD = 15 * DEG_TO_RAD;
const UTM_FALSE_EASTING = 500000;
const UTM_SOUTH_FALSE_NORTHING = 10000000;

export interface SunOrientation {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly keyLightColorHex: number;
  readonly keyLightIntensity: number;
  readonly skyColorHex: number;
  readonly fogColorHex: number;
  readonly hemisphereSkyHex: number;
  readonly hemisphereGroundHex: number;
}

export const LUANDA_TIME_PRESETS: Record<TimeOfDayPreset, SunOrientation> = {
  morning: {
    elevationDeg: 26,
    azimuthDeg: 84,
    keyLightColorHex: 0xffdfb8,
    keyLightIntensity: 2.35,
    skyColorHex: 0xc2d8e8,
    fogColorHex: 0xcadbe6,
    hemisphereSkyHex: 0x9ac6e8,
    hemisphereGroundHex: 0x5c4332,
  },
  noon: {
    elevationDeg: 64,
    azimuthDeg: 145,
    keyLightColorHex: 0xfff3de,
    keyLightIntensity: 2.7,
    skyColorHex: 0x9dc6e6,
    fogColorHex: 0xb7d5eb,
    hemisphereSkyHex: 0x8cc2eb,
    hemisphereGroundHex: 0x664935,
  },
  sunset: {
    elevationDeg: 10,
    azimuthDeg: 258,
    keyLightColorHex: 0xffa45b,
    keyLightIntensity: 2.1,
    skyColorHex: 0x6b4e5f,
    fogColorHex: 0x826164,
    hemisphereSkyHex: 0xb07c87,
    hemisphereGroundHex: 0x3b2920,
  },
};

/**
 * Converte WGS84 (EPSG:4326) para UTM Zona 33 Sul (EPSG:32733).
 */
export function geoToUtm33S(coord: GeoCoordinate): UtmCoordinate {
  const lat = coord.lat * DEG_TO_RAD;
  const lon = coord.lon * DEG_TO_RAD;

  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const tanLat = Math.tan(lat);

  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
  const t = tanLat * tanLat;
  const c = WGS84_EP2 * cosLat * cosLat;
  const a = cosLat * (lon - UTM_33_LON0_RAD);

  const e4 = WGS84_E2 * WGS84_E2;
  const e6 = e4 * WGS84_E2;

  const m =
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat -
      ((3 * WGS84_E2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) * Math.sin(2 * lat) +
      ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat) -
      ((35 * e6) / 3072) * Math.sin(6 * lat));

  const easting =
    UTM_FALSE_EASTING +
    UTM_K0 *
      n *
      (a +
        ((1 - t + c) * Math.pow(a, 3)) / 6 +
        ((5 - 18 * t + t * t + 72 * c - 58 * WGS84_EP2) * Math.pow(a, 5)) / 120);

  const northing =
    UTM_SOUTH_FALSE_NORTHING +
    UTM_K0 *
      (m +
        n *
          tanLat *
          ((a * a) / 2 +
            ((5 - t + 9 * c + 4 * c * c) * Math.pow(a, 4)) / 24 +
            ((61 - 58 * t + t * t + 600 * c - 330 * WGS84_EP2) * Math.pow(a, 6)) / 720));

  return {
    easting: Math.round(easting * 100) / 100,
    northing: Math.round(northing * 100) / 100,
    zone: '33S',
    epsg: 'EPSG:32733',
  };
}

/**
 * Converte UTM Zona 33 Sul (EPSG:32733) de volta para WGS84 (EPSG:4326).
 */
export function utm33SToGeo(utm: { easting: number; northing: number }): GeoCoordinate {
  const x = utm.easting - UTM_FALSE_EASTING;
  const y = utm.northing - UTM_SOUTH_FALSE_NORTHING;

  const e4 = WGS84_E2 * WGS84_E2;
  const e6 = e4 * WGS84_E2;
  const mu = y / (UTM_K0 * WGS84_A * (1 - WGS84_E2 / 4 - (3 * e4) / 64 - (5 * e6) / 256));

  const e1 = (1 - Math.sqrt(1 - WGS84_E2)) / (1 + Math.sqrt(1 - WGS84_E2));
  const e12 = e1 * e1;
  const e13 = e12 * e1;
  const e14 = e13 * e1;

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e13) / 32) * Math.sin(2 * mu) +
    ((21 * e12) / 16 - (55 * e14) / 32) * Math.sin(4 * mu) +
    ((151 * e13) / 96) * Math.sin(6 * mu) +
    ((1097 * e14) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const n1 = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi1 * sinPhi1);
  const r1 = (WGS84_A * (1 - WGS84_E2)) / Math.pow(1 - WGS84_E2 * sinPhi1 * sinPhi1, 1.5);
  const t1 = tanPhi1 * tanPhi1;
  const c1 = WGS84_EP2 * cosPhi1 * cosPhi1;
  const d = x / (n1 * UTM_K0);

  const latRad =
    phi1 -
    ((n1 * tanPhi1) / r1) *
      ((d * d) / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * WGS84_EP2) * Math.pow(d, 4)) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * WGS84_EP2 - 3 * c1 * c1) *
          Math.pow(d, 6)) /
          720);

  const lonRad =
    UTM_33_LON0_RAD +
    (d -
      ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * WGS84_EP2 + 24 * t1 * t1) * Math.pow(d, 5)) /
        120) /
      cosPhi1;

  return {
    lat: Number((latRad / DEG_TO_RAD).toFixed(7)),
    lon: Number((lonRad / DEG_TO_RAD).toFixed(7)),
  };
}

const ORIGIN_UTM33S = geoToUtm33S(PRENDA_UV1_PUBLISHED_ORIGIN);

/**
 * Projeta WGS84 para metros locais (+X Este, -Z Norte, +Y Cima) usando deltas UTM Zona 33 Sul.
 */
export function geoToLocalMetersUtm33S(
  coord: GeoCoordinate,
  origin: GeoCoordinate = PRENDA_UV1_PUBLISHED_ORIGIN,
): Vector3Like {
  const targetUtm = geoToUtm33S(coord);
  const refUtm =
    origin.lat === PRENDA_UV1_PUBLISHED_ORIGIN.lat && origin.lon === PRENDA_UV1_PUBLISHED_ORIGIN.lon
      ? ORIGIN_UTM33S
      : geoToUtm33S(origin);

  const x = Math.round((targetUtm.easting - refUtm.easting) * 100) / 100 || 0;
  const z = Math.round((refUtm.northing - targetUtm.northing) * 100) / 100 || 0;
  return { x, y: groundHeightAt(x, z), z };
}

/**
 * Altura topográfica contínua do terreno urbano do Prenda UV n.º 1.
 * Mantém o patamar habitacional suave e navegável (~0.0m a 1.1m) dentro do núcleo edificado,
 * com suave inclinação periférica costeira sem cortes abruptos.
 */
export function groundHeightAt(x: number, z: number): number {
  const gentleSlope = Math.max(-0.6, Math.min(2.4, (-z * 0.0028) + (x * 0.0014)));
  const microUndulation = Math.sin(x * 0.012) * Math.cos(z * 0.014) * 0.14;
  return Math.round((gentleSlope + microUndulation) * 1000) / 1000;
}

/**
 * Projeta coordenadas WGS84 para metros locais (+X Este, -Z Norte, +Y Cima)
 * relativamente a um ponto de origem explícito.
 */
export function geoToLocalMeters(
  coord: GeoCoordinate,
  origin: GeoCoordinate,
): Vector3Like {
  const latRad = origin.lat * DEG_TO_RAD;
  const dLat = (coord.lat - origin.lat) * DEG_TO_RAD;
  const dLon = (coord.lon - origin.lon) * DEG_TO_RAD;

  const eastMeters = dLon * EARTH_RADIUS_METERS * Math.cos(latRad);
  const northMeters = dLat * EARTH_RADIUS_METERS;

  return {
    x: Math.round(eastMeters * 100) / 100 || 0,
    y: 0,
    z: Math.round(-northMeters * 100) / 100 || 0,
  };
}

/**
 * Converte metros locais de volta para coordenadas WGS84 relativamente a uma origem explícita.
 */
export function localMetersToGeo(
  pos: Vector3Like,
  origin: GeoCoordinate,
): GeoCoordinate {
  const latRad = origin.lat * DEG_TO_RAD;
  const dLat = -pos.z / EARTH_RADIUS_METERS;
  const dLon = pos.x / (EARTH_RADIUS_METERS * Math.cos(latRad));

  return {
    lat: Number((origin.lat + dLat / DEG_TO_RAD).toFixed(6)),
    lon: Number((origin.lon + dLon / DEG_TO_RAD).toFixed(6)),
  };
}

/**
 * Calcula chave determinística de chunk para carregamento progressivo em Android.
 */
export function getChunkKey(pos: Vector3Like, chunkSizeMeters = 128): string {
  const cx = Math.floor(pos.x / chunkSizeMeters);
  const cz = Math.floor(pos.z / chunkSizeMeters);
  return `chunk_${cx}_${cz}`;
}
