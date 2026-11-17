/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { EngineRegistry } from '../core/EngineRegistry';
import { EventBus } from '../core/EventBus';
import { ANDROID_QUALITY_PROFILES, PerformanceMonitor } from '../core/PerformanceMonitor';
import type {
  EngineEvents,
  ExplorerCameraMode,
  GameState,
  ModuleDescriptor,
  PerformanceMetricsSnapshot,
  QualityTier,
  TimeOfDayPreset,
  UrbanLayerFilter,
  UrbanSelectionInfo,
} from '../core/types';
import { InputManager } from '../input/InputManager';
import { AudioEngine } from '../modules/audio/AudioEngine';
import { CareerEngine } from '../modules/career/CareerEngine';
import {
  CharacterEngine,
  type CharacterLocomotionState,
  type CharacterRigStatus,
} from '../modules/character/CharacterEngine';
import { EconomyEngine } from '../modules/economy/EconomyEngine';
import { GameplayEngine } from '../modules/gameplay/GameplayEngine';
import {
  MissionManager,
  PRENDA_CENTRO_DROPOFF_NPC_POSE,
  PRENDA_CENTRO_TARGET,
  PRENDA_EXPRESS_REWARD_KZ,
  type MissionPhaseStatus,
} from '../modules/missions/MissionManager';
import { MultiplayerService } from '../modules/multiplayer/MultiplayerService';
import { NpcEngine } from '../modules/npc/NpcEngine';
import { SaveSystem } from '../modules/save/SaveSystem';
import { SocialEngine } from '../modules/social/SocialEngine';
import type { MiniMapPose } from '../modules/ui/MiniMap';
import { UiModule } from '../modules/ui/UiModule';
import { VehicleEngine } from '../modules/vehicle/VehicleEngine';
import type { PrendaRoadSegment } from '../modules/world/PrendaCartography';
import { WorldEngine } from '../modules/world/WorldEngine';
import { PRENDA_UV1_PUBLISHED_DMS } from '../modules/world/luandaCoordinates';
import { PlannedRapierPhysicsAdapter } from '../physics/PhysicsAdapter';
import { AssetManager } from '../resources/AssetManager';
import {
  ThreeViewportController,
  type PrendaCameraPresetId,
  type ViewportFrameContext,
} from './ThreeViewportController';

export interface HudTelemetryState {
  readonly gameState: GameState;
  readonly qualityTier: QualityTier;
  readonly timeOfDay: TimeOfDayPreset;
  readonly cameraMode: ExplorerCameraMode;
  readonly layerFilter: UrbanLayerFilter;
  readonly muted: boolean;
  readonly touchControlsVisible: boolean;
  readonly activeChunkKey: string;
  readonly nearestStreetLabel: string;
  readonly worldTargetLabel: string;
  readonly geographicalStatus: string;
  readonly selectedFeature: UrbanSelectionInfo | null;
  readonly metrics: PerformanceMetricsSnapshot;
  readonly saveBackend: 'indexeddb' | 'memory';
  readonly lastSavedIso: string;
  readonly contextLost: boolean;
  readonly characterLocomotion: CharacterLocomotionState;
  readonly characterSpeedMps: number;
  readonly characterRigStatus: CharacterRigStatus;
  readonly vehiclePrompt: string | null;
  readonly vehicleFeedback: string | null;
  readonly isDrivingVehicle: boolean;
  readonly vehicleSpeedMps: number;
  readonly missionStatus: MissionPhaseStatus;
  readonly missionDistanceMeters: number;
  readonly missionBanner: string | null;
  readonly kwanzaBalance: number;
}

const _pickRaycaster = new THREE.Raycaster();
const _ndcVec = new THREE.Vector2();

/**
 * Root composition facade for ANGOLA VIRTUAL (Phase 2 — Prenda UV n.º 1, Luanda).
 * Connects all 12 modular engines, Three.js viewport, dual camera exploration,
 * OSM/HPIP Prenda cartography, input, and IndexedDB persistence.
 */
export class AngolaVirtualEngine {
  readonly eventBus = new EventBus<EngineEvents>();
  readonly registry = new EngineRegistry();
  readonly assetManager = new AssetManager();
  readonly physicsAdapter = new PlannedRapierPhysicsAdapter();
  readonly inputManager = new InputManager();
  readonly performanceMonitor = new PerformanceMonitor();

  readonly worldEngine: WorldEngine;
  readonly characterEngine: CharacterEngine;
  readonly vehicleEngine: VehicleEngine;
  readonly npcEngine: NpcEngine;
  readonly economyEngine = new EconomyEngine();
  readonly careerEngine = new CareerEngine();
  readonly socialEngine = new SocialEngine();
  readonly gameplayEngine: GameplayEngine;
  readonly audioEngine: AudioEngine;
  readonly multiplayerService = new MultiplayerService();
  readonly saveSystem: SaveSystem;
  readonly uiModule = new UiModule();
  readonly missionManager = new MissionManager();
  readonly miniMapPoseRef: { current: MiniMapPose } = { current: { x: 0, z: 0, yaw: 0 } };

  private viewport: ThreeViewportController | null = null;
  private qualityTier: QualityTier = 'medium';
  private cameraMode: ExplorerCameraMode = 'third-person';
  private layerFilter: UrbanLayerFilter = 'all';
  private selectedFeature: UrbanSelectionInfo | null = null;
  private touchControlsVisible = true;
  private contextLost = false;
  private lastHudPushTime = 0;
  private lastVehiclePrompt: string | null = null;
  private lastVehicleFeedback: string | null = null;
  private lastDrivingState = false;
  private lastRenderStats = { drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };
  private hudSubscriber: ((state: HudTelemetryState) => void) | null = null;
  private toggleInspectorCallback: (() => void) | null = null;

  constructor() {
    this.worldEngine = new WorldEngine(this.assetManager, this.eventBus);
    this.characterEngine = new CharacterEngine(this.assetManager, this.eventBus);
    this.vehicleEngine = new VehicleEngine(this.assetManager, this.eventBus);
    this.npcEngine = new NpcEngine(this.assetManager);
    this.gameplayEngine = new GameplayEngine(this.eventBus);
    this.audioEngine = new AudioEngine(this.eventBus);
    this.saveSystem = new SaveSystem(this.eventBus);

    this.registry.register(this.worldEngine);
    this.registry.register(this.characterEngine);
    this.registry.register(this.vehicleEngine);
    this.registry.register(this.npcEngine);
    this.registry.register(this.economyEngine);
    this.registry.register(this.careerEngine);
    this.registry.register(this.socialEngine);
    this.registry.register(this.gameplayEngine);
    this.registry.register(this.audioEngine);
    this.registry.register(this.multiplayerService);
    this.registry.register(this.saveSystem);
    this.registry.register(this.uiModule);
  }

  async mount(
    container: HTMLElement,
    onHudUpdate: (state: HudTelemetryState) => void,
    onToggleInspector: () => void,
    autostart: boolean,
  ): Promise<void> {
    this.hudSubscriber = onHudUpdate;
    this.toggleInspectorCallback = onToggleInspector;

    await this.physicsAdapter.init();
    await this.registry.initAll();
    await Promise.all([
      this.characterEngine.waitUntilReady(),
      this.vehicleEngine.mountToScene(
        this.worldEngine.scene,
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      ),
      this.npcEngine.mountToScene(
        this.worldEngine.scene,
        this.vehicleEngine.getMercadoStopSpec().localPosition,
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      ),
    ]);
    this.missionManager.mountToScene(
      this.worldEngine.scene,
      (x, z) => this.worldEngine.sampleGroundHeight(x, z),
    );
    this.characterEngine.resetToSpawn(
      (x, z, r) => this.resolveWorldCollision(x, z, r),
      (x, z) => this.worldEngine.sampleGroundHeight(x, z),
    );
    const initialCharPos = this.characterEngine.getPosition();
    this.miniMapPoseRef.current.x = initialCharPos.x;
    this.miniMapPoseRef.current.z = initialCharPos.z;
    this.miniMapPoseRef.current.yaw = this.characterEngine.getYaw();
    this.characterEngine.mountToScene(this.worldEngine.scene);
    this.characterEngine.onFootstep = (isRunning) => this.audioEngine.playFootstep(isRunning);
    this.characterEngine.onRigStatusChanged = () => this.pushHudState(true);

    const saved = this.saveSystem.getCachedProfile();
    this.qualityTier = saved.qualityTier;
    this.touchControlsVisible = saved.touchControlsVisible;
    this.audioEngine.setMuted(saved.muted);
    this.worldEngine.applyTimeOfDay(saved.timeOfDay);

    const profileCfg = ANDROID_QUALITY_PROFILES[this.qualityTier];
    this.assetManager.setAnisotropyLimit(profileCfg.anisotropy);
    this.worldEngine.setShadowEnabled(profileCfg.shadowsEnabled, profileCfg.shadowMapSize);
    this.worldEngine.setQualityTier(this.qualityTier);

    this.viewport = new ThreeViewportController(container, this.worldEngine.scene, {
      onFrame: (ctx) => this.handleFrame(ctx),
      onPointerLookDelta: () => {},
      onTapRay: (ndcX, ndcY, camera) => this.handleViewportTap(ndcX, ndcY, camera),
      resolveCollision: (x, z, radius) => this.resolveWorldCollision(x, z, radius),
      getCameraOcclusionMeshes: () => this.worldEngine.getInteractableMeshes(),
      onContextLost: () => {
        this.contextLost = true;
        this.pushHudState(true);
      },
      onContextRestored: () => {
        this.contextLost = false;
        this.pushHudState(true);
      },
    });

    if (this.viewport.isSoftwareGl && this.qualityTier !== 'low') {
      this.qualityTier = 'low';
      const lowCfg = ANDROID_QUALITY_PROFILES.low;
      this.assetManager.setAnisotropyLimit(lowCfg.anisotropy);
      this.worldEngine.setShadowEnabled(lowCfg.shadowsEnabled, lowCfg.shadowMapSize);
      this.worldEngine.setQualityTier('low');
    }

    if (autostart) {
      this.gameplayEngine.setState('playing');
    } else {
      this.gameplayEngine.setState('title');
    }

    this.viewport.mount(this.qualityTier);
    if (autostart) {
      const follow = this.characterEngine.getCameraFollowAnchor();
      this.viewport.resetCameraView(follow, this.characterEngine.getYaw());
    } else {
      this.viewport.snapToTitleOverview();
    }

    this.inputManager.onStartFromTitle = () => this.startSession();
    this.inputManager.onTogglePause = () => this.togglePause();
    this.inputManager.onToggleMute = () => this.toggleMute();
    this.inputManager.onToggleInspector = () => this.toggleInspectorCallback?.();
    this.inputManager.onToggleCameraMode = () => this.toggleCameraMode();
    this.inputManager.onCancelMission = () => this.cancelMission();
    this.inputManager.attach();

    this.pushHudState(true);
  }

  private handleViewportTap(ndcX: number, ndcY: number, camera: THREE.PerspectiveCamera): void {
    if (this.gameplayEngine.getState() !== 'playing') return;
    _ndcVec.set(ndcX, ndcY);
    _pickRaycaster.setFromCamera(_ndcVec, camera);
    const picked = this.worldEngine.pickBuildingByRaycaster(_pickRaycaster);
    this.selectedFeature = picked;
    if (picked) {
      this.audioEngine.playUiTick();
    }
    this.pushHudState(true);
  }

  startSession(): void {
    this.audioEngine.playSessionStartChime();
    this.inputManager.clearHeld();
    const follow = this.characterEngine.getCameraFollowAnchor();
    this.viewport?.resetCameraView(follow, this.characterEngine.getYaw());
    this.cameraMode = 'third-person';
    this.gameplayEngine.setState('playing');
    this.pushHudState(true);
  }

  togglePause(): void {
    const next = this.gameplayEngine.togglePause();
    this.audioEngine.playUiTick();
    if (next !== 'playing') {
      this.inputManager.clearHeld();
    }
    this.pushHudState(true);
  }

  returnToTitle(): void {
    this.audioEngine.playUiTick();
    this.inputManager.clearHeld();
    this.selectedFeature = null;
    this.viewport?.snapToTitleOverview();
    this.gameplayEngine.setState('title');
    this.pushHudState(true);
  }

  setQualityTier(tier: QualityTier): void {
    this.qualityTier = tier;
    const cfg = ANDROID_QUALITY_PROFILES[tier];
    this.assetManager.setAnisotropyLimit(cfg.anisotropy);
    this.worldEngine.setShadowEnabled(cfg.shadowsEnabled, cfg.shadowMapSize);
    this.worldEngine.setQualityTier(tier);
    this.viewport?.applyQualityTier(tier);
    this.audioEngine.playUiTick();
    void this.saveSystem.saveProfile({ qualityTier: tier });
    this.eventBus.emit('graphics:qualityChanged', { tier });
    this.pushHudState(true);
  }

  setTimeOfDay(preset: TimeOfDayPreset): void {
    this.worldEngine.applyTimeOfDay(preset);
    this.audioEngine.playUiTick();
    void this.saveSystem.saveProfile({ timeOfDay: preset });
    this.eventBus.emit('world:timeChanged', { preset });
    this.pushHudState(true);
  }

  toggleCameraMode(): void {
    if (this.vehicleEngine.isDriving()) {
      this.audioEngine.playUiTick();
      const vPose = this.vehicleEngine.getVehiclePose();
      this.viewport?.setVehicleCameraActive(true, vPose, vPose.yaw);
      return;
    }
    const next: ExplorerCameraMode =
      this.cameraMode === 'third-person' ? 'free-inspect' : 'third-person';
    this.setCameraMode(next);
  }

  setCameraMode(mode: ExplorerCameraMode): void {
    this.cameraMode = mode;
    const follow = this.characterEngine.getCameraFollowAnchor();
    this.viewport?.setCameraMode(mode, follow);
    this.audioEngine.playUiTick();
    this.eventBus.emit('world:cameraModeChanged', { mode });
    this.pushHudState(true);
  }

  private resolveWorldCollision(x: number, z: number, radius = 0.48): { x: number; z: number } {
    const afterBuildings = this.worldEngine.resolveExplorerCollision(x, z, radius);
    return this.vehicleEngine.resolveCollision(afterBuildings.x, afterBuildings.z, radius);
  }

  interactNearbyVehicle(): void {
    const res = this.vehicleEngine.tryInteract(
      this.characterEngine.getPosition(),
      (x, z, r) => this.worldEngine.resolveExplorerCollision(x, z, r),
      (x, z) => this.worldEngine.sampleGroundHeight(x, z),
    );
    if (res.action === 'entered') {
      this.characterEngine.setVisible(false);
      this.cameraMode = 'third-person';
      const vPose = this.vehicleEngine.getVehiclePose();
      this.viewport?.setVehicleCameraActive(true, vPose, vPose.yaw);
      const missionStart = this.missionManager.onEnterVehicle(vPose);
      if (missionStart.started) {
        this.npcEngine.startPassengerHandRaise();
      }
      this.audioEngine.playUiTick();
      this.pushHudState(true);
    } else if (res.action === 'exited' && res.exitPosition) {
      this.characterEngine.teleportTo(
        res.exitPosition.x,
        res.exitPosition.z,
        this.vehicleEngine.getVehiclePose().yaw,
        (x, z, r) => this.resolveWorldCollision(x, z, r),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      this.characterEngine.setVisible(true);
      this.viewport?.setVehicleCameraActive(
        false,
        undefined,
        undefined,
        this.characterEngine.getCameraFollowAnchor(),
      );
      this.audioEngine.playUiTick();
      this.pushHudState(true);
    }
  }

  jumpToPreset(preset: PrendaCameraPresetId): void {
    if (this.vehicleEngine.isDriving()) {
      const exitPos = this.vehicleEngine.exitVehicle(
        (x, z, r) => this.worldEngine.resolveExplorerCollision(x, z, r),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      if (exitPos) {
        this.characterEngine.teleportTo(exitPos.x, exitPos.z);
      }
      this.characterEngine.setVisible(true);
      this.viewport?.setVehicleCameraActive(false);
    }

    if (preset === 'center') {
      this.characterEngine.resetToSpawn(
        (x, z, r) => this.resolveWorldCollision(x, z, r),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      this.viewport?.jumpToPreset(preset, this.characterEngine.getCameraFollowAnchor());
    } else if (preset === 'v4-comercial') {
      this.characterEngine.teleportTo(
        -48,
        -14,
        2.0,
        (x, z, r) => this.resolveWorldCollision(x, z, r),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      this.viewport?.jumpToPreset(preset, this.characterEngine.getCameraFollowAnchor());
    } else if (preset === 'paragem-mercado') {
      const stop = this.vehicleEngine.getMercadoStopWorldTransform();
      const standX = stop.x - 0.85;
      const standZ = stop.z + 1.95;
      const faceYaw = Math.atan2(stop.x - standX, stop.z - standZ);
      this.characterEngine.teleportTo(
        standX,
        standZ,
        faceYaw,
        (x, z, r) => this.resolveWorldCollision(x, z, r),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      this.viewport?.jumpToPreset(preset, this.characterEngine.getCameraFollowAnchor());
    } else {
      this.viewport?.jumpToPreset(preset);
    }
    if (this.viewport) {
      this.cameraMode = this.viewport.getCameraMode();
    }
    this.audioEngine.playUiTick();
    this.pushHudState(true);
  }

  setLayerFilter(filter: UrbanLayerFilter): void {
    this.layerFilter = filter;
    this.worldEngine.setLayerFilter(filter);
    this.audioEngine.playUiTick();
    this.eventBus.emit('world:layerFilterChanged', { filter });
    this.pushHudState(true);
  }

  clearSelection(): void {
    this.selectedFeature = null;
    this.pushHudState(true);
  }

  toggleMute(): void {
    const nextMuted = !this.audioEngine.isMuted();
    this.audioEngine.setMuted(nextMuted);
    void this.saveSystem.saveProfile({ muted: nextMuted });
    this.eventBus.emit('audio:muteChanged', { muted: nextMuted });
    this.pushHudState(true);
  }

  toggleTouchControls(): void {
    this.touchControlsVisible = !this.touchControlsVisible;
    this.audioEngine.playUiTick();
    void this.saveSystem.saveProfile({ touchControlsVisible: this.touchControlsVisible });
    this.pushHudState(true);
  }

  resetCamera(): void {
    this.audioEngine.playUiTick();
    if (this.vehicleEngine.isDriving()) {
      const vPose = this.vehicleEngine.getVehiclePose();
      this.viewport?.setVehicleCameraActive(true, vPose, vPose.yaw);
      this.cameraMode = 'third-person';
      this.pushHudState(true);
      return;
    }
    const follow = this.characterEngine.getCameraFollowAnchor();
    this.viewport?.resetCameraView(follow, this.characterEngine.getYaw());
    this.cameraMode = 'third-person';
    this.pushHudState(true);
  }

  cancelMission(): void {
    const res = this.missionManager.cancel();
    if (!res.cancelled) return;
    this.npcEngine.resetPassengerToMercadoStop((x, z) =>
      this.worldEngine.sampleGroundHeight(x, z),
    );
    this.audioEngine.playUiTick();
    this.pushHudState(true);
  }

  getMiniMapData(): {
    readonly roads: readonly PrendaRoadSegment[];
    readonly mercadoPos: { readonly x: number; readonly z: number };
    readonly centroPos: { readonly x: number; readonly z: number };
  } {
    return {
      roads: this.worldEngine.getRoadsForMiniMap(),
      mercadoPos: this.vehicleEngine.getMercadoStopSpec().localPosition,
      centroPos: PRENDA_CENTRO_TARGET,
    };
  }

  listModuleDescriptors(): ModuleDescriptor[] {
    return this.registry.listDescriptors();
  }

  getCartographyStats() {
    return this.worldEngine.getCartographyStats();
  }

  private handleFrame(ctx: ViewportFrameContext): void {
    const state = this.gameplayEngine.getState();
    const input = this.inputManager.consumeFrameState();

    if (input.resetViewPressed) {
      if (this.vehicleEngine.isDriving()) {
        const vPose = this.vehicleEngine.getVehiclePose();
        this.viewport?.setVehicleCameraActive(true, vPose, vPose.yaw);
      } else {
        this.viewport?.resetCameraView(
          this.characterEngine.getCameraFollowAnchor(),
          this.characterEngine.getYaw(),
        );
      }
      this.cameraMode = 'third-person';
    }

    if (state === 'playing' && this.vehicleEngine.isDriving()) {
      const collisionCtx = this.worldEngine.getVehicleCollisionContext();
      const vPose = this.vehicleEngine.stepArcadeDrive(
        { moveX: input.moveX, moveY: input.moveY },
        ctx.dt,
        {
          buildings: collisionCtx.buildings,
          obstacleCircles: collisionCtx.obstacleCircles,
          drivableRoads: collisionCtx.drivableRoads,
          sampleGroundY: (x, z) => this.worldEngine.sampleGroundHeight(x, z),
        },
      );
      this.viewport?.setVehicleCameraTarget(vPose, vPose.yaw);
      if (input.interactPressed) {
        this.interactNearbyVehicle();
      }
    } else if (state === 'playing' && this.cameraMode === 'third-person') {
      this.characterEngine.stepControl(
        input.moveX,
        input.moveY,
        input.sprint,
        this.viewport?.getOrbitYaw() ?? 0.72,
        ctx.dt,
        (x, z, radius) => this.resolveWorldCollision(x, z, radius),
        (x, z) => this.worldEngine.sampleGroundHeight(x, z),
      );
      if (input.interactPressed) {
        this.characterEngine.requestActionSlot('interact');
        this.interactNearbyVehicle();
      }
      const follow = this.characterEngine.getCameraFollowAnchor();
      this.viewport?.setFollowTarget(follow.x, follow.y, follow.z);
    } else {
      this.viewport?.setOrbitInputs(
        input.moveX,
        input.moveY,
        input.sprint,
        state === 'title',
        ctx.dt,
      );
      if (state === 'playing' && input.interactPressed) {
        this.interactNearbyVehicle();
      }
    }

    if (state === 'playing' || state === 'title') {
      this.registry.updateAll(ctx.dt);
    }

    const activeVehiclePose = this.vehicleEngine.getVehiclePose();
    const isDrivingNow = this.vehicleEngine.isDriving();

    if (isDrivingNow) {
      this.miniMapPoseRef.current.x = activeVehiclePose.x;
      this.miniMapPoseRef.current.z = activeVehiclePose.z;
      this.miniMapPoseRef.current.yaw = activeVehiclePose.yaw;
    } else {
      const charPos = this.characterEngine.getPosition();
      this.miniMapPoseRef.current.x = charPos.x;
      this.miniMapPoseRef.current.z = charPos.z;
      this.miniMapPoseRef.current.yaw = this.characterEngine.getYaw();
    }

    const focusPos =
      state === 'playing' && isDrivingNow
        ? activeVehiclePose
        : state === 'playing' && this.cameraMode === 'third-person'
          ? this.characterEngine.getPosition()
          : ctx.targetPosition;
    this.worldEngine.updateFocusPosition(focusPos);
    this.npcEngine.updateFocusPosition(focusPos);

    let missionUiChanged = false;
    if (state === 'playing') {
      const carrierPos = this.missionManager.isActive()
        ? activeVehiclePose
        : this.characterEngine.getPosition();
      const missionStep = this.missionManager.step(
        ctx.dt,
        carrierPos,
        isDrivingNow,
      );
      missionUiChanged = missionStep.uiChanged;

      if (missionStep.passengerShouldBoard) {
        this.npcEngine.hidePassengerInVehicle();
      }
      if (missionStep.justCompleted) {
        this.economyEngine.awardKwanza(
          PRENDA_EXPRESS_REWARD_KZ,
          'Missão Prenda Express: Mercado -> Centro UV1',
        );
        this.npcEngine.spawnPassengerIdleAtCentro(
          PRENDA_CENTRO_DROPOFF_NPC_POSE.x,
          PRENDA_CENTRO_DROPOFF_NPC_POSE.z,
          PRENDA_CENTRO_DROPOFF_NPC_POSE.yaw,
          (x, z) => this.worldEngine.sampleGroundHeight(x, z),
        );
        this.audioEngine.playSessionStartChime();
      }
    }

    this.performanceMonitor.recordFrame(ctx.dt);

    const interactionState = this.vehicleEngine.getInteractionState(
      this.characterEngine.getPosition(),
    );
    const vehicleStateChanged =
      isDrivingNow !== this.lastDrivingState ||
      interactionState.promptText !== this.lastVehiclePrompt ||
      interactionState.feedbackText !== this.lastVehicleFeedback;

    const now = performance.now();
    if (vehicleStateChanged || missionUiChanged || now - this.lastHudPushTime >= 260) {
      this.lastHudPushTime = now;
      this.pushHudState(false, ctx);
    }
  }

  private pushHudState(force: boolean, ctx?: ViewportFrameContext): void {
    if (!this.hudSubscriber) return;
    if (force) {
      this.lastHudPushTime = performance.now();
    }
    if (ctx && (ctx.drawCalls > 0 || this.lastRenderStats.drawCalls === 0)) {
      this.lastRenderStats = {
        drawCalls: ctx.drawCalls,
        triangles: ctx.triangles,
        geometries: ctx.geometries,
        textures: ctx.textures,
      };
    }

    const perfMemory = (
      performance as unknown as { memory?: { usedJSHeapSize: number } }
    ).memory;
    const heapMb = perfMemory
      ? Math.round((perfMemory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
      : null;

    const snapshot = this.performanceMonitor.buildSnapshot(
      this.lastRenderStats,
      this.qualityTier,
      this.viewport?.isSoftwareGl ?? false,
      heapMb,
    );

    const saved = this.saveSystem.getCachedProfile();
    const isDriving = this.vehicleEngine.isDriving();
    const vehiclePose = this.vehicleEngine.getVehiclePose();
    const vehicleInteraction = this.vehicleEngine.getInteractionState(
      this.characterEngine.getPosition(),
    );
    const missionState = this.missionManager.getState();
    this.lastDrivingState = isDriving;
    this.lastVehiclePrompt = vehicleInteraction.promptText;
    this.lastVehicleFeedback = vehicleInteraction.feedbackText;

    this.hudSubscriber({
      gameState: this.gameplayEngine.getState(),
      qualityTier: this.qualityTier,
      timeOfDay: this.worldEngine.getTimeOfDay(),
      cameraMode: this.cameraMode,
      layerFilter: this.layerFilter,
      muted: this.audioEngine.isMuted(),
      touchControlsVisible: this.touchControlsVisible,
      activeChunkKey: this.worldEngine.getActiveChunkKey(),
      nearestStreetLabel: this.worldEngine.getNearestStreetLabel(),
      worldTargetLabel: `Luanda · Prenda UV n.º 1 (${PRENDA_UV1_PUBLISHED_DMS})`,
      geographicalStatus:
        'Ambiente urbano 3D ativo (OSM + UTM 33S; tipologias individuais HPIP por confirmar)',
      selectedFeature: this.selectedFeature,
      metrics: snapshot,
      saveBackend: this.saveSystem.getBackendMode(),
      lastSavedIso: saved.updatedAtIso,
      contextLost: this.contextLost,
      characterLocomotion: this.characterEngine.getLocomotionState(),
      characterSpeedMps: Math.round(this.characterEngine.getSpeed() * 10) / 10,
      characterRigStatus: this.characterEngine.getRigStatus(),
      vehiclePrompt: vehicleInteraction.promptText,
      vehicleFeedback: vehicleInteraction.feedbackText,
      isDrivingVehicle: isDriving,
      vehicleSpeedMps: Math.round(Math.abs(vehiclePose.speedMps) * 10) / 10,
      missionStatus: missionState.status,
      missionDistanceMeters: missionState.distanceMeters,
      missionBanner: missionState.bannerMessage,
      kwanzaBalance: this.economyEngine.getBalanceAoa(),
    });
  }

  dispose(): void {
    this.inputManager.detach();
    this.missionManager.dispose();
    this.viewport?.dispose();
    this.viewport = null;
    this.registry.disposeAll();
    this.physicsAdapter.dispose();
    this.assetManager.disposeAll();
    this.eventBus.clear();
  }
}
