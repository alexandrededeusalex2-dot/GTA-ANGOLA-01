/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor, Vector3Like } from '../../core/types';

export type MultiplayerConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting';

export interface PlayerTransformPacket {
  readonly playerId: string;
  readonly position: Vector3Like;
  readonly yawRad: number;
  readonly timestampMs: number;
}

export interface IMultiplayerTransport {
  readonly state: MultiplayerConnectionState;
  connect(endpointUrl: string): Promise<void>;
  sendTransform(packet: PlayerTransformPacket): void;
  disconnect(): void;
}

/**
 * Multiplayer Services (Phase 1 Architectural Contract).
 * Prepared for WebSocket real-time synchronization with a future Node.js server.
 * Intentionally remains offline in Phase 1.
 */
export class MultiplayerService implements EngineModule, IMultiplayerTransport {
  readonly descriptor: ModuleDescriptor = {
    id: 'multiplayer',
    index: 10,
    name: 'Multiplayer Services',
    responsibility:
      'Comunicação em tempo real via WebSocket com servidor Node.js para sincronização de jogadores e eventos.',
    status: 'planned',
    targetPhase: 'Fase 5',
    dependencies: ['GameplayEngine', 'SocialEngine'],
    pendingTasks: [
      'Implementar servidor autoritativo Node.js + WebSocket em server.ts.',
      'Adicionar interpolação de movimento para avatares remotos.',
      'Validar reconexão resiliente em redes móveis 4G/LTE angolanas.',
    ],
  };

  state: MultiplayerConnectionState = 'offline';

  init(): void {
    this.state = 'offline';
  }

  async connect(_endpointUrl: string): Promise<void> {
    throw new Error(
      'MultiplayerService ainda não está ativo na Fase 1 (Fundação Técnica).',
    );
  }

  sendTransform(_packet: PlayerTransformPacket): void {
    // No-op while offline in Phase 1.
  }

  disconnect(): void {
    this.state = 'offline';
  }

  dispose(): void {
    this.disconnect();
  }
}
