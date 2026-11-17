/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { X } from 'lucide-react';
import type {
  ModuleDescriptor,
  QualityTier,
  TimeOfDayPreset,
  UrbanLayerFilter,
} from '../../core/types';
import type { HudTelemetryState } from '../../engine/AngolaVirtualEngine';
import type { PrendaCartographyDataset } from '../world/PrendaCartography';
import { GEOGRAPHICAL_INTEGRITY_PRENDA_UV1 } from '../world/luandaCoordinates';

interface CartographyStatsView {
  readonly dataset: PrendaCartographyDataset['stats'] | null;
  readonly props: {
    readonly kiosksCount: number;
    readonly streetlightsCount: number;
    readonly acaciaTreesCount: number;
    readonly palmTreesCount: number;
    readonly hasCommunityCourt: boolean;
  } | null;
}

interface ArchitectureDrawerProps {
  readonly open: boolean;
  readonly modules: readonly ModuleDescriptor[];
  readonly telemetry: HudTelemetryState;
  readonly cartographyStats: CartographyStatsView;
  readonly onClose: () => void;
  readonly onSelectQuality: (tier: QualityTier) => void;
  readonly onSelectTimeOfDay: (preset: TimeOfDayPreset) => void;
  readonly onSelectLayerFilter: (filter: UrbanLayerFilter) => void;
}

function statusLabel(
  status: ModuleDescriptor['status'],
  id: ModuleDescriptor['id'],
): { text: string; colorClass: string } {
  if (id === 'world' && status === 'implemented') {
    return { text: 'Ambiente Urbano (Fase 2)', colorClass: 'text-emerald-300' };
  }
  if (id === 'character' && status === 'implemented') {
    return { text: 'Personagem Jogável (Fase 3)', colorClass: 'text-emerald-300' };
  }
  switch (status) {
    case 'implemented':
      return { text: 'Funcional (Fase 1)', colorClass: 'text-emerald-300' };
    case 'foundation':
      return { text: 'Base Técnica (Sem Jogabilidade)', colorClass: 'text-amber-300' };
    case 'planned':
      return { text: 'Apenas Contrato / Interface', colorClass: 'text-slate-400' };
  }
}

export function ArchitectureDrawer({
  open,
  modules,
  telemetry,
  cartographyStats,
  onClose,
  onSelectQuality,
  onSelectTimeOfDay,
  onSelectLayerFilter,
}: ArchitectureDrawerProps) {
  if (!open) return null;

  const ds = cartographyStats.dataset;
  const pr = cartographyStats.props;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-modal-title"
      className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-3 sm:p-6 pointer-events-auto"
    >
      <div className="w-full max-w-4xl max-h-[90vh] rounded-2xl bg-[#11151d] border border-white/12 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div>
            <h2 id="arch-modal-title" className="font-display text-lg sm:text-xl font-bold text-slate-50">
              Cartografia Prenda UV n.º 1 e Arquitetura Modular — ANGOLA VIRTUAL
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              12 módulos preservados · {telemetry.saveBackend.toUpperCase()} · {telemetry.geographicalStatus}
            </p>
          </div>

          <button
            type="button"
            aria-label="Fechar inspetor de arquitetura"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6">
          {/* Live Hardware & Android Budget Telemetry */}
          <section aria-label="Telemetria de renderização e cartografia">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                <div className="text-[11px] text-slate-400">Taxa de Fotogramas</div>
                <div className="mt-1 text-lg font-mono-tabular font-semibold text-amber-300">
                  {telemetry.metrics.fps} FPS
                </div>
              </div>
              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                <div className="text-[11px] text-slate-400">Draw Calls / Triângulos</div>
                <div className="mt-1 text-lg font-mono-tabular font-semibold text-slate-100">
                  {telemetry.metrics.drawCalls} / {telemetry.metrics.triangles}
                </div>
              </div>
              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                <div className="text-[11px] text-slate-400">Sector Ativo (128m)</div>
                <div className="mt-1 text-sm font-mono-tabular font-semibold text-emerald-300">
                  {telemetry.activeChunkKey}
                </div>
              </div>
              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                <div className="text-[11px] text-slate-400">Motor WebGL</div>
                <div className="mt-1 text-sm font-mono-tabular font-semibold text-slate-100">
                  {telemetry.metrics.isSoftwareGl ? 'Software WebGL' : 'GPU Hardware'}
                </div>
              </div>
            </div>
          </section>

          {/* Cartographic Inventory (WGS84 / UTM 33S / 7V) */}
          {ds && (
            <section aria-label="Inventário cartográfico da UV n.º 1" className="space-y-2.5">
              <h3 className="font-display text-sm font-semibold text-slate-100">
                Inventário Cartográfico Digitalizado (EPSG:4326 → EPSG:32733 UTM 33S)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                  <div className="text-[11px] text-slate-400">Edifícios Reais OSM</div>
                  <div className="mt-1 text-base font-mono-tabular font-semibold text-slate-100">
                    {ds.totalBuildings} ({ds.historical22BlocksCount} blocos UV1)
                  </div>
                </div>
                <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                  <div className="text-[11px] text-slate-400">Rede Viária 7V</div>
                  <div className="mt-1 text-xs font-mono-tabular font-semibold text-amber-200">
                    {ds.roadSegmentsCount} troços · V3:{ds.roadCountBy7V.V3} V4:{ds.roadCountBy7V.V4} V5:{ds.roadCountBy7V.V5} V6:{ds.roadCountBy7V.V6} V7:{ds.roadCountBy7V.V7}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                  <div className="text-[11px] text-slate-400">Cruzamentos / Impasses</div>
                  <div className="mt-1 text-base font-mono-tabular font-semibold text-slate-100">
                    {ds.intersectionsCount} nós reais
                  </div>
                </div>
                <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3">
                  <div className="text-[11px] text-slate-400">Mobiliário e Vegetação</div>
                  <div className="mt-1 text-xs font-mono-tabular font-semibold text-emerald-300">
                    {pr ? `${pr.kiosksCount} bancas · ${pr.acaciaTreesCount + pr.palmTreesCount} árvores · ${pr.streetlightsCount} candeeiros` : 'Ativo'}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Quick Calibration Controls */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#0b0e14] border border-white/8 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Perfil Android:</span>
              {(['low', 'medium', 'high'] as QualityTier[]).map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => onSelectQuality(tier)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    telemetry.qualityTier === tier
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {tier === 'low' ? 'Poupança' : tier === 'medium' ? 'Equilibrado' : 'Alta'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Camada:</span>
              {(['all', 'historical', 'contemporary'] as UrbanLayerFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onSelectLayerFilter(f)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    telemetry.layerFilter === f
                      ? 'bg-emerald-400 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'Tudo' : f === 'historical' ? 'Base 1965' : 'Atual'}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-300">Sol:</span>
              {(['morning', 'noon', 'sunset'] as TimeOfDayPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onSelectTimeOfDay(preset)}
                  className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium cursor-pointer ${
                    telemetry.timeOfDay === preset
                      ? 'bg-slate-100 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:text-white'
                  }`}
                >
                  {preset === 'morning' ? 'Manhã' : preset === 'noon' ? 'Meio-Dia' : 'Pôr do Sol'}
                </button>
              ))}
            </div>
          </section>

          {/* Geographical Integrity Separation */}
          <section aria-label="Integridade geográfica da UV n.º 1 do Prenda" className="space-y-2.5">
            <h3 className="font-display text-sm font-semibold text-slate-100">
              Integridade Geográfica — Unidade de Vizinhança n.º 1 (Bairro Prenda)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3.5">
                <div className="text-xs font-semibold text-emerald-300">
                  Dados Geográficos Confirmados
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                  {GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.confirmedData.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3.5">
                <div className="text-xs font-semibold text-amber-300">
                  Dados Históricos (1963–1965)
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                  {GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.historicalData.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3.5">
                <div className="text-xs font-semibold text-slate-200">
                  Dados Ainda Não Georreferenciados
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                  {GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.ungeoreferencedData.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl bg-[#0b0e14] border border-white/8 p-3.5">
                <div className="text-xs font-semibold text-rose-300">
                  Elementos Pendentes de Validação
                </div>
                <ul className="mt-1.5 space-y-1 text-[11px] text-slate-300 list-disc pl-4">
                  {GEOGRAPHICAL_INTEGRITY_PRENDA_UV1.pendingValidation.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 12 Modules Matrix */}
          <section aria-label="Lista dos 12 módulos da arquitetura">
            <h3 className="font-display text-sm font-semibold text-slate-100 mb-2.5">
              Estado Real dos 12 Módulos
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {modules.map((mod) => {
                const badge = statusLabel(mod.status, mod.id);
                return (
                  <article
                    key={mod.id}
                    className="rounded-xl bg-[#0b0e14] border border-white/8 p-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h4 className="font-display font-semibold text-sm text-slate-100">
                          {String(mod.index).padStart(2, '0')}. {mod.name}
                        </h4>
                        <span className={`text-[11px] font-medium shrink-0 ${badge.colorClass}`}>
                          {badge.text}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                        {mod.responsibility}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-white/6 text-[11px] text-slate-400">
                      <span className="text-slate-300 font-medium">Alvo:</span> {mod.targetPhase}
                      <span aria-hidden="true"> · </span>
                      <span>Próximo: {mod.pendingTasks[0]}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
