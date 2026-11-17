/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Home, Layers, Play, RotateCcw } from 'lucide-react';
import type { HudTelemetryState } from '../../engine/AngolaVirtualEngine';

interface PauseModalProps {
  readonly telemetry: HudTelemetryState;
  readonly onResume: () => void;
  readonly onResetCamera: () => void;
  readonly onOpenArchitecture: () => void;
  readonly onReturnToTitle: () => void;
}

export function PauseModal({
  telemetry,
  onResume,
  onResetCamera,
  onOpenArchitecture,
  onReturnToTitle,
}: PauseModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
      className="fixed inset-0 z-30 bg-black/72 flex items-center justify-center p-4 pointer-events-auto"
    >
      <div className="w-full max-w-md rounded-2xl bg-[#11151d] border border-white/12 p-6 shadow-2xl">
        <h2 id="pause-modal-title" className="font-display text-2xl font-bold text-slate-50">
          Sessão em Pausa
        </h2>
        <p className="mt-1 text-xs text-slate-300">
          {telemetry.nearestStreetLabel} · Modo{' '}
          {telemetry.cameraMode === 'third-person' ? '3.ª Pessoa' : 'Inspeção Livre'} ·{' '}
          {telemetry.saveBackend.toUpperCase()}
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
            <div className="text-[11px] text-slate-400">Desempenho</div>
            <div className="mt-0.5 text-base font-mono-tabular font-semibold text-amber-300">
              {telemetry.metrics.fps} FPS
            </div>
          </div>
          <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
            <div className="text-[11px] text-slate-400">Draw Calls</div>
            <div className="mt-0.5 text-base font-mono-tabular font-semibold text-slate-100">
              {telemetry.metrics.drawCalls}
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            data-start="true"
            onClick={onResume}
            className="min-h-[44px] w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            Continuar Exploração
          </button>

          <button
            type="button"
            onClick={() => {
              onResetCamera();
              onResume();
            }}
            className="min-h-[44px] w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Repor Câmara na Origem da UV n.º 1
          </button>

          <button
            type="button"
            onClick={onOpenArchitecture}
            className="min-h-[44px] w-full rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-medium text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-amber-400" aria-hidden="true" />
            Cartografia e 12 Módulos
          </button>

          <button
            type="button"
            onClick={onReturnToTitle}
            className="min-h-[44px] w-full rounded-xl bg-transparent hover:bg-slate-800/70 text-slate-300 font-medium text-sm inline-flex items-center justify-center gap-2 cursor-pointer border border-white/10"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            Voltar ao Ecrã Inicial
          </button>
        </div>
      </div>
    </div>
  );
}
