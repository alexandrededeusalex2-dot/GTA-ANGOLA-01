/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type QualityTier = 'low' | 'medium' | 'high';

export type TimeOfDayPreset = 'morning' | 'noon' | 'sunset' | 'night';

export type ExplorerCameraMode = 'third-person' | 'free-inspect';

export type UrbanLayerFilter = 'all' | 'historical' | 'contemporary';

export interface UrbanSelectionInfo {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly eraLabel: string;
  readonly confirmationStatus: string;
  readonly utm33sLabel: string;
  readonly wgs84Label: string;
  readonly details: string;
}

export type ModuleId =
  | 'world'
  | 'character'
  | 'vehicle'
  | 'npc'
  | 'economy'
  | 'career'
  | 'social'
  | 'gameplay'
  | 'audio'
  | 'multiplayer'
  | 'save'
  | 'ui';

export type ModuleImplementationStatus = 'implemented' | 'foundation' | 'planned';

export interface ModuleDescriptor {
  readonly id: ModuleId;
  readonly index: number;
  readonly name: string;
  readonly responsibility: string;
  readonly status: ModuleImplementationStatus;
  readonly targetPhase: string;
  readonly dependencies: readonly string[];
  readonly pendingTasks: readonly string[];
}

export interface EngineModule {
  readonly descriptor: ModuleDescriptor;
  init(): Promise<void> | void;
  update?(dt: number): void;
  dispose(): void;
}

export interface GeoCoordinate {
  readonly lat: number;
  readonly lon: number;
}

export interface UtmCoordinate {
  readonly easting: number;
  readonly northing: number;
  readonly zone: '33S';
  readonly epsg: 'EPSG:32733';
}

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface QualityProfileConfig {
  readonly tier: QualityTier;
  readonly label: string;
  readonly maxPixelRatio: number;
  readonly shadowsEnabled: boolean;
  readonly shadowMapSize: number;
  readonly anisotropy: number;
  readonly antialias: boolean;
  readonly maxDrawCallsBudget: number;
  readonly maxTextureMemoryMB: number;
}

export interface PerformanceMetricsSnapshot {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly estimatedHeapMB: number | null;
  readonly isSoftwareGl: boolean;
  readonly recommendedTier: QualityTier;
}

export interface InputAxisState {
  readonly moveX: number;
  readonly moveY: number;
  readonly lookDeltaX: number;
  readonly lookDeltaY: number;
  readonly sprint: boolean;
  readonly interactPressed: boolean;
  readonly resetViewPressed: boolean;
}

export interface SaveProfileData {
  readonly schemaVersion: number;
  readonly updatedAtIso: string;
  readonly qualityTier: QualityTier;
  readonly timeOfDay: TimeOfDayPreset;
  readonly muted: boolean;
  readonly touchControlsVisible: boolean;
  readonly lastCameraPosition: Vector3Like;
  readonly lastCameraTarget: Vector3Like;
}

export interface EngineEvents {
  'game:stateChanged': { from: GameState; to: GameState };
  'world:timeChanged': { preset: TimeOfDayPreset };
  'world:cameraModeChanged': { mode: ExplorerCameraMode };
  'world:layerFilterChanged': { filter: UrbanLayerFilter };
  'graphics:qualityChanged': { tier: QualityTier };
  'audio:muteChanged': { muted: boolean };
  'camera:resetRequested': undefined;
  'input:action': { action: 'interact' | 'resetView' | 'togglePause' | 'toggleMute' };
  'save:persisted': { backend: 'indexeddb' | 'memory'; updatedAtIso: string };
  'performance:sampled': PerformanceMetricsSnapshot;
}
