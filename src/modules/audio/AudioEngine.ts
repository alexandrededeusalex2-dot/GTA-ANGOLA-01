/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EventBus } from '../../core/EventBus';
import type { EngineEvents, EngineModule, ModuleDescriptor } from '../../core/types';

/**
 * Audio Engine: Zero-404 procedural Web Audio API synthesizer prepared for
 * mobile touch unlock, ambient Luanda coastal soundscape, and spatial cues.
 */
export class AudioEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'audio',
    index: 9,
    name: 'Audio Engine',
    responsibility:
      'Desbloqueio Web Audio e tons procedurais de interface/mute ativos. Canais de música, vozes e áudio espacial pendentes.',
    status: 'foundation',
    targetPhase: 'Fase 1 (Base Web Audio) + Fase 3 (Áudio Espacial)',
    dependencies: ['EventBus'],
    pendingTasks: [
      'Adicionar canais separados para rádio local, vozes NPC e ambiente.',
      'Integrar PannerNode 3D sincronizado com a posição da câmara.',
      'Suportar compressão dinâmica para altifalantes de telemóveis.',
    ],
  };

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private unsubMute?: () => void;

  constructor(private readonly eventBus: EventBus<EngineEvents>) {}

  init(): void {
    this.unsubMute = this.eventBus.on('audio:muteChanged', ({ muted }) => {
      this.setMuted(muted);
    });
  }

  unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : 0.28;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.28, this.ctx.currentTime, 0.03);
    }
  }

  playSessionStartChime(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;

    const now = this.ctx.currentTime;
    const notes = [293.66, 369.99, 440.0]; // D4 - F#4 - A4 warm chord
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.055);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.055 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.055 + 0.42);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now + idx * 0.055);
      osc.stop(now + idx * 0.055 + 0.45);
    });
  }

  playUiTick(): void {
    this.unlock();
    if (!this.ctx || !this.masterGain || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.05);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playFootstep(isRunning: boolean): void {
    if (!this.ctx || !this.masterGain || this.muted || this.ctx.state !== 'running') return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isRunning ? 128 : 104, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);

    gain.gain.setValueAtTime(isRunning ? 0.055 : 0.036, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  dispose(): void {
    this.unsubMute?.();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
