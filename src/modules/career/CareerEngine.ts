/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

export interface CareerDefinition {
  readonly id: string;
  readonly title: string;
  readonly baseHourlyAoa: number;
  readonly requiredZoneId: string;
}

/**
 * Career Engine (Phase 1 Architectural Contract).
 * Prepared for professions, daily work shifts, and progression hooks in Phase 4.
 */
export class CareerEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'career',
    index: 6,
    name: 'Career Engine',
    responsibility:
      'Profissões, contratos de trabalho, turnos remunerados e progressão de competências.',
    status: 'planned',
    targetPhase: 'Fase 4',
    dependencies: ['EconomyEngine', 'WorldEngine'],
    pendingTasks: [
      'Definir carreiras iniciais em Luanda (motorista, técnico, comerciante).',
      'Implementar sistema de turnos e metas ligadas ao Economy Engine.',
      'Persistir progresso profissional no Save System.',
    ],
  };

  private careers = new Map<string, CareerDefinition>();

  init(): void {
    // Phase 1: Architectural contract only.
  }

  registerCareer(def: CareerDefinition): void {
    this.careers.set(def.id, def);
  }

  dispose(): void {
    this.careers.clear();
  }
}
