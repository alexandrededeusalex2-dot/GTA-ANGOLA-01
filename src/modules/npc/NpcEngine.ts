/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

export interface NpcScheduleContract {
  readonly npcId: string;
  readonly role: string;
  readonly homeZoneId: string;
  readonly activeWindowHours: readonly [number, number];
}

/**
 * NPC Engine (Phase 1 Architectural Contract).
 * Prepared for system-controlled residents, merchants, and pedestrian pooling
 * tuned for low-end Android CPU/memory budgets.
 */
export class NpcEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'npc',
    index: 4,
    name: 'NPC Engine',
    responsibility:
      'População controlada pelo sistema, rotinas diárias e gestão por pooling para equipamentos Android.',
    status: 'planned',
    targetPhase: 'Fase 3 / Fase 4',
    dependencies: ['WorldEngine', 'CharacterEngine'],
    pendingTasks: [
      'Criar navegação por waypoints nos passeios do bairro Prenda.',
      'Implementar object pooling de NPCs por raio de câmara.',
      'Adicionar diálogos contextuais em Português de Angola.',
    ],
  };

  private schedules: NpcScheduleContract[] = [];

  init(): void {
    // Phase 1: Architectural boundary prepared.
  }

  registerSchedule(schedule: NpcScheduleContract): void {
    this.schedules.push(schedule);
  }

  dispose(): void {
    this.schedules = [];
  }
}
