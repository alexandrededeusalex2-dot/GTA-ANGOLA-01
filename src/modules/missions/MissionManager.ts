/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { Vector3Like } from '../../core/types';
import { PRENDA_SPAWN_X, PRENDA_SPAWN_Z } from '../character/CharacterEngine';
import { groundHeightAt } from '../world/luandaCoordinates';

export const PRENDA_EXPRESS_MISSION_ID = 'prenda-express';
export const PRENDA_EXPRESS_START_MESSAGE =
  'Missão: Leva 1 passageiro Mercado -> Centro UV1';
export const PRENDA_EXPRESS_HUD_TITLE = 'Missão: Mercado -> Centro';
export const PRENDA_EXPRESS_COMPLETE_MESSAGE = 'Missão Completa +100 Kz';
export const PRENDA_EXPRESS_REWARD_KZ = 100;
export const PRENDA_EXPRESS_ARRIVAL_RADIUS_METERS = 10;
export const PRENDA_EXPRESS_WAYPOINT_HEIGHT_METERS = 30;
export const PRENDA_EXPRESS_HAND_WAVE_SECONDS = 0.85;

export const PRENDA_CENTRO_TARGET = {
  x: PRENDA_SPAWN_X,
  z: PRENDA_SPAWN_Z,
} as const;

export const PRENDA_CENTRO_DROPOFF_NPC_POSE = {
  x: -8.5,
  z: 11.2,
  yaw: 1.15,
} as const;

export type MissionPhaseStatus = 'idle' | 'boarding' | 'active' | 'completed' | 'cancelled';

export interface PrendaMissionState {
  readonly id: string;
  readonly status: MissionPhaseStatus;
  readonly targetX: number;
  readonly targetZ: number;
  readonly distanceMeters: number;
  readonly boardingElapsedSec: number;
  readonly passengerBoarded: boolean;
  readonly rewardAwardedKz: number;
  readonly bannerMessage: string | null;
  readonly bannerRemainingSec: number;
}

export interface MissionStepResult {
  readonly state: PrendaMissionState;
  readonly passengerShouldBoard: boolean;
  readonly justCompleted: boolean;
}

export function computeMissionDistanceMeters(
  fromPos: { readonly x: number; readonly z: number },
  targetPos: { readonly x: number; readonly z: number },
): number {
  return Math.round(Math.hypot(targetPos.x - fromPos.x, targetPos.z - fromPos.z));
}

export function createInitialMissionState(
  startPos: { readonly x: number; readonly z: number } = PRENDA_CENTRO_TARGET,
  targetPos: { readonly x: number; readonly z: number } = PRENDA_CENTRO_TARGET,
): PrendaMissionState {
  return {
    id: PRENDA_EXPRESS_MISSION_ID,
    status: 'idle',
    targetX: targetPos.x,
    targetZ: targetPos.z,
    distanceMeters: computeMissionDistanceMeters(startPos, targetPos),
    boardingElapsedSec: 0,
    passengerBoarded: false,
    rewardAwardedKz: 0,
    bannerMessage: null,
    bannerRemainingSec: 0,
  };
}

export function isMissionInProgress(status: MissionPhaseStatus): boolean {
  return status === 'boarding' || status === 'active';
}

/**
 * Starts "Prenda Express" upon entering the Candongueiro when idle or cancelled.
 */
export function startPrendaExpressMission(
  current: PrendaMissionState,
  vehiclePos: { readonly x: number; readonly z: number },
): { readonly state: PrendaMissionState; readonly justStarted: boolean } {
  if (current.status === 'completed' || isMissionInProgress(current.status)) {
    return { state: current, justStarted: false };
  }

  return {
    justStarted: true,
    state: {
      ...current,
      status: 'boarding',
      distanceMeters: computeMissionDistanceMeters(vehiclePos, {
        x: current.targetX,
        z: current.targetZ,
      }),
      boardingElapsedSec: 0,
      passengerBoarded: false,
      bannerMessage: PRENDA_EXPRESS_START_MESSAGE,
      bannerRemainingSec: 5.5,
    },
  };
}

/**
 * Advances boarding timer, computes live distance to Centro UV1, and completes
 * with +100 Kz upon arriving within 10m of Centro UV1 (never fails).
 */
export function stepPrendaExpressMission(
  current: PrendaMissionState,
  dt: number,
  carrierPos: { readonly x: number; readonly z: number },
  isDrivingVehicle: boolean,
): MissionStepResult {
  const clampedDt = Math.max(0, dt);
  const nextBannerRemaining = Math.max(0, current.bannerRemainingSec - clampedDt);
  const nextBannerMessage = nextBannerRemaining > 0 ? current.bannerMessage : null;

  if (!isMissionInProgress(current.status)) {
    if (
      nextBannerRemaining === current.bannerRemainingSec &&
      nextBannerMessage === current.bannerMessage
    ) {
      return {
        state: current,
        passengerShouldBoard: false,
        justCompleted: false,
      };
    }
    return {
      state: {
        ...current,
        bannerRemainingSec: nextBannerRemaining,
        bannerMessage: nextBannerMessage,
      },
      passengerShouldBoard: false,
      justCompleted: false,
    };
  }

  const distRaw = Math.hypot(current.targetX - carrierPos.x, current.targetZ - carrierPos.z);
  const distanceMeters = Math.round(distRaw);

  let nextStatus: MissionPhaseStatus = current.status;
  let boardingElapsedSec = current.boardingElapsedSec;
  let passengerBoarded = current.passengerBoarded;
  let passengerShouldBoard = false;

  if (current.status === 'boarding') {
    boardingElapsedSec += clampedDt;
    if (boardingElapsedSec >= PRENDA_EXPRESS_HAND_WAVE_SECONDS) {
      nextStatus = 'active';
      passengerBoarded = true;
      passengerShouldBoard = true;
    }
  }

  if (isDrivingVehicle && distRaw < PRENDA_EXPRESS_ARRIVAL_RADIUS_METERS) {
    return {
      passengerShouldBoard,
      justCompleted: true,
      state: {
        ...current,
        status: 'completed',
        distanceMeters: 0,
        boardingElapsedSec,
        passengerBoarded: false,
        rewardAwardedKz: PRENDA_EXPRESS_REWARD_KZ,
        bannerMessage: PRENDA_EXPRESS_COMPLETE_MESSAGE,
        bannerRemainingSec: 7.0,
      },
    };
  }

  return {
    passengerShouldBoard,
    justCompleted: false,
    state: {
      ...current,
      status: nextStatus,
      distanceMeters,
      boardingElapsedSec,
      passengerBoarded,
      bannerMessage: nextBannerMessage,
      bannerRemainingSec: nextBannerRemaining,
    },
  };
}

export function cancelPrendaExpressMission(current: PrendaMissionState): {
  readonly state: PrendaMissionState;
  readonly wasActive: boolean;
} {
  if (!isMissionInProgress(current.status)) {
    return { state: current, wasActive: false };
  }

  return {
    wasActive: true,
    state: {
      ...current,
      status: 'cancelled',
      boardingElapsedSec: 0,
      passengerBoarded: false,
      bannerMessage: null,
      bannerRemainingSec: 0,
    },
  };
}

function createYellowArrowTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 128, 128);

    // Downward-pointing yellow GTA-style beacon arrow with dark contrast outline
    ctx.beginPath();
    ctx.moveTo(46, 14);
    ctx.lineTo(82, 14);
    ctx.lineTo(82, 62);
    ctx.lineTo(106, 62);
    ctx.lineTo(64, 114);
    ctx.lineTo(22, 62);
    ctx.lineTo(46, 62);
    ctx.closePath();

    ctx.lineJoin = 'round';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0e1116';
    ctx.stroke();

    ctx.fillStyle = '#facc15';
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Lightweight 3D yellow arrow Sprite (never Box/Cylinder) hovering 30m over Centro UV1.
 */
export function createMissionWaypointSprite(
  targetX = PRENDA_CENTRO_TARGET.x,
  targetZ = PRENDA_CENTRO_TARGET.z,
  groundY = groundHeightAt(targetX, targetZ),
): {
  readonly sprite: THREE.Sprite;
  readonly baseY: number;
  dispose: () => void;
} {
  const texture = createYellowArrowTexture();
  const material = new THREE.SpriteMaterial({
    ...(texture ? { map: texture } : {}),
    color: 0xffffff,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.name = 'MissionWaypointCentroArrowSprite';
  const baseY = groundY + PRENDA_EXPRESS_WAYPOINT_HEIGHT_METERS;
  sprite.position.set(targetX, baseY, targetZ);
  sprite.scale.set(14, 14, 1);
  sprite.renderOrder = 12;
  sprite.visible = false;

  return {
    sprite,
    baseY,
    dispose: () => {
      sprite.removeFromParent();
      material.dispose();
      texture?.dispose();
    },
  };
}

/**
 * Runtime controller wrapping Prenda Express state transitions + 30m 3D sprite marker.
 */
export class MissionManager {
  private state: PrendaMissionState;
  private waypointMarker: ReturnType<typeof createMissionWaypointSprite> | null = null;
  private clockSeconds = 0;

  constructor(initialPos: { readonly x: number; readonly z: number } = PRENDA_CENTRO_TARGET) {
    this.state = createInitialMissionState(initialPos, PRENDA_CENTRO_TARGET);
  }

  mountToScene(
    scene: THREE.Scene,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): void {
    if (!this.waypointMarker) {
      const groundY = sampleGroundY(PRENDA_CENTRO_TARGET.x, PRENDA_CENTRO_TARGET.z);
      this.waypointMarker = createMissionWaypointSprite(
        PRENDA_CENTRO_TARGET.x,
        PRENDA_CENTRO_TARGET.z,
        groundY,
      );
    }
    if (this.waypointMarker.sprite.parent !== scene) {
      scene.add(this.waypointMarker.sprite);
    }
    this.syncWaypointVisibility();
    this.syncDomAttributes();
  }

  onEnterVehicle(vehiclePos: Vector3Like): { readonly started: boolean } {
    const res = startPrendaExpressMission(this.state, vehiclePos);
    this.state = res.state;
    this.syncWaypointVisibility(this.clockSeconds);
    this.syncDomAttributes();
    return { started: res.justStarted };
  }

  cancel(): { readonly cancelled: boolean } {
    const res = cancelPrendaExpressMission(this.state);
    this.state = res.state;
    this.syncWaypointVisibility(this.clockSeconds);
    this.syncDomAttributes();
    return { cancelled: res.wasActive };
  }

  step(
    dt: number,
    carrierPos: Vector3Like,
    isDrivingVehicle: boolean,
  ): {
    readonly passengerShouldBoard: boolean;
    readonly justCompleted: boolean;
    readonly uiChanged: boolean;
  } {
    this.clockSeconds += Math.max(0, dt);
    const prevStatus = this.state.status;
    const prevDist = this.state.distanceMeters;
    const prevBanner = this.state.bannerMessage;

    const result = stepPrendaExpressMission(this.state, dt, carrierPos, isDrivingVehicle);
    this.state = result.state;
    this.syncWaypointVisibility(this.clockSeconds);

    if (prevStatus !== this.state.status || prevDist !== this.state.distanceMeters) {
      this.syncDomAttributes();
    }

    const uiChanged =
      prevStatus !== this.state.status ||
      prevDist !== this.state.distanceMeters ||
      prevBanner !== this.state.bannerMessage;

    return {
      passengerShouldBoard: result.passengerShouldBoard,
      justCompleted: result.justCompleted,
      uiChanged,
    };
  }

  getState(): PrendaMissionState {
    return this.state;
  }

  isActive(): boolean {
    return isMissionInProgress(this.state.status);
  }

  private syncWaypointVisibility(elapsedSeconds = 0): void {
    if (!this.waypointMarker) return;
    const active = isMissionInProgress(this.state.status);
    this.waypointMarker.sprite.visible = active;
    if (active) {
      const bobOffset = Math.sin(elapsedSeconds * 2.6) * 1.1;
      this.waypointMarker.sprite.position.y = this.waypointMarker.baseY + bobOffset;
    }
  }

  private syncDomAttributes(): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.missionState = this.state.status;
    document.body.dataset.missionDistance = String(this.state.distanceMeters);
  }

  dispose(): void {
    this.waypointMarker?.dispose();
    this.waypointMarker = null;
  }
}
