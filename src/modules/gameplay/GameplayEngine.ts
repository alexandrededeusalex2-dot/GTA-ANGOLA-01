/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventBus } from '../../core/EventBus';
import type { EngineEvents, EngineModule, GameState, ModuleDescriptor } from '../../core/types';

/**
 * Gameplay Engine: Manages the core application state machine
 * ('title' -> 'playing' -> 'paused') and mirrors state cleanly to the DOM.
 */
export class GameplayEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'gameplay',
    index: 8,
    name: 'Gameplay Engine',
    responsibility:
      'Máquina de estados da sessão (título, exploração, pausa) e base de ciclo. Regras de jogabilidade ainda não implementadas.',
    status: 'foundation',
    targetPhase: 'Fase 1 (Estado Base) + Fase 2+ (Regras)',
    dependencies: ['EventBus'],
    pendingTasks: [
      'Integrar ciclo de necessidades e objetivos de exploração do mundo.',
      'Ligar eventos de colisão e interação do PhysicsAdapter.',
      'Adicionar sistema de missões de introdução na UV n.º 1.',
    ],
  };

  private state: GameState = 'title';
  private timeScale = 1;

  constructor(private readonly eventBus: EventBus<EngineEvents>) {}

  init(): void {
    this.syncBodyStateAttribute();
  }

  getState(): GameState {
    return this.state;
  }

  getTimeScale(): number {
    return this.state === 'playing' ? this.timeScale : 0;
  }

  setState(next: GameState): void {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.syncBodyStateAttribute();
    this.eventBus.emit('game:stateChanged', { from: prev, to: next });
  }

  togglePause(): GameState {
    if (this.state === 'playing') {
      this.setState('paused');
    } else if (this.state === 'paused') {
      this.setState('playing');
    }
    return this.state;
  }

  private syncBodyStateAttribute(): void {
    if (typeof document !== 'undefined') {
      document.body.dataset.state = this.state;
    }
  }

  dispose(): void {
    this.state = 'title';
  }
}
