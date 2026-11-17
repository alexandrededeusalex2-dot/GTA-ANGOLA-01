/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

export type VehicleCategory = 'sedan' | 'candongueiro' | 'suv' | 'motociclo';

export interface VehicleSpecContract {
  readonly id: string;
  readonly category: VehicleCategory;
  readonly gltfUrl: string;
  readonly maxSpeedKmh: number;
  readonly wheelCount: number;
}

/**
 * Vehicle Engine (Phase 1 Architectural Contract).
 * Prepared for urban Luanda transport (including Candongueiros and sedans),
 * wheel raycast suspension, and touch driving controls.
 */
export class VehicleEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'vehicle',
    index: 3,
    name: 'Vehicle Engine',
    responsibility:
      'Veículos terrestres em GLB, física de suspensão, condução móvel por toque e tráfego de Luanda.',
    status: 'planned',
    targetPhase: 'Fase 3',
    dependencies: ['AssetManager', 'PhysicsAdapter', 'InputManager'],
    pendingTasks: [
      'Integrar física de 4 rodas via Rapier RaycastVehicle.',
      'Implementar entrada/saída do jogador nos veículos.',
      'Criar controlos táteis dedicados de aceleração, travagem e direção.',
    ],
  };

  private specs = new Map<string, VehicleSpecContract>();

  init(): void {
    // Phase 1: Contract only; no provisional box vehicles spawned.
  }

  registerVehicleSpec(spec: VehicleSpecContract): void {
    this.specs.set(spec.id, spec);
  }

  dispose(): void {
    this.specs.clear();
  }
}
