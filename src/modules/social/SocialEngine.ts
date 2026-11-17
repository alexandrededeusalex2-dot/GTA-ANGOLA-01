/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

export interface RelationshipRecord {
  readonly targetId: string;
  readonly affinity: number;
  readonly lastInteractionIso: string;
}

/**
 * Social Engine (Phase 1 Architectural Contract).
 * Prepared for NPC & player relationships, reputation, and proximity interactions.
 */
export class SocialEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'social',
    index: 7,
    name: 'Social Engine',
    responsibility:
      'Relações sociais, reputação comunitária no bairro e prompts de interação contextual.',
    status: 'planned',
    targetPhase: 'Fase 5',
    dependencies: ['NpcEngine', 'MultiplayerService'],
    pendingTasks: [
      'Implementar grafo de afinidade com NPCs e outros jogadores.',
      'Adicionar sistema de gestos e saudações contextuais.',
      'Sincronizar reputação social via Multiplayer Services.',
    ],
  };

  private relationships = new Map<string, RelationshipRecord>();

  init(): void {
    // Phase 1: Architectural contract ready.
  }

  dispose(): void {
    this.relationships.clear();
  }
}
