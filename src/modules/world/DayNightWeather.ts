/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { TimeOfDayPreset, Vector3Like } from '../../core/types';
import { LUANDA_TIME_PRESETS } from './luandaCoordinates';

export const INITIAL_GAME_HOUR = 7.0; // Starts at 07:00 dawn
export const GAME_HOURS_PER_REAL_MINUTE = 1.0; // 1 real min = 1 game hour
export const RAIN_PARTICLE_COUNT = 200;
export const RAIN_INTERVAL_SECONDS = 600; // ~1x per 10 real minutes
export const RAIN_DURATION_SECONDS = 42;
export const RAIN_NPC_SPEED_MULTIPLIER = 1.45;

export interface DayNightWeatherState {
  readonly gameHour: number; // [0, 24)
  readonly clockLabel: string; // e.g. "07:00"
  readonly speedMultiplier: 1 | 20 | 120;
  readonly isNight: boolean;
  readonly streetlightsOn: boolean;
  readonly isRaining: boolean;
  readonly rainCooldownSec: number;
  readonly rainRemainingSec: number;
  readonly npcSpeedMultiplier: number;
  readonly presetBucket: TimeOfDayPreset;
}

export interface LuandaAtmosphereSample {
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly sunColorHex: number;
  readonly sunIntensity: number;
  readonly fogColorHex: number;
  readonly hemiSkyHex: number;
  readonly hemiGroundHex: number;
  readonly hemiIntensity: number;
  readonly lampEmissiveIntensity: number;
  readonly isNight: boolean;
  readonly streetlightsOn: boolean;
}

export function formatGameClock(hourFloat: number): string {
  const wrapped = ((hourFloat % 24) + 24) % 24;
  const totalMinutes = Math.floor(wrapped * 60) % (24 * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function presetToGameHour(preset: TimeOfDayPreset): number {
  switch (preset) {
    case 'morning':
      return 7.0;
    case 'noon':
      return 13.0;
    case 'sunset':
      return 18.0;
    case 'night':
      return 20.5;
  }
}

export function hourToPresetBucket(hour: number): TimeOfDayPreset {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 19.5 || h < 5.75) return 'night';
  if (h >= 16.5) return 'sunset';
  if (h >= 10.5) return 'noon';
  return 'morning';
}

export function createInitialDayNightState(initialHour = INITIAL_GAME_HOUR): DayNightWeatherState {
  const wrapped = ((initialHour % 24) + 24) % 24;
  const isNight = wrapped >= 19.5 || wrapped < 5.75;
  return {
    gameHour: wrapped,
    clockLabel: formatGameClock(wrapped),
    speedMultiplier: 1,
    isNight,
    streetlightsOn: isNight,
    isRaining: false,
    rainCooldownSec: RAIN_INTERVAL_SECONDS,
    rainRemainingSec: 0,
    npcSpeedMultiplier: 1.0,
    presetBucket: hourToPresetBucket(wrapped),
  };
}

export function stepDayNightWeather(
  current: DayNightWeatherState,
  realDt: number,
  randomFn: () => number = Math.random,
): DayNightWeatherState {
  const dt = Math.max(0, realDt);
  const gameHoursElapsed = (dt / 60) * GAME_HOURS_PER_REAL_MINUTE * current.speedMultiplier;
  const gameHour = (current.gameHour + gameHoursElapsed) % 24;
  const isNight = gameHour >= 19.5 || gameHour < 5.75;

  let isRaining = current.isRaining;
  let rainCooldownSec = current.rainCooldownSec;
  let rainRemainingSec = current.rainRemainingSec;

  if (isRaining) {
    rainRemainingSec -= dt;
    if (rainRemainingSec <= 0) {
      isRaining = false;
      rainRemainingSec = 0;
      const jitter = 0.85 + randomFn() * 0.3;
      rainCooldownSec = RAIN_INTERVAL_SECONDS * jitter;
    }
  } else {
    rainCooldownSec -= dt;
    if (rainCooldownSec <= 0) {
      isRaining = true;
      rainRemainingSec = RAIN_DURATION_SECONDS;
      rainCooldownSec = RAIN_INTERVAL_SECONDS;
    }
  }

  return {
    gameHour,
    clockLabel: formatGameClock(gameHour),
    speedMultiplier: current.speedMultiplier,
    isNight,
    streetlightsOn: isNight,
    isRaining,
    rainCooldownSec,
    rainRemainingSec,
    npcSpeedMultiplier: isRaining ? RAIN_NPC_SPEED_MULTIPLIER : 1.0,
    presetBucket: hourToPresetBucket(gameHour),
  };
}

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function lerpColorHex(hexA: number, hexB: number, t: number): number {
  _cA.setHex(hexA);
  _cB.setHex(hexB);
  _cA.lerp(_cB, Math.max(0, Math.min(1, t)));
  return _cA.getHex();
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

const KEYFRAMES: readonly {
  readonly hour: number;
  readonly elevationDeg: number;
  readonly azimuthDeg: number;
  readonly sunColorHex: number;
  readonly sunIntensity: number;
  readonly fogColorHex: number;
  readonly hemiSkyHex: number;
  readonly hemiGroundHex: number;
  readonly hemiIntensity: number;
}[] = [
  {
    hour: 0,
    elevationDeg: -10,
    azimuthDeg: 325,
    sunColorHex: LUANDA_TIME_PRESETS.night.keyLightColorHex,
    sunIntensity: 0.35,
    fogColorHex: LUANDA_TIME_PRESETS.night.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.night.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.night.hemisphereGroundHex,
    hemiIntensity: 0.45,
  },
  {
    hour: 5.5,
    elevationDeg: 2,
    azimuthDeg: 70,
    sunColorHex: 0xffb382,
    sunIntensity: 0.9,
    fogColorHex: 0x8795aa,
    hemiSkyHex: 0x5c759e,
    hemiGroundHex: 0x3b2c25,
    hemiIntensity: 0.65,
  },
  {
    hour: 7.0,
    elevationDeg: LUANDA_TIME_PRESETS.morning.elevationDeg,
    azimuthDeg: LUANDA_TIME_PRESETS.morning.azimuthDeg,
    sunColorHex: LUANDA_TIME_PRESETS.morning.keyLightColorHex,
    sunIntensity: LUANDA_TIME_PRESETS.morning.keyLightIntensity,
    fogColorHex: LUANDA_TIME_PRESETS.morning.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.morning.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.morning.hemisphereGroundHex,
    hemiIntensity: 0.92,
  },
  {
    hour: 13.0,
    elevationDeg: LUANDA_TIME_PRESETS.noon.elevationDeg,
    azimuthDeg: LUANDA_TIME_PRESETS.noon.azimuthDeg,
    sunColorHex: LUANDA_TIME_PRESETS.noon.keyLightColorHex,
    sunIntensity: LUANDA_TIME_PRESETS.noon.keyLightIntensity,
    fogColorHex: LUANDA_TIME_PRESETS.noon.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.noon.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.noon.hemisphereGroundHex,
    hemiIntensity: 1.0,
  },
  {
    hour: 18.0,
    elevationDeg: LUANDA_TIME_PRESETS.sunset.elevationDeg,
    azimuthDeg: LUANDA_TIME_PRESETS.sunset.azimuthDeg,
    sunColorHex: LUANDA_TIME_PRESETS.sunset.keyLightColorHex,
    sunIntensity: LUANDA_TIME_PRESETS.sunset.keyLightIntensity,
    fogColorHex: LUANDA_TIME_PRESETS.sunset.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.sunset.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.sunset.hemisphereGroundHex,
    hemiIntensity: 0.78,
  },
  {
    hour: 20.0,
    elevationDeg: LUANDA_TIME_PRESETS.night.elevationDeg,
    azimuthDeg: LUANDA_TIME_PRESETS.night.azimuthDeg,
    sunColorHex: LUANDA_TIME_PRESETS.night.keyLightColorHex,
    sunIntensity: 0.42,
    fogColorHex: LUANDA_TIME_PRESETS.night.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.night.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.night.hemisphereGroundHex,
    hemiIntensity: 0.48,
  },
  {
    hour: 24.0,
    elevationDeg: -10,
    azimuthDeg: 325,
    sunColorHex: LUANDA_TIME_PRESETS.night.keyLightColorHex,
    sunIntensity: 0.35,
    fogColorHex: LUANDA_TIME_PRESETS.night.fogColorHex,
    hemiSkyHex: LUANDA_TIME_PRESETS.night.hemisphereSkyHex,
    hemiGroundHex: LUANDA_TIME_PRESETS.night.hemisphereGroundHex,
    hemiIntensity: 0.45,
  },
];

export function sampleLuandaAtmosphere(hourFloat: number, isRaining: boolean): LuandaAtmosphereSample {
  const h = ((hourFloat % 24) + 24) % 24;
  let k0 = KEYFRAMES[0];
  let k1 = KEYFRAMES[KEYFRAMES.length - 1];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (h >= KEYFRAMES[i].hour && h <= KEYFRAMES[i + 1].hour) {
      k0 = KEYFRAMES[i];
      k1 = KEYFRAMES[i + 1];
      break;
    }
  }

  const span = Math.max(0.001, k1.hour - k0.hour);
  const t = (h - k0.hour) / span;

  let sunIntensity = lerpNum(k0.sunIntensity, k1.sunIntensity, t);
  let fogColorHex = lerpColorHex(k0.fogColorHex, k1.fogColorHex, t);
  let hemiSkyHex = lerpColorHex(k0.hemiSkyHex, k1.hemiSkyHex, t);
  let hemiIntensity = lerpNum(k0.hemiIntensity, k1.hemiIntensity, t);

  if (isRaining) {
    sunIntensity *= 0.48;
    hemiIntensity *= 0.72;
    fogColorHex = lerpColorHex(fogColorHex, 0x3b4958, 0.62);
    hemiSkyHex = lerpColorHex(hemiSkyHex, 0x4b5c6e, 0.58);
  }

  const isNight = h >= 19.5 || h < 5.75;
  const streetlightsOn = isNight;

  return {
    elevationDeg: lerpNum(k0.elevationDeg, k1.elevationDeg, t),
    azimuthDeg: lerpNum(k0.azimuthDeg, k1.azimuthDeg, t),
    sunColorHex: lerpColorHex(k0.sunColorHex, k1.sunColorHex, t),
    sunIntensity,
    fogColorHex,
    hemiSkyHex,
    hemiGroundHex: lerpColorHex(k0.hemiGroundHex, k1.hemiGroundHex, t),
    hemiIntensity,
    lampEmissiveIntensity: streetlightsOn ? 3.4 : 0.2,
    isNight,
    streetlightsOn,
  };
}

/**
 * Lightweight 200-point THREE.Points rain particle effect centered smoothly around the camera/player.
 */
export class RainParticleSystem {
  readonly points: THREE.Points;
  readonly particleCount = RAIN_PARTICLE_COUNT;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.PointsMaterial;
  private readonly positions: Float32Array;
  private readonly speeds: Float32Array;

  constructor() {
    this.positions = new Float32Array(RAIN_PARTICLE_COUNT * 3);
    this.speeds = new Float32Array(RAIN_PARTICLE_COUNT);

    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      this.positions[i * 3] = (Math.random() - 0.5) * 26;
      this.positions[i * 3 + 1] = Math.random() * 13;
      this.positions[i * 3 + 2] = (Math.random() - 0.5) * 26;
      this.speeds[i] = 11.5 + Math.random() * 4.5;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0xcbe4f7,
      size: 0.14,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'PrendaRain200Points';
    this.points.visible = false;
    this.points.frustumCulled = false;
  }

  update(dt: number, active: boolean, center: Vector3Like): void {
    this.points.visible = active;
    if (!active) return;

    const clampedDt = Math.min(Math.max(dt, 0.001), 0.05);
    this.points.position.set(center.x, 0, center.z);

    for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
      let y = this.positions[i * 3 + 1] - this.speeds[i] * clampedDt;
      if (y < 0.05) {
        y = 12.5 + Math.random() * 1.5;
      }
      this.positions[i * 3 + 1] = y;
    }
    this.geometry.attributes.position.needsUpdate = true;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
