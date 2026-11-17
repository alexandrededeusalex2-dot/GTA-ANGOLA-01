/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

/**
 * User Interface Module Descriptor (Module 12).
 * Represents the React + Tailwind mobile-first HUD, title shell,
 * touch controls, and module diagnostic drawer.
 */
export class UiModule implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'ui',
    index: 12,
    name: 'User Interface',
    responsibility:
      'Menus, ecrã inicial, HUD móvel não-intrusivo, controlos táteis para Android e inspetor arquitetural.',
    status: 'implemented',
    targetPhase: 'Fase 1 (Shell & Touch) + Fase 2+ (Inventário & Mapas)',
    dependencies: ['GameplayEngine', 'InputManager', 'SaveSystem'],
    pendingTasks: [
      'Adicionar inventário visual, minimapa vetorial do bairro Prenda e telemóvel in-game.',
      'Implementar barra contextual de interação com NPCs, lojas e veículos.',
      'Integrar painéis de economia (Kz) e seleção de carreiras.',
    ],
  };

  init(): void {
    // Lifecycle handled by React mount tree.
  }

  dispose(): void {
    // Lifecycle handled by React unmount.
  }
}
