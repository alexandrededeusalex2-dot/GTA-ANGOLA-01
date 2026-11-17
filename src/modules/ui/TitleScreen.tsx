/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Layers, Play } from 'lucide-react';
import { BrandEmblem } from './BrandEmblem';

interface TitleScreenProps {
  readonly onStart: () => void;
  readonly onOpenArchitecture: () => void;
}

export function TitleScreen({ onStart, onOpenArchitecture }: TitleScreenProps) {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-5 sm:p-10">
      <div className="max-w-xl pointer-events-auto rounded-2xl bg-[#0e1116]/88 border border-white/12 p-5 sm:p-7 shadow-2xl">
        <BrandEmblem />
        <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed max-w-md text-balance">
          Exploração urbana 3D em tempo real da Unidade de Vizinhança n.º 1 do bairro Prenda,
          Luanda (08°50&apos;10&quot; S, 13°13&apos;26&quot; E), com rede viária 7V OpenStreetMap,
          22 blocos habitacionais modernistas e ocupação urbana atual.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-slate-950 font-semibold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300"
          >
            <Play className="w-4 h-4 fill-current" aria-hidden="true" />
            Explorar Prenda UV n.º 1
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenArchitecture();
            }}
            className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-100 border border-white/12 font-medium text-sm inline-flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
          >
            <Layers className="w-4 h-4 text-amber-400" aria-hidden="true" />
            Cartografia e Módulos
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-200/95">
        <span className="paint-stroke-text font-medium">
          WASD ou Joystick Mover · Arrastar Câmara · Toque num Edifício para Ficha · V Modo de Câmara · R Repor
        </span>
        <span className="paint-stroke-text font-mono-tabular text-slate-300">
          Fase 3 · Prenda UV n.º 1 (Luanda)
        </span>
      </div>
    </div>
  );
}
