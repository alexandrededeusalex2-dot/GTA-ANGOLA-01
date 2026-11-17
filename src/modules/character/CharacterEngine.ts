/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as THREE from 'three';
import type { EventBus } from '../../core/EventBus';
import type {
  EngineEvents,
  EngineModule,
  ModuleDescriptor,
  Vector3Like,
} from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import { groundHeightAt } from '../world/luandaCoordinates';
import {
  cloneAppearanceProfile,
  CUSTOMIZATION_SLOT_DEFINITIONS,
  DEFAULT_PRENDA_PROTAGONIST_APPEARANCE,
  type CharacterActionSlot,
  type CharacterAppearanceProfile,
  type CustomizationAnchorSlot,
} from './CharacterCustomization';
import {
  createInitialLocomotionState,
  normalizeAngle,
  stepCharacterLocomotion,
  type CharacterLocomotionState,
  type LocomotionState,
} from './CharacterLocomotionController';
import {
  loadProtagonistRig,
  PROTAGONIST_GLB_URL,
  type LoadedProtagonistRig,
} from './CharacterRigLoader';

export type CharacterRigStatus = 'loading' | 'ready' | 'error';

export type { LocomotionState as CharacterLocomotionState };

export interface CharacterRigContract {
  readonly id: string;
  readonly gltfUrl: string;
  readonly maxBonesAndroid: number;
  readonly position: Vector3Like;
  readonly locomotion: LocomotionState;
}

export const PRENDA_SPAWN_X = -4;
export const PRENDA_SPAWN_Z = 12;
export const PRENDA_SPAWN_YAW = -2.42; // Faces away from initial camera along Rua Eng. Francisco Sande Lemos

/**
 * Character Engine (Phase 3 — Realistic Playable Protagonist):
 * Loads and drives the adult male 3D human character inside Prenda UV n.º 1,
 * handles blended skeletal locomotion (idle/walk/run), terrain grounding,
 * building OBB collision, and prepares slots for future actions and customization.
 */
export class CharacterEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'character',
    index: 2,
    name: 'Character Engine',
    responsibility:
      'Personagem humano adulto realista em GLB (VALID/MIT), esqueleto humanoide de 84 ossos, mistura suave idle/walk/run, colisão urbana e arquitetura extensível de personalização.',
    status: 'implemented',
    targetPhase: 'Fase 3 (Personagem Principal) + Fase 4 (Customização e Veículos)',
    dependencies: ['AssetManager', 'WorldEngine', 'InputManager', 'EventBus'],
    pendingTasks: [
      'Adicionar animações de sentar, saltar, entrar em viatura e conduzir nos slots já reservados.',
      'Ativar seletor visual de vestuário, cabelo e acessórios sobre os nós anatómicos mapeados.',
      'Migrar cápsula de movimento para corpo cinemático Rapier 3D.',
    ],
  };

  private registeredCharacters = new Map<string, CharacterRigContract>();
  private locomotionState: CharacterLocomotionState;
  private appearanceProfile: CharacterAppearanceProfile =
    DEFAULT_PRENDA_PROTAGONIST_APPEARANCE;
  private rig: LoadedProtagonistRig | null = null;
  private rigStatus: CharacterRigStatus = 'loading';
  private rigErrorMessage: string | null = null;
  private targetScene: THREE.Scene | null = null;
  private pendingActionSlot: CharacterActionSlot | null = null;
  private disposed = false;
  private readyPromise: Promise<void> = Promise.resolve();

  onFootstep?: (isRunning: boolean) => void;
  onRigStatusChanged?: (status: CharacterRigStatus) => void;

  constructor(
    private readonly assetManager?: AssetManager,
    private readonly eventBus?: EventBus<EngineEvents>,
  ) {
    const startY = groundHeightAt(PRENDA_SPAWN_X, PRENDA_SPAWN_Z);
    this.locomotionState = createInitialLocomotionState(
      PRENDA_SPAWN_X,
      startY,
      PRENDA_SPAWN_Z,
      PRENDA_SPAWN_YAW,
    );

    this.registerCharacterContract({
      id: 'protagonist-prenda-01',
      gltfUrl: PROTAGONIST_GLB_URL,
      maxBonesAndroid: 84,
      position: { x: PRENDA_SPAWN_X, y: startY, z: PRENDA_SPAWN_Z },
      locomotion: 'idle',
    });
  }

  init(): void {
    this.syncDomAttributes();
    if (!this.assetManager) return;

    this.rigStatus = 'loading';
    this.readyPromise = loadProtagonistRig(this.assetManager)
      .then((loaded) => {
        if (this.disposed) {
          loaded.dispose();
          return;
        }
        this.rig = loaded;
        this.rigStatus = 'ready';
        this.rigErrorMessage = null;
        this.applyTransformToRig();
        if (this.targetScene && loaded.rootGroup.parent !== this.targetScene) {
          this.targetScene.add(loaded.rootGroup);
        }
        this.syncDomAttributes();
        this.onRigStatusChanged?.('ready');
      })
      .catch((err: unknown) => {
        if (this.disposed) return;
        this.rigStatus = 'error';
        this.rigErrorMessage =
          err instanceof Error ? err.message : 'Erro ao carregar modelo 3D do personagem.';
        this.syncDomAttributes();
        this.onRigStatusChanged?.('error');
      });
  }

  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  mountToScene(scene: THREE.Scene): void {
    this.targetScene = scene;
    if (this.rig && this.rig.rootGroup.parent !== scene) {
      scene.add(this.rig.rootGroup);
      this.applyTransformToRig();
    }
  }

  stepControl(
    moveX: number,
    moveY: number,
    sprint: boolean,
    cameraYaw: number,
    dt: number,
    resolveCollision: (x: number, z: number, radius: number) => { x: number; z: number },
    sampleGroundY: (x: number, z: number) => number,
  ): void {
    const result = stepCharacterLocomotion(
      this.locomotionState,
      { moveX, moveY, sprint },
      cameraYaw,
      dt,
      resolveCollision,
      sampleGroundY,
    );
    this.locomotionState = result.state;

    if (this.rig) {
      this.applyTransformToRig();
      this.rig.applyBlendWeights(
        this.locomotionState.idleWeight,
        this.locomotionState.walkWeight,
        this.locomotionState.runWeight,
        this.locomotionState.walkTimeScale,
        this.locomotionState.runTimeScale,
      );
    }

    if (result.stepTriggered) {
      this.onFootstep?.(this.locomotionState.locomotion === 'run');
    }

    const contract = this.registeredCharacters.get('protagonist-prenda-01');
    if (contract) {
      this.registeredCharacters.set('protagonist-prenda-01', {
        ...contract,
        position: {
          x: this.locomotionState.x,
          y: this.locomotionState.y,
          z: this.locomotionState.z,
        },
        locomotion: this.locomotionState.locomotion,
      });
    }

    this.syncDomAttributes();
  }

  update(dt: number): void {
    if (!this.rig) return;
    this.rig.update(Math.min(Math.max(dt, 0.001), 0.05));
  }

  resetToSpawn(
    resolveCollision?: (x: number, z: number, radius: number) => { x: number; z: number },
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): void {
    const pos = resolveCollision
      ? resolveCollision(PRENDA_SPAWN_X, PRENDA_SPAWN_Z, 0.48)
      : { x: PRENDA_SPAWN_X, z: PRENDA_SPAWN_Z };
    const y = sampleGroundY(pos.x, pos.z);
    this.locomotionState = createInitialLocomotionState(pos.x, y, pos.z, PRENDA_SPAWN_YAW);
    this.applyTransformToRig();
    this.syncDomAttributes();
  }

  teleportTo(
    x: number,
    z: number,
    yaw = this.locomotionState.yaw,
    resolveCollision?: (x: number, z: number, radius: number) => { x: number; z: number },
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): void {
    const pos = resolveCollision ? resolveCollision(x, z, 0.48) : { x, z };
    const y = sampleGroundY(pos.x, pos.z);
    this.locomotionState = createInitialLocomotionState(pos.x, y, pos.z, normalizeAngle(yaw));
    this.applyTransformToRig();
    this.syncDomAttributes();
  }

  getPosition(): Vector3Like {
    return {
      x: this.locomotionState.x,
      y: this.locomotionState.y,
      z: this.locomotionState.z,
    };
  }

  getCameraFollowAnchor(): Vector3Like {
    return {
      x: this.locomotionState.x,
      y: this.locomotionState.y + 1.46,
      z: this.locomotionState.z,
    };
  }

  getFirstPersonEyeAnchor(): Vector3Like {
    return {
      x: this.locomotionState.x + Math.sin(this.locomotionState.yaw) * 0.14,
      y: this.locomotionState.y + 1.68,
      z: this.locomotionState.z + Math.cos(this.locomotionState.yaw) * 0.14,
    };
  }

  getYaw(): number {
    return this.locomotionState.yaw;
  }

  getSpeed(): number {
    return this.locomotionState.speed;
  }

  getLocomotionState(): LocomotionState {
    return this.locomotionState.locomotion;
  }

  getRigStatus(): CharacterRigStatus {
    return this.rigStatus;
  }

  getRigError(): string | null {
    return this.rigErrorMessage;
  }

  getAppearanceProfile(): CharacterAppearanceProfile {
    return this.appearanceProfile;
  }

  updateAppearanceProfile(patch: Partial<CharacterAppearanceProfile>): CharacterAppearanceProfile {
    this.appearanceProfile = cloneAppearanceProfile(this.appearanceProfile, patch);
    return this.appearanceProfile;
  }

  listCustomizationSlots(): readonly CustomizationAnchorSlot[] {
    return CUSTOMIZATION_SLOT_DEFINITIONS;
  }

  /**
   * Reserves non-locomotion action slots (sit, jump, enterVehicle, drive, interact)
   * for upcoming gameplay/vehicle phases.
   */
  requestActionSlot(slot: CharacterActionSlot): boolean {
    if (!this.rig?.futureActionSlots.has(slot)) {
      return false;
    }
    this.pendingActionSlot = slot;
    if (slot === 'interact') {
      this.eventBus?.emit('input:action', { action: 'interact' });
    }
    return true;
  }

  getPendingActionSlot(): CharacterActionSlot | null {
    return this.pendingActionSlot;
  }

  registerCharacterContract(contract: CharacterRigContract): void {
    this.registeredCharacters.set(contract.id, contract);
  }

  listContracts(): CharacterRigContract[] {
    return [...this.registeredCharacters.values()];
  }

  private applyTransformToRig(): void {
    if (!this.rig) return;
    this.rig.rootGroup.position.set(
      this.locomotionState.x,
      this.locomotionState.y,
      this.locomotionState.z,
    );
    this.rig.rootGroup.rotation.set(0, this.locomotionState.yaw, 0);
  }

  private syncDomAttributes(): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.charRig = this.rigStatus;
    document.body.dataset.charState = this.locomotionState.locomotion;
    document.body.dataset.charSpeed = this.locomotionState.speed.toFixed(2);
    document.body.dataset.charPos = `${this.locomotionState.x.toFixed(2)},${this.locomotionState.y.toFixed(2)},${this.locomotionState.z.toFixed(2)}`;
  }

  dispose(): void {
    this.disposed = true;
    this.rig?.dispose();
    this.rig = null;
    this.registeredCharacters.clear();
  }
}
