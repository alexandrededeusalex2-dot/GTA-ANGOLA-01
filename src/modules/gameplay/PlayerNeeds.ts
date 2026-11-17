/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PlayerNeedsState {
  readonly hunger: number;
  readonly thirst: number;
  readonly energy: number;
  readonly isNight: boolean;
  readonly hungerBlinking: boolean;
  readonly speedMultiplier: number;
  readonly mustSleepHome: boolean;
}

export type CantinaMenuItemId = 'agua' | 'fanta' | 'magoga' | 'cachupa';

export interface CantinaMenuItem {
  readonly id: CantinaMenuItemId;
  readonly label: string;
  readonly priceKz: number;
  readonly hungerGain: number;
  readonly thirstGain: number;
  readonly energyGain: number;
}

export const CANTINA_MENU_ITEMS: readonly CantinaMenuItem[] = [
  { id: 'agua', label: 'Água Fresca', priceKz: 50, hungerGain: 0, thirstGain: 35, energyGain: 4 },
  { id: 'fanta', label: 'Gasosa Tropical', priceKz: 100, hungerGain: 6, thirstGain: 45, energyGain: 8 },
  { id: 'magoga', label: 'Magoga c/ Gindungo', priceKz: 120, hungerGain: 32, thirstGain: -4, energyGain: 6 },
  { id: 'cachupa', label: 'Prato do Dia (Funge)', priceKz: 200, hungerGain: 55, thirstGain: 10, energyGain: 15 },
];

export const HUNGER_LOW_THRESHOLD = 20;
export const LOW_HUNGER_SPEED_MULTIPLIER = 0.7;
export const NEED_SLEEP_MESSAGE = 'Precisas dormir em casa';

const HUNGER_DECAY_PER_GAME_HOUR = 6.5;
const THIRST_DECAY_PER_GAME_HOUR = 8.0;
const ENERGY_DAY_DECAY_PER_GAME_HOUR = 2.6;
const ENERGY_NIGHT_DECAY_PER_GAME_HOUR = 14.5;

function clampNeed(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v * 100) / 100));
}

export function deriveNeedsState(
  hunger: number,
  thirst: number,
  energy: number,
  isNight: boolean,
): PlayerNeedsState {
  const h = clampNeed(hunger);
  const t = clampNeed(thirst);
  const e = clampNeed(energy);
  const lowHunger = h < HUNGER_LOW_THRESHOLD;

  return {
    hunger: h,
    thirst: t,
    energy: e,
    isNight,
    hungerBlinking: lowHunger,
    speedMultiplier: lowHunger ? LOW_HUNGER_SPEED_MULTIPLIER : 1.0,
    mustSleepHome: e <= 0,
  };
}

export function createInitialPlayerNeeds(): PlayerNeedsState {
  return deriveNeedsState(72, 78, 92, false);
}

export function stepPlayerNeeds(
  current: PlayerNeedsState,
  gameHoursElapsed: number,
  isNight: boolean,
  isMoving: boolean,
): PlayerNeedsState {
  const hrs = Math.max(0, gameHoursElapsed);
  const activityFactor = isMoving ? 1.25 : 0.85;
  const energyRate = isNight ? ENERGY_NIGHT_DECAY_PER_GAME_HOUR : ENERGY_DAY_DECAY_PER_GAME_HOUR;

  const nextHunger = current.hunger - HUNGER_DECAY_PER_GAME_HOUR * activityFactor * hrs;
  const nextThirst = current.thirst - THIRST_DECAY_PER_GAME_HOUR * activityFactor * hrs;
  const nextEnergy = current.energy - energyRate * (isMoving ? 1.15 : 1.0) * hrs;

  return deriveNeedsState(nextHunger, nextThirst, nextEnergy, isNight);
}

export function applyCantinaItemToNeeds(
  current: PlayerNeedsState,
  itemId: CantinaMenuItemId,
): PlayerNeedsState {
  const item = CANTINA_MENU_ITEMS.find((m) => m.id === itemId);
  if (!item) return current;
  return deriveNeedsState(
    current.hunger + item.hungerGain,
    current.thirst + item.thirstGain,
    current.energy + item.energyGain,
    current.isNight,
  );
}

export function sleepAtHomeNeeds(current: PlayerNeedsState): PlayerNeedsState {
  return deriveNeedsState(
    Math.max(15, current.hunger - 8),
    Math.max(15, current.thirst - 8),
    100,
    false,
  );
}
