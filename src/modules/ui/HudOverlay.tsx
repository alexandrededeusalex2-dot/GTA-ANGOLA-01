/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ChevronDown,
  ChevronUp,
  Clock,
  CloudRain,
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
import {
  CANTINA_MENU_ITEMS,
  NEED_SLEEP_MESSAGE,
  type CantinaMenuItemId,
} from '../gameplay/PlayerNeeds';
import {
  PRENDA_EXPRESS_HUD_TITLE,
  isMissionInProgress,
} from '../missions/MissionManager';
import {
  BARBEARIA_LOWFADE_LABEL,
  BOUTIQUE_SHIRT_OPTIONS,
  BOUTIQUE_TSHIRT_LABEL,
} from '../world/EstablishmentsManager';
import type { PrendaRoadSegment } from '../world/PrendaCartography';
import { MiniMap, type MiniMapPose } from './MiniMap';
import { TouchControls } from './TouchControls';

interface HudOverlayProps {
  readonly telemetry: HudTelemetryState;
  readonly miniMapRoads: readonly PrendaRoadSegment[];
  readonly miniMapMercadoPos: { readonly x: number; readonly z: number };
  readonly miniMapCentroPos: { readonly x: number; readonly z: number };
  readonly miniMapPoseRef: { readonly current: MiniMapPose };
  readonly onToggleMute: () => void;
  readonly onTogglePause: () => void;
  readonly onOpenArchitecture: () => void;
  readonly onToggleCameraMode: () => void;
  readonly onSelectQuality: (tier: QualityTier) => void;
  readonly onSelectTimeOfDay: (preset: TimeOfDayPreset) => void;
  readonly onCycleTimeSpeed: () => void;
  readonly onToggleRain: () => void;
  readonly onSelectLayerFilter: (filter: UrbanLayerFilter) => void;
  readonly onJumpPreset: (preset: PrendaCameraPresetId) => void;
  readonly onClearSelection: () => void;
  readonly onToggleTouchControls: () => void;
  readonly onStickMove: (x: number, y: number) => void;
  readonly onSprintChange: (active: boolean) => void;
  readonly onResetCamera: () => void;
  readonly onVehicleInteract: () => void;
  readonly onCancelMission: () => void;
  readonly onOpenNearbyShop: () => void;
  readonly onCloseShop: () => void;
  readonly onBuyCantinaItem: (id: CantinaMenuItemId) => void;
  readonly onBuyBoutiqueTshirt: (hex: string, label: string) => void;
  readonly onBuyBarbeariaLowFade: () => void;
  readonly onSleepAtHome: () => void;
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
  { id: 'night', label: 'Noite' },
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
  { id: 'paragem-mercado', label: 'Mercado UV1' },
  { id: 'vista-aerea', label: '7V Aérea' },
];

function cameraModeLabel(mode: ExplorerCameraMode): string {
  return mode === 'third-person' ? '3.ª Pessoa' : 'Inspeção';
}

function locomotionLabel(
  state: HudTelemetryState['characterLocomotion'],
  isDrivingVehicle: boolean,
): string {
  if (isDrivingVehicle) {
    return 'A conduzir - [E] sair';
  }
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
  miniMapRoads,
  miniMapMercadoPos,
  miniMapCentroPos,
  miniMapPoseRef,
  onToggleMute,
  onTogglePause,
  onOpenArchitecture,
  onToggleCameraMode,
  onSelectQuality,
  onSelectTimeOfDay,
  onCycleTimeSpeed,
  onToggleRain,
  onSelectLayerFilter,
  onJumpPreset,
  onClearSelection,
  onToggleTouchControls,
  onStickMove,
  onSprintChange,
  onResetCamera,
  onVehicleInteract,
  onCancelMission,
  onOpenNearbyShop,
  onCloseShop,
  onBuyCantinaItem,
  onBuyBoutiqueTshirt,
  onBuyBarbeariaLowFade,
  onSleepAtHome,
}: HudOverlayProps) {
  const [dockExpanded, setDockExpanded] = useState(() =>
    typeof window !== 'undefined' ? window.innerHeight >= 520 : true,
  );
  const missionActive = isMissionInProgress(telemetry.missionStatus);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerHeight < 520) {
        setDockExpanded(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (telemetry.isDrivingVehicle && typeof window !== 'undefined' && window.innerHeight < 520) {
      setDockExpanded(false);
    }
  }, [telemetry.isDrivingVehicle]);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {/* Night Fatigue Darkness Overlay when Energy === 0 */}
      {telemetry.needs.mustSleepHome && (
        <div
          data-testid="sleep-fatigue-overlay"
          className="fixed inset-0 z-10 bg-black/55 pointer-events-none flex items-center justify-center"
        >
          <div className="rounded-xl bg-[#0e1116]/95 border border-rose-400/55 px-5 py-3 text-center shadow-2xl">
            <p className="text-sm font-bold text-rose-300">{NEED_SLEEP_MESSAGE}</p>
            <p className="text-[11px] text-slate-300 mt-0.5">
              Aproxima-te da Casa do Mateus no Centro UV1 e carrega [E].
            </p>
          </div>
        </div>
      )}

      {/* Top HUD Row */}
      <div className="fixed top-3 inset-x-3 sm:top-4 sm:inset-x-4 flex items-start justify-between gap-2.5 z-20">
        <div className="pointer-events-none flex flex-col items-start gap-1.5 min-w-0 max-w-[66vw] sm:max-w-xl">
          <div className="pointer-events-auto w-full rounded-xl bg-[#0e1116]/88 border border-white/12 px-3 py-2 shadow-lg">
            <div className="flex items-center justify-between gap-2 text-xs sm:text-sm font-semibold text-slate-100 whitespace-nowrap">
              <div className="flex items-center gap-1.5 min-w-0 truncate">
                <span>ANGOLA VIRTUAL</span>
                <span aria-hidden="true" className="text-amber-400">·</span>
                <span className="truncate">Prenda UV n.º 1</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[11px] font-mono-tabular">
                <span
                  data-testid="hud-game-clock"
                  className="inline-flex items-center gap-1 text-amber-300"
                >
                  <Clock className="w-3 h-3" aria-hidden="true" />
                  {telemetry.gameClockLabel}
                </span>
                <button
                  type="button"
                  data-testid="hud-time-speed-btn"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onCycleTimeSpeed();
                  }}
                  className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-white/12 text-[10px] font-semibold text-slate-100 cursor-pointer"
                  title="Acelerar relógio do dia"
                >
                  {telemetry.timeSpeedMultiplier}x
                </button>
              </div>
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono-tabular text-slate-300">
              <span className="inline-flex items-center gap-1 text-emerald-300 truncate max-w-[155px] sm:max-w-[235px]">
                <MapPin className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{telemetry.nearestStreetLabel}</span>
              </span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span
                data-testid="hud-locomotion-status"
                className={telemetry.isDrivingVehicle ? 'text-amber-300 font-sans font-medium' : 'text-sky-300 font-sans'}
              >
                {locomotionLabel(telemetry.characterLocomotion, telemetry.isDrivingVehicle)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">{telemetry.metrics.fps} FPS</span>
              <span aria-hidden="true" className="hidden md:inline">·</span>
              <span className="hidden md:inline">{telemetry.metrics.drawCalls} draws</span>
            </div>

            {/* Necessidades (Fome, Sede, Energia) + Semáforo Centro */}
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] font-mono-tabular">
              <span
                data-testid="hud-hunger-meter"
                className={`px-1.5 py-0.5 rounded border ${
                  telemetry.needs.hungerBlinking
                    ? 'animate-pulse bg-rose-950/90 border-rose-400 text-rose-200 font-bold'
                    : 'bg-slate-900/90 border-white/10 text-amber-200'
                }`}
              >
                Fome {Math.round(telemetry.needs.hunger)}%
                {telemetry.needs.hungerBlinking ? ' (-30% vel)' : ''}
              </span>
              <span className="px-1.5 py-0.5 rounded bg-slate-900/90 border border-white/10 text-sky-200">
                Sede {Math.round(telemetry.needs.thirst)}%
              </span>
              <span
                data-testid="hud-energy-meter"
                className={`px-1.5 py-0.5 rounded border ${
                  telemetry.needs.mustSleepHome
                    ? 'animate-pulse bg-rose-950/90 border-rose-400 text-rose-200 font-bold'
                    : 'bg-slate-900/90 border-white/10 text-emerald-200'
                }`}
              >
                Energia {Math.round(telemetry.needs.energy)}%
              </span>
              <span
                data-testid="hud-traffic-light"
                className={`px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${
                  telemetry.trafficLightPhase === 'green'
                    ? 'bg-emerald-950/85 border-emerald-400/50 text-emerald-200'
                    : 'bg-rose-950/85 border-rose-400/50 text-rose-200'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    telemetry.trafficLightPhase === 'green' ? 'bg-emerald-400' : 'bg-rose-400'
                  }`}
                />
                Semáforo {telemetry.trafficLightPhase === 'green' ? 'Verde' : 'Vermelho'}
              </span>
              {telemetry.isRaining && (
                <span className="px-1.5 py-0.5 rounded bg-sky-950/85 border border-sky-400/50 text-sky-200 inline-flex items-center gap-1">
                  <CloudRain className="w-3 h-3" aria-hidden="true" />
                  Chuva
                </span>
              )}
            </div>
          </div>

          {missionActive && (
            <div
              data-testid="hud-mission-bar"
              className="pointer-events-auto rounded-xl bg-[#0e1116]/92 border border-amber-400/45 px-3 py-1.5 shadow-lg flex flex-wrap items-center gap-2 text-xs"
            >
              <span className="font-semibold text-amber-300 whitespace-nowrap">
                {PRENDA_EXPRESS_HUD_TITLE}
              </span>
              <span
                data-testid="hud-mission-distance"
                className="font-mono-tabular font-semibold text-slate-100"
              >
                {telemetry.missionDistanceMeters}m
              </span>
              <button
                type="button"
                data-testid="mission-cancel-btn"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onCancelMission();
                }}
                className="min-h-[30px] px-2.5 py-0.5 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-400/40 text-[11px] font-medium text-rose-200 cursor-pointer whitespace-nowrap"
              >
                Cancelar Missão [X]
              </button>
            </div>
          )}

          {telemetry.trafficFineBanner && (
            <div
              role="alert"
              data-testid="traffic-fine-banner"
              className="pointer-events-none rounded-xl bg-rose-950/95 border border-rose-400 px-3 py-1.5 text-xs font-bold text-rose-100 shadow-xl"
            >
              {telemetry.trafficFineBanner}
            </div>
          )}

          {telemetry.zungueiraCallout && (
            <div
              role="status"
              data-testid="zungueira-callout"
              className="pointer-events-none rounded-xl bg-amber-950/90 border border-amber-400/55 px-3 py-1 text-xs font-semibold text-amber-200 shadow-lg"
            >
              Zungueira: "{telemetry.zungueiraCallout}"
            </div>
          )}

          {telemetry.missionBanner && (
            <div
              role="status"
              data-testid="mission-banner"
              className={`pointer-events-none rounded-xl px-3 py-1.5 text-xs font-semibold shadow-xl border ${
                telemetry.missionStatus === 'completed'
                  ? 'bg-emerald-950/95 border-emerald-400/60 text-emerald-200'
                  : 'bg-[#161b24]/95 border-amber-400/60 text-amber-200'
              }`}
            >
              {telemetry.missionBanner}
            </div>
          )}
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

      {/* Top-Right Mini-Map (140x140 Canvas 2D @ 10Hz) + Kz Counter */}
      {!telemetry.contextLost && (
        <div className="fixed top-[62px] right-3 sm:top-[68px] sm:right-4 z-20">
          <MiniMap
            roads={miniMapRoads}
            mercadoPos={miniMapMercadoPos}
            centroPos={miniMapCentroPos}
            poseRef={miniMapPoseRef}
            kwanzaBalance={telemetry.kwanzaBalance}
          />
        </div>
      )}

      {/* Selected Building / Urban Element Inspection Card */}
      {telemetry.selectedFeature && !telemetry.contextLost && (
        <aside
          aria-label="Ficha do edifício selecionado"
          className="pointer-events-auto fixed top-[256px] sm:top-[68px] right-3 sm:right-[172px] z-20 w-[calc(100vw-24px)] max-w-xs sm:max-w-sm rounded-xl bg-[#0e1116]/92 border border-amber-400/35 p-3.5 shadow-2xl"
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

      {/* Interactive Prenda Establishment Menu (Cantina / Boutique / Barbearia / Casa) */}
      {telemetry.openEstablishmentKind && !telemetry.contextLost && (
        <aside
          data-testid="shop-menu-modal"
          aria-label="Menu do estabelecimento"
          className="pointer-events-auto fixed left-1/2 -translate-x-1/2 top-28 z-30 w-[calc(100vw-24px)] max-w-sm rounded-2xl bg-[#0e1116]/96 border border-amber-400/50 p-4 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/10">
            <div>
              <h3 className="text-sm font-bold text-amber-300">
                {telemetry.nearbyEstablishment?.name ?? 'Estabelecimento'}
              </h3>
              <p className="text-[11px] text-slate-300">
                {telemetry.nearbyEstablishment?.subtitle ?? ''}
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar menu do estabelecimento"
              onClick={onCloseShop}
              className="min-h-[34px] min-w-[34px] rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {telemetry.shopFeedback && (
            <div
              data-testid="shop-feedback"
              className="mt-2 rounded-lg bg-emerald-950/90 border border-emerald-400/40 px-2.5 py-1.5 text-xs text-emerald-200 font-medium"
            >
              {telemetry.shopFeedback}
            </div>
          )}

          {telemetry.openEstablishmentKind === 'cantina' && (
            <div className="mt-3 space-y-2">
              {CANTINA_MENU_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`cantina-buy-${item.id}`}
                  onClick={() => onBuyCantinaItem(item.id)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 flex items-center justify-between text-xs text-slate-100 cursor-pointer"
                >
                  <span className="font-medium">{item.label}</span>
                  <span className="font-mono-tabular font-semibold text-amber-300">
                    {item.priceKz} Kz
                  </span>
                </button>
              ))}
            </div>
          )}

          {telemetry.openEstablishmentKind === 'boutique' && (
            <div className="mt-3 space-y-2.5">
              <div className="text-xs font-semibold text-slate-200">{BOUTIQUE_TSHIRT_LABEL}</div>
              <div className="grid grid-cols-2 gap-2">
                {BOUTIQUE_SHIRT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    data-testid={`boutique-shirt-${opt.id}`}
                    onClick={() => onBuyBoutiqueTshirt(opt.hex, opt.label)}
                    className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 flex items-center gap-2 text-xs text-slate-100 cursor-pointer"
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 border border-white/30"
                      style={{ backgroundColor: opt.hex }}
                    />
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {telemetry.openEstablishmentKind === 'barbearia' && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                data-testid="barbearia-low-fade-btn"
                onClick={onBuyBarbeariaLowFade}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-rose-950/90 hover:bg-rose-900 border border-rose-400/50 flex items-center justify-between text-xs font-semibold text-rose-100 cursor-pointer"
              >
                <span>{BARBEARIA_LOWFADE_LABEL}</span>
                <span className="text-amber-300">Aplicar</span>
              </button>
            </div>
          )}

          {telemetry.openEstablishmentKind === 'casa' && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                data-testid="casa-sleep-btn"
                onClick={onSleepAtHome}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-emerald-950/90 hover:bg-emerald-900 border border-emerald-400/50 text-xs font-semibold text-emerald-100 cursor-pointer"
              >
                Dormir em Casa (Restaurar 100% Energia)
              </button>
            </div>
          )}
        </aside>
      )}

      {/* Non-blocking Portrait Orientation Advisory */}
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

      {/* Vehicle OR Establishment Proximity Prompt */}
      {(telemetry.vehicleFeedback || telemetry.vehiclePrompt || telemetry.nearbyEstablishment) &&
        !telemetry.contextLost && (
          <div
            className={`pointer-events-none fixed left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 bottom-16 ${
              dockExpanded ? 'sm:bottom-44' : 'sm:bottom-16'
            }`}
          >
            {telemetry.vehicleFeedback && (
              <div
                role="status"
                data-testid="vehicle-feedback"
                className="rounded-xl bg-[#161b24]/95 border border-amber-400/55 px-3.5 py-2 text-xs font-semibold text-amber-300 shadow-xl whitespace-nowrap"
              >
                {telemetry.vehicleFeedback}
              </div>
            )}
            {telemetry.vehiclePrompt && (
              <button
                type="button"
                data-testid="vehicle-enter-prompt"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onVehicleInteract();
                }}
                className="pointer-events-auto min-h-[40px] rounded-xl bg-[#0e1116]/94 border border-sky-400/55 px-4 py-2 text-xs font-semibold text-sky-100 hover:bg-slate-800 shadow-xl cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-sky-400" aria-hidden="true" />
                <span>{telemetry.vehiclePrompt}</span>
              </button>
            )}
            {!telemetry.vehiclePrompt && telemetry.nearbyEstablishment && (
              <button
                type="button"
                data-testid="shop-interact-prompt"
                tabIndex={-1}
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenNearbyShop();
                }}
                className="pointer-events-auto min-h-[40px] rounded-xl bg-[#0e1116]/94 border border-amber-400/60 px-4 py-2 text-xs font-semibold text-amber-100 hover:bg-slate-800 shadow-xl cursor-pointer inline-flex items-center gap-2 whitespace-nowrap"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-amber-400" aria-hidden="true" />
                <span>{telemetry.nearbyEstablishment.promptText}</span>
              </button>
            )}
          </div>
        )}

      {/* Collapsible Bottom Calibration, Layer & View Dock */}
      <div className="pointer-events-auto fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center max-w-[56vw] sm:max-w-[78vw] max-[640px]:hidden sm:flex">
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
              <button
                type="button"
                data-testid="rain-toggle-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onToggleRain();
                }}
                aria-pressed={telemetry.isRaining}
                className={`min-h-[34px] px-2.5 py-1 rounded-lg text-[11px] font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                  telemetry.isRaining
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <CloudRain className="w-3.5 h-3.5" aria-hidden="true" />
                Chuva
              </button>
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
