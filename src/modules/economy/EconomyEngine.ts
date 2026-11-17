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
      'Sistema monetário em Kwanzas (AOA), recompensas de missões, comércio local e registo de transações.',
    status: 'implemented',
    targetPhase: 'Fase 7 — Missão Candongueiro (+100 Kz)',
    dependencies: ['SaveSystem', 'EventBus'],
    pendingTasks: [
      'Expandir carteira do jogador com despesas de combustível e manutenção.',
      'Definir preços de referência para comércio e transportes em Luanda.',
      'Ligar persistência autoritativa ao futuro backend PostgreSQL.',
    ],
  };

  private ledger: EconomyTransaction[] = [];
  private balanceAoa = 0;

  init(): void {
    this.syncDomAttributes();
  }

  getBalanceAoa(): number {
    return this.balanceAoa;
  }

  awardKwanza(amountAoa: number, reason: string): number {
    const cleanAmount = Math.round(amountAoa);
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return this.balanceAoa;
    }
    this.balanceAoa += cleanAmount;
    this.ledger.push({
      id: `tx_${this.ledger.length + 1}`,
      timestampIso: new Date().toISOString(),
      amountAoa: cleanAmount,
      reason,
    });
    this.syncDomAttributes();
    return this.balanceAoa;
  }

  getLedger(): readonly EconomyTransaction[] {
    return this.ledger;
  }

  private syncDomAttributes(): void {
    if (typeof document === 'undefined' || !document.body) return;
    document.body.dataset.kwanza = String(this.balanceAoa);
  }

  dispose(): void {
    this.ledger = [];
    this.balanceAoa = 0;
  }
}
