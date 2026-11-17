/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventBus } from '../../core/EventBus';
import type {
  EngineEvents,
  EngineModule,
  ModuleDescriptor,
  QualityTier,
  SaveProfileData,
  TimeOfDayPreset,
} from '../../core/types';

export const SAVE_SCHEMA_VERSION = 1;
const DB_NAME = 'angola-virtual-db';
const DB_VERSION = 1;
const STORE_NAME = 'profiles';
const DEFAULT_PROFILE_KEY = 'local-device-profile';

export function createDefaultSaveProfile(): SaveProfileData {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAtIso: new Date().toISOString(),
    qualityTier: 'medium',
    timeOfDay: 'morning',
    muted: false,
    touchControlsVisible: true,
    lastCameraPosition: { x: 14, y: 7.5, z: 16 },
    lastCameraTarget: { x: 0, y: 1.2, z: 0 },
  };
}

export function sanitizeSaveProfile(raw: unknown): SaveProfileData {
  const defaults = createDefaultSaveProfile();
  if (!raw || typeof raw !== 'object') return defaults;

  const candidate = raw as Partial<SaveProfileData>;
  const validTiers: QualityTier[] = ['low', 'medium', 'high'];
  const validTimes: TimeOfDayPreset[] = ['morning', 'noon', 'sunset'];

  const isVec3 = (v: unknown): v is { x: number; y: number; z: number } =>
    Boolean(
      v &&
        typeof v === 'object' &&
        Number.isFinite((v as { x: number }).x) &&
        Number.isFinite((v as { y: number }).y) &&
        Number.isFinite((v as { z: number }).z),
    );

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    updatedAtIso:
      typeof candidate.updatedAtIso === 'string'
        ? candidate.updatedAtIso
        : defaults.updatedAtIso,
    qualityTier: validTiers.includes(candidate.qualityTier as QualityTier)
      ? (candidate.qualityTier as QualityTier)
      : defaults.qualityTier,
    timeOfDay: validTimes.includes(candidate.timeOfDay as TimeOfDayPreset)
      ? (candidate.timeOfDay as TimeOfDayPreset)
      : defaults.timeOfDay,
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : defaults.muted,
    touchControlsVisible:
      typeof candidate.touchControlsVisible === 'boolean'
        ? candidate.touchControlsVisible
        : defaults.touchControlsVisible,
    lastCameraPosition: isVec3(candidate.lastCameraPosition)
      ? candidate.lastCameraPosition
      : defaults.lastCameraPosition,
    lastCameraTarget: isVec3(candidate.lastCameraTarget)
      ? candidate.lastCameraTarget
      : defaults.lastCameraTarget,
  };
}

/**
 * Contract prepared for Phase 4+ PostgreSQL remote persistence sync.
 */
export interface IRemotePersistenceAdapter {
  readonly isConfigured: boolean;
  syncProfile(profile: SaveProfileData): Promise<void>;
}

/**
 * Save System: Persists local player settings & session state in IndexedDB
 * with automatic fallback to in-memory storage when IndexedDB is unavailable.
 */
export class SaveSystem implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'save',
    index: 11,
    name: 'Save System',
    responsibility:
      'Armazenamento local em IndexedDB (preferências e estado de sessão) com contrato preparado para sincronização PostgreSQL.',
    status: 'implemented',
    targetPhase: 'Fase 1 (IndexedDB) + Fase 4 (PostgreSQL)',
    dependencies: ['EventBus'],
    pendingTasks: [
      'Implementar adaptador REST/PostgreSQL no backend Node.js para contas de jogador.',
      'Adicionar versionamento incremental de inventário e progresso de carreira.',
      'Suportar resolução de conflitos offline/online.',
    ],
  };

  private db: IDBDatabase | null = null;
  private memoryFallback = new Map<string, SaveProfileData>();
  private backendMode: 'indexeddb' | 'memory' = 'memory';
  private cachedProfile: SaveProfileData = createDefaultSaveProfile();

  constructor(private readonly eventBus: EventBus<EngineEvents>) {}

  async init(): Promise<void> {
    if (typeof indexedDB === 'undefined') {
      this.backendMode = 'memory';
      this.cachedProfile = createDefaultSaveProfile();
      return;
    }

    try {
      this.db = await this.openDatabase();
      this.backendMode = 'indexeddb';
      this.cachedProfile = await this.loadProfile();
    } catch {
      this.backendMode = 'memory';
      this.cachedProfile = createDefaultSaveProfile();
    }
  }

  getBackendMode(): 'indexeddb' | 'memory' {
    return this.backendMode;
  }

  getCachedProfile(): SaveProfileData {
    return this.cachedProfile;
  }

  async loadProfile(key = DEFAULT_PROFILE_KEY): Promise<SaveProfileData> {
    if (!this.db) {
      const mem = this.memoryFallback.get(key);
      this.cachedProfile = mem ? sanitizeSaveProfile(mem) : createDefaultSaveProfile();
      return this.cachedProfile;
    }

    const loaded = await new Promise<unknown>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    this.cachedProfile = sanitizeSaveProfile(loaded);
    return this.cachedProfile;
  }

  async saveProfile(
    patch: Partial<Omit<SaveProfileData, 'schemaVersion' | 'updatedAtIso'>>,
    key = DEFAULT_PROFILE_KEY,
  ): Promise<SaveProfileData> {
    const next: SaveProfileData = sanitizeSaveProfile({
      ...this.cachedProfile,
      ...patch,
      updatedAtIso: new Date().toISOString(),
    });
    this.cachedProfile = next;

    if (!this.db) {
      this.memoryFallback.set(key, next);
      this.eventBus.emit('save:persisted', {
        backend: 'memory',
        updatedAtIso: next.updatedAtIso,
      });
      return next;
    }

    await new Promise<void>((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(next, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    this.eventBus.emit('save:persisted', {
      backend: 'indexeddb',
      updatedAtIso: next.updatedAtIso,
    });
    return next;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  dispose(): void {
    this.db?.close();
    this.db = null;
  }
}
