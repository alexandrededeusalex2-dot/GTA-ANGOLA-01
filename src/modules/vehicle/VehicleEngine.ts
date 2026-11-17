/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { EventBus } from '../../core/EventBus';
import type { EngineEvents, EngineModule, ModuleDescriptor, Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import type { LocalPoint2D } from '../world/PrendaCartography';
import { groundHeightAt } from '../world/luandaCoordinates';
import {
  canEnterVehicleAtDistance,
  computeVehicleExitPosition,
  computeWheelSteerInput,
  stepVehicleArcadeControl,
  stepVehicleWheelVisuals,
  type VehicleArcadeState,
  type VehicleControlInput,
  type VehicleWorldQuery,
} from './VehicleController';
import {
  CANDONGUEIRO_DIMENSIONS,
  CANDONGUEIRO_ENTER_PROMPT,
  CANDONGUEIRO_EXIT_PROMPT,
  computeVehicleInteractionState,
  createVehicleObb,
  getCandongueiroManifest,
  getParagensUv01,
  resolveVehicleCollision2D,
  spawnCandongueiroVehicle,
  type CandongueiroManifest,
  type ParagemStopSpec,
  type SpawnedCandongueiro,
  type VehicleInteractionState,
} from './VehicleSpawner';

export type VehicleCategory = 'sedan' | 'candongueiro' | 'suv' | 'motociclo';

export interface VehicleSpecContract {
  readonly id: string;
  readonly category: VehicleCategory;
  readonly gltfUrl: string;
  readonly maxSpeedKmh: number;
  readonly wheelCount: number;
}

export const MAX_ACTIVE_VEHICLES = 1;

/**
 * Vehicle Engine (Phase 5 & Phase 6 — Candongueiro Real Low-Poly + Arcade Driving):
 * Spawns at most 1 realistic low-poly GLB Candongueiro at Paragem do Mercado UV1,
 * handles [E] entry within 2.5m, lightweight arcade translate + rotateY driving
 * (8 m/s max, 90 deg/s steer, 2m forward obstacle raycast), and [E]/[F] door exit.
 */
export class VehicleEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'vehicle',
    index: 3,
    name: 'Vehicle Engine',
    responsibility:
      'Candongueiro Hiace real em GLB conduzível em modo arcade (8 m/s, 90°/s, raycast 2m frontal e câmara GTA 3.ª pessoa) nas vias da UV n.º 1.',
    status: 'implemented',
    targetPhase: 'Fase 6 — Condução Arcade do Candongueiro',
    dependencies: ['AssetManager', 'WorldEngine', 'InputManager', 'EventBus'],
    pendingTasks: [
      'Adicionar áudio procedural de motor e buzina em fases seguintes.',
      'Integrar física avançada apenas se necessário fora do perfil Android leve.',
    ],
  };

  private specs = new Map<string, VehicleSpecContract>();
  private spawnedCandongueiro: SpawnedCandongueiro | null = null;
  private targetScene: THREE.Scene | null = null;
  private spawnPromise: Promise<void> | null = null;
  private disposed = false;
  private drivingState: VehicleArcadeState;

  constructor(
    private readonly assetManager?: AssetManager,
    private readonly eventBus?: EventBus<EngineEvents>,
  ) {
    const stop = this.getMercadoStopSpec();
    this.drivingState = {
      x: stop.localPosition.x,
      y: stop.localPosition.y,
      z: stop.localPosition.z,
      yaw: stop.headingRad,
      speedMps: 0,
      isOccupied: false,
      obstacleAhead: false,
    };
  }

  init(): void {
    const manifest = getCandongueiroManifest();
    this.registerVehicleSpec({
      id: manifest.id,
      category: 'candongueiro',
      gltfUrl: manifest.url,
      maxSpeedKmh: 29,
      wheelCount: 4,
    });
  }

  registerVehicleSpec(spec: VehicleSpecContract): void {
    this.specs.set(spec.id, spec);
  }

  getManifest(): CandongueiroManifest {
    return getCandongueiroManifest();
  }

  getMercadoStopSpec(): ParagemStopSpec {
    const stops = getParagensUv01();
    const mercado = stops.find((s) => s.id === 'paragem_mercado_uv1') ?? stops[0];
    if (!mercado) {
      throw new Error('paragens_uv01.geojson não contém a paragem do Mercado UV1.');
    }
    return mercado;
  }

  async mountToScene(
    scene: THREE.Scene,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): Promise<void> {
    this.targetScene = scene;
    if (this.disposed || !this.assetManager) return;

    if (this.spawnedCandongueiro) {
      if (this.spawnedCandongueiro.rootGroup.parent !== scene) {
        scene.add(this.spawnedCandongueiro.rootGroup);
      }
      return;
    }

    if (this.spawnPromise) {
      return this.spawnPromise;
    }

    const stop = this.getMercadoStopSpec();
    this.spawnPromise = spawnCandongueiroVehicle(this.assetManager, stop, sampleGroundY)
      .then((spawned) => {
        if (this.disposed) {
          this.assetManager?.disposeObject3D(spawned.rootGroup);
          return;
        }
        this.spawnedCandongueiro = spawned;
        this.drivingState = {
          x: stop.localPosition.x,
          y: spawned.placement.groundY,
          z: stop.localPosition.z,
          yaw: stop.headingRad,
          speedMps: 0,
          isOccupied: false,
          obstacleAhead: false,
        };
        if (this.targetScene && spawned.rootGroup.parent !== this.targetScene) {
          this.targetScene.add(spawned.rootGroup);
        }
      })
      .finally(() => {
        this.spawnPromise = null;
      });

    return this.spawnPromise;
  }

  getSpawnedCount(): number {
    return this.spawnedCandongueiro ? 1 : 0;
  }

  isDriving(): boolean {
    return this.drivingState.isOccupied;
  }

  getVehiclePose(): VehicleArcadeState {
    return this.drivingState;
  }

  getMercadoStopWorldTransform(): {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly headingRad: number;
    readonly length: number;
    readonly width: number;
  } {
    return {
      x: this.drivingState.x,
      y: this.drivingState.y,
      z: this.drivingState.z,
      headingRad: this.drivingState.yaw,
      length: CANDONGUEIRO_DIMENSIONS.length,
      width: CANDONGUEIRO_DIMENSIONS.width,
    };
  }

  resolveCollision(x: number, z: number, radius = 0.48): LocalPoint2D {
    if (!this.spawnedCandongueiro || this.drivingState.isOccupied) {
      return { x, z };
    }
    return resolveVehicleCollision2D(x, z, radius, this.spawnedCandongueiro.obb);
  }

  getInteractionState(playerPos: Vector3Like): VehicleInteractionState {
    if (this.drivingState.isOccupied) {
      return {
        nearVehicle: true,
        distanceMeters: 0,
        promptText: CANDONGUEIRO_EXIT_PROMPT,
        feedbackText: null,
      };
    }
    return computeVehicleInteractionState(
      playerPos,
      { x: this.drivingState.x, z: this.drivingState.z },
      0,
    );
  }

  enterVehicle(playerPos: Vector3Like): boolean {
    if (this.drivingState.isOccupied) return false;
    if (!canEnterVehicleAtDistance(playerPos, this.drivingState)) {
      return false;
    }
    this.drivingState = {
      ...this.drivingState,
      speedMps: 0,
      isOccupied: true,
      obstacleAhead: false,
    };
    this.eventBus?.emit('input:action', { action: 'interact' });
    this.syncDomAttributes();
    return true;
  }

  exitVehicle(
    resolveExplorerCollision: (x: number, z: number, radius: number) => LocalPoint2D,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): Vector3Like | null {
    if (!this.drivingState.isOccupied) return null;

    const exitPos = computeVehicleExitPosition(
      { x: this.drivingState.x, z: this.drivingState.z },
      this.drivingState.yaw,
      resolveExplorerCollision,
      sampleGroundY,
    );

    this.drivingState = {
      ...this.drivingState,
      speedMps: 0,
      isOccupied: false,
      obstacleAhead: false,
    };
    if (this.spawnedCandongueiro) {
      stepVehicleWheelVisuals(this.spawnedCandongueiro.wheels, 0, 0, 0);
    }
    this.applyTransformToMesh();
    this.eventBus?.emit('input:action', { action: 'interact' });
    this.syncDomAttributes();
    return exitPos;
  }

  tryInteract(
    playerPos: Vector3Like,
    resolveExplorerCollision?: (x: number, z: number, radius: number) => LocalPoint2D,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): {
    readonly action: 'entered' | 'exited' | 'none';
    readonly exitPosition: Vector3Like | null;
    readonly promptText: string | null;
  } {
    if (this.drivingState.isOccupied) {
      const resolver = resolveExplorerCollision ?? ((x, z) => ({ x, z }));
      const exitPosition = this.exitVehicle(resolver, sampleGroundY);
      return {
        action: 'exited',
        exitPosition,
        promptText: CANDONGUEIRO_ENTER_PROMPT,
      };
    }

    if (this.enterVehicle(playerPos)) {
      return {
        action: 'entered',
        exitPosition: null,
        promptText: CANDONGUEIRO_EXIT_PROMPT,
      };
    }

    return { action: 'none', exitPosition: null, promptText: null };
  }

  stepArcadeDrive(
    input: VehicleControlInput,
    dt: number,
    worldQuery: VehicleWorldQuery,
  ): VehicleArcadeState {
    if (!this.drivingState.isOccupied) return this.drivingState;
    const clampedDt = Math.max(0.001, Math.min(0.05, dt));
    this.drivingState = stepVehicleArcadeControl(this.drivingState, input, clampedDt, worldQuery);
    if (this.spawnedCandongueiro) {
      const steering = computeWheelSteerInput(input.moveX);
      stepVehicleWheelVisuals(
        this.spawnedCandongueiro.wheels,
        this.drivingState.speedMps,
        steering,
        clampedDt,
      );
    }
    this.applyTransformToMesh();
    this.syncDomAttributes();
    return this.drivingState;
  }

  private applyTransformToMesh(): void {
    if (!this.spawnedCandongueiro) return;
    const { rootGroup } = this.spawnedCandongueiro;
    rootGroup.position.set(this.drivingState.x, this.drivingState.y, this.drivingState.z);
    rootGroup.rotation.set(0, this.drivingState.yaw, 0);
    this.spawnedCandongueiro.obb = createVehicleObb(
      this.drivingState.x,
      this.drivingState.z,
      this.drivingState.yaw,
    );
  }

  private syncDomAttributes(): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.vehicleDriving = this.drivingState.isOccupied ? 'true' : 'false';
    document.body.dataset.vehicleSpeed = this.drivingState.speedMps.toFixed(2);
    document.body.dataset.vehiclePos = `${this.drivingState.x.toFixed(2)},${this.drivingState.y.toFixed(2)},${this.drivingState.z.toFixed(2)}`;
    if (this.spawnedCandongueiro) {
      const { frontLeft, rearLeft } = this.spawnedCandongueiro.wheels;
      document.body.dataset.vehicleWheelSpin = (frontLeft?.rotation.x ?? 0).toFixed(3);
      document.body.dataset.vehicleWheelSteer = (frontLeft?.rotation.y ?? 0).toFixed(3);
      document.body.dataset.vehicleRearSteer = (rearLeft?.rotation.y ?? 0).toFixed(3);
    }
  }

  update(_dt: number): void {
    // Arcade driving steps cleanly in stepArcadeDrive during simulation frames.
  }

  dispose(): void {
    this.disposed = true;
    if (this.spawnedCandongueiro) {
      this.spawnedCandongueiro.rootGroup.removeFromParent();
      this.spawnedCandongueiro = null;
    }
    this.specs.clear();
  }
}
