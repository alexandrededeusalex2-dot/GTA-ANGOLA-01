/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Gamepad2,
  Layers,
  MapPin,
  Pause,
  RotateCw,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
  ExplorerCameraMode,
  QualityTier,
  TimeOfDayPreset,
  UrbanLayerFilter,
} from '../../core/types';
import type { HudTelemetryState } from '../../engine/AngolaVirtualEngine';
import type { PrendaCameraPresetId } from '../../engine/ThreeViewportController';
import { TouchControls } from './TouchControls';

interface HudOverlayProps {
  readonly telemetry: HudTelemetryState;
  readonly onToggleMute: () => void;
  readonly onTogglePause: () => void;
  readonly onOpenArchitecture: () => void;
  readonly onToggleCameraMode: () => void;
  readonly onSelectQuality: (tier: QualityTier) => void;
  readonly onSelectTimeOfDay: (preset: TimeOfDayPreset) => void;
  readonly onSelectLayerFilter: (filter: UrbanLayerFilter) => void;
  readonly onJumpPreset: (preset: PrendaCameraPresetId) => void;
  readonly onClearSelection: () => void;
  readonly onToggleTouchControls: () => void;
  readonly onStickMove: (x: number, y: number) => void;
  readonly onSprintChange: (active: boolean) => void;
  readonly onResetCamera: () => void;
}

const QUALITY_OPTIONS: { id: QualityTier; label: string }[] = [
  { id: 'low', label: 'Poupança' },
  { id: 'medium', label: 'Equilibrado' },
  { id: 'high', label: 'Alta' },
];

const TIME_OPTIONS: { id: TimeOfDayPreset; label: string }[] = [
  { id: 'morning', label: 'Manhã' },
  { id: 'noon', label: 'Meio-Dia' },
  { id: 'sunset', label: 'Pôr do Sol' },
];

const LAYER_OPTIONS: { id: UrbanLayerFilter; label: string }[] = [
  { id: 'all', label: 'Tudo' },
  { id: 'historical', label: 'Base 1965' },
  { id: 'contemporary', label: 'Atual' },
];

const CAMERA_PRESETS: { id: PrendaCameraPresetId; label: string }[] = [
  { id: 'center', label: 'Centro UV1' },
  { id: 'lotes-1-6', label: 'Lotes 1–6' },
  { id: 'sul-d1-d2', label: 'Blocos Sul' },
  { id: 'v4-comercial', label: 'Via V4' },
  { id: 'vista-aerea', label: '7V Aérea' },
];

function cameraModeLabel(mode: ExplorerCameraMode): string {
  return mode === 'third-person' ? '3.ª Pessoa' : 'Inspeção';
}

function locomotionLabel(state: HudTelemetryState['characterLocomotion']): string {
  switch (state) {
    case 'walk':
      return 'A caminhar';
    case 'run':
      return 'A correr';
    case 'interact':
      return 'Interação';
    case 'seated':
      return 'Sentado';
    default:
      return 'Repouso';
  }
}

export function HudOverlay({
  telemetry,
  onToggleMute,
  onTogglePause,
  onOpenArchitecture,
  onToggleCameraMode,
  onSelectQuality,
  onSelectTimeOfDay,
  onSelectLayerFilter,
  onJumpPreset,
  onClearSelection,
  onToggleTouchControls,
  onStickMove,
  onSprintChange,
  onResetCamera,
}: HudOverlayProps) {
  const [dockExpanded, setDockExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight >= 520 : true,
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerHeight < 520) {
        setDockExpanded(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* Top HUD Row: Flex layout prevents any overlap between street readout and utility buttons */}
      <div className="fixed top-3 inset-x-3 sm:top-4 sm:inset-x-4 flex items-start justify-between gap-2.5">
        <div className="pointer-events-auto min-w-0 max-w-[66vw] sm:max-w-xl rounded-xl bg-[#0e1116]/88 border border-white/12 px-3 py-2 shadow-lg">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-100 whitespace-nowrap truncate">
            <span>ANGOLA VIRTUAL</span>
            <span aria-hidden="true" className="text-amber-400">·</span>
            <span className="truncate">Prenda UV n.º 1</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-slate-300">
            <span className="inline-flex items-center gap-1 text-emerald-300 truncate max-w-[165px] sm:max-w-[265px]">
              <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{telemetry.nearestStreetLabel}</span>
            </span>
            <span aria-hidden="true" className="hidden sm:inline">·</span>
            <span className="text-sky-300 font-sans">
              {locomotionLabel(telemetry.characterLocomotion)}
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-amber-300">{telemetry.metrics.fps} FPS</span>
            <span aria-hidden="true" className="hidden md:inline">·</span>
            <span className="hidden md:inline">{telemetry.metrics.drawCalls} draws</span>
          </div>
        </div>

        <div className="pointer-events-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            aria-label={`Alternar modo de câmara [V] (atual: ${cameraModeLabel(telemetry.cameraMode)})`}
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleCameraMode();
            }}
            className="min-h-[44px] px-2.5 sm:px-3 rounded-xl bg-[#0e1116]/88 border border-white/12 text-slate-100 hover:bg-slate-800 inline-flex items-center gap-1.5 shadow-lg cursor-pointer text-xs font-medium"
          >
            {telemetry.cameraMode === 'third-person' ? (
              <Compass className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
            ) : (
              <Eye className="w-4 h-4 text-emerald-300 shrink-0" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{cameraModeLabel(telemetry.cameraMode)}</span>
          </button>

          <button
            type="button"
            aria-label={telemetry.muted ? 'Ativar som [M]' : 'Silenciar som [M]'}
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0e1116]/88 border border-white/12 text-slate-100 hover:bg-slate-800 flex items-center justify-center shadow-lg cursor-pointer"
          >
            {telemetry.muted ? (
              <VolumeX className="w-4 h-4 text-slate-400" aria-hidden="true" />
            ) : (
              <Volume2 className="w-4 h-4 text-amber-400" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            aria-label="Inspecionar cartografia e módulos [I]"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenArchitecture();
            }}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0e1116]/88 border border-white/12 text-slate-100 hover:bg-slate-800 flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Layers className="w-4 h-4 text-amber-400" aria-hidden="true" />
          </button>

          <button
            type="button"
            aria-label="Pausar sessão [P]"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-[#0e1116]/88 border border-white/12 text-slate-100 hover:bg-slate-800 flex items-center justify-center shadow-lg cursor-pointer"
          >
            <Pause className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Selected Building / Urban Element Inspection Card */}
      {telemetry.selectedFeature && !telemetry.contextLost && (
        <aside
          aria-label="Ficha do edifício selecionado"
          className="pointer-events-auto fixed top-20 right-3 sm:right-4 z-20 w-[calc(100vw-24px)] max-w-xs sm:max-w-sm rounded-xl bg-[#0e1116]/92 border border-amber-400/35 p-3.5 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-amber-300">
                {telemetry.selectedFeature.title}
              </h3>
              <p className="text-[11px] font-medium text-slate-200">
                {telemetry.selectedFeature.subtitle}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar ficha do edifício"
              onClick={onClearSelection}
              className="min-h-[32px] min-w-[32px] rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-emerald-300 font-medium">
            {telemetry.selectedFeature.eraLabel}
          </p>
          <p className="mt-1 text-[11px] text-slate-300 leading-relaxed">
            {telemetry.selectedFeature.details}
          </p>
          <div className="mt-2 pt-2 border-t border-white/10 space-y-0.5 text-[10px] font-mono-tabular text-slate-400">
            <div>{telemetry.selectedFeature.utm33sLabel}</div>
            <div>{telemetry.selectedFeature.wgs84Label}</div>
            <div className="text-amber-200/90 font-sans">
              {telemetry.selectedFeature.confirmationStatus}
            </div>
          </div>
        </aside>
      )}

      {/* Non-blocking Portrait Orientation Advisory positioned safely above touch thumb zone */}
      <div className="hidden max-[640px]:portrait:flex pointer-events-none fixed bottom-36 inset-x-4 justify-center z-20">
        <div className="rounded-lg bg-[#0e1116]/90 border border-amber-400/30 px-3 py-1.5 text-[11px] text-amber-200 inline-flex items-center gap-2 shadow-md">
          <RotateCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Recomendado rodar o telemóvel para orientação horizontal.</span>
        </div>
      </div>

      {/* WebGL Context Lost Recovery Banner */}
      {telemetry.contextLost && (
        <div className="pointer-events-auto fixed inset-x-4 top-1/2 -translate-y-1/2 mx-auto max-w-md rounded-2xl bg-[#0e1116]/95 border border-red-500/40 p-5 text-center shadow-2xl">
          <p className="text-sm font-semibold text-red-300">
            Contexto WebGL temporariamente suspenso
          </p>
          <p className="mt-1 text-xs text-slate-300">
            A aguardar recuperação da GPU do dispositivo...
          </p>
        </div>
      )}

      {/* Collapsible Bottom Calibration, Layer & View Dock (Zero Center Occlusion) */}
      <div className="pointer-events-auto fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[56vw] sm:max-w-[74vw] max-[640px]:hidden sm:flex">
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            setDockExpanded((prev) => !prev);
          }}
          className="px-3 py-1.5 rounded-xl bg-[#0e1116]/90 border border-white/12 text-[11px] font-medium text-slate-200 hover:text-white inline-flex items-center gap-1.5 cursor-pointer shadow-md whitespace-nowrap"
        >
          {dockExpanded ? (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              Ocultar Controlos
            </>
          ) : (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              Calibração, Camadas e Vistas
            </>
          )}
        </button>

        {dockExpanded && (
          <div className="mt-1.5 rounded-2xl bg-[#0e1116]/92 border border-white/12 px-2.5 py-2 shadow-xl flex flex-wrap items-center justify-center gap-2">
            {/* Android Quality Tier Selector */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl" role="group" aria-label="Perfil gráfico Android">
              {QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectQuality(opt.id);
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    telemetry.qualityTier === opt.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Luanda Time of Day Selector */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl" role="group" aria-label="Iluminação de Luanda">
              {TIME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectTimeOfDay(opt.id);
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    telemetry.timeOfDay === opt.id
                      ? 'bg-slate-100 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Historical 1965 vs Contemporary Layer Filter */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl" role="group" aria-label="Camada urbana">
              {LAYER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onSelectLayerFilter(opt.id);
                  }}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    telemetry.layerFilter === opt.id
                      ? 'bg-emerald-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Quick-Jump Camera Views across Prenda UV1 */}
            <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl" role="group" aria-label="Vistas rápidas da UV n.º 1">
              {CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onJumpPreset(preset.id);
                  }}
                  className="min-h-[34px] px-2 py-1 rounded-lg text-[11px] font-medium text-slate-200 hover:bg-slate-800 hover:text-amber-300 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Touch Controls Toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleTouchControls();
              }}
              aria-pressed={telemetry.touchControlsVisible}
              className={`min-h-[34px] px-3 py-1 rounded-xl text-[11px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer border transition-colors ${
                telemetry.touchControlsVisible
                  ? 'bg-slate-800 border-amber-400/40 text-amber-300'
                  : 'bg-slate-900/90 border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
              Joystick
            </button>
          </div>
        )}
      </div>

      {/* Android Touch Controls */}
      {telemetry.touchControlsVisible && (
        <TouchControls
          onStickMove={onStickMove}
          onSprintChange={onSprintChange}
          onResetCamera={onResetCamera}
        />
      )}
    </div>
  );
}
