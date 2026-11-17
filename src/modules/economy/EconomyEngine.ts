/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor } from '../../core/types';

export interface EconomyTransaction {
  readonly id: string;
  readonly timestampIso: string;
  readonly amountAoa: number;
  readonly reason: string;
}

export function formatKwanza(amountAoa: number): string {
  const rounded = Math.round(amountAoa);
  return `${rounded.toLocaleString('pt-AO')} Kz`;
}

/**
 * Economy Engine (Phase 1 Architectural Contract).
 * Prepared for Kwanza (AOA) transactions, local commerce, and future server ledger sync.
 */
export class EconomyEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'economy',
    index: 5,
    name: 'Economy Engine',
    responsibility:
      'Sistema monetário em Kwanzas (AOA), comércio local, inventário financeiro e registo de transações.',
    status: 'planned',
    targetPhase: 'Fase 4',
    dependencies: ['SaveSystem', 'EventBus'],
    pendingTasks: [
      'Implementar carteira do jogador com validação transacional.',
      'Definir preços de referência para comércio e transportes em Luanda.',
      'Ligar persistência autoritativa ao futuro backend PostgreSQL.',
    ],
  };

  private ledger: EconomyTransaction[] = [];

  init(): void {
    // Phase 1: Architectural contract ready.
  }

  getLedger(): readonly EconomyTransaction[] {
    return this.ledger;
  }

  dispose(): void {
    this.ledger = [];
  }
}
