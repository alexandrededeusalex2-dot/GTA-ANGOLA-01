/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import type { ModuleDescriptor } from './core/types';
import { AngolaVirtualEngine, type HudTelemetryState } from './engine/AngolaVirtualEngine';
import { ArchitectureDrawer } from './modules/ui/ArchitectureDrawer';
import { HudOverlay } from './modules/ui/HudOverlay';
import { PauseModal } from './modules/ui/PauseModal';
import { TitleScreen } from './modules/ui/TitleScreen';

const INITIAL_TELEMETRY: HudTelemetryState = {
  gameState: 'title',
  qualityTier: 'medium',
  timeOfDay: 'morning',
  cameraMode: 'third-person',
  layerFilter: 'all',
  muted: false,
  touchControlsVisible: true,
  activeChunkKey: 'chunk_0_0',
  nearestStreetLabel: 'Prenda · Núcleo UV n.º 1',
  worldTargetLabel: 'Luanda · Prenda UV n.º 1 (08°50\'10" S, 13°13\'26" E)',
  geographicalStatus:
    'Ambiente urbano 3D ativo (OSM + UTM 33S; tipologias individuais HPIP por confirmar)',
  selectedFeature: null,
  metrics: {
    fps: 60,
    frameTimeMs: 16.7,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    estimatedHeapMB: null,
    isSoftwareGl: false,
    recommendedTier: 'medium',
  },
  saveBackend: 'memory',
  lastSavedIso: '',
  contextLost: false,
  characterLocomotion: 'idle',
  characterSpeedMps: 0,
  characterRigStatus: 'loading',
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AngolaVirtualEngine | null>(null);

  const [telemetry, setTelemetry] = useState<HudTelemetryState>(INITIAL_TELEMETRY);
  const [modules, setModules] = useState<ModuleDescriptor[]>([]);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  useEffect(() => {
    const mountEl = canvasMountRef.current;
    if (!mountEl) return;

    const engine = new AngolaVirtualEngine();
    engineRef.current = engine;
    setModules(engine.listModuleDescriptors());

    const params = new URLSearchParams(window.location.search);
    const autostart = params.get('autostart') === '1';

    void engine.mount(
      mountEl,
      (nextState) => setTelemetry(nextState),
      () => setInspectorOpen((prev) => !prev),
      autostart,
    );

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const cartographyStats = engineRef.current?.getCartographyStats() ?? {
    dataset: null,
    props: null,
  };

  return (
    <main className="relative h-full w-full overflow-hidden bg-[#0e1116]">
      {/* Dedicated WebGL Mount Container (never re-rendered on HUD state changes) */}
      <div ref={canvasMountRef} className="fixed inset-0 z-0" />

      {telemetry.gameState === 'title' && (
        <TitleScreen
          onStart={() => engineRef.current?.startSession()}
          onOpenArchitecture={() => setInspectorOpen(true)}
        />
      )}

      {telemetry.gameState === 'playing' && (
        <HudOverlay
          telemetry={telemetry}
          onToggleMute={() => engineRef.current?.toggleMute()}
          onTogglePause={() => engineRef.current?.togglePause()}
          onOpenArchitecture={() => setInspectorOpen(true)}
          onToggleCameraMode={() => engineRef.current?.toggleCameraMode()}
          onSelectQuality={(tier) => engineRef.current?.setQualityTier(tier)}
          onSelectTimeOfDay={(preset) => engineRef.current?.setTimeOfDay(preset)}
          onSelectLayerFilter={(filter) => engineRef.current?.setLayerFilter(filter)}
          onJumpPreset={(preset) => engineRef.current?.jumpToPreset(preset)}
          onClearSelection={() => engineRef.current?.clearSelection()}
          onToggleTouchControls={() => engineRef.current?.toggleTouchControls()}
          onStickMove={(x, y) => engineRef.current?.inputManager.setTouchStick(x, y)}
          onSprintChange={(active) => engineRef.current?.inputManager.setTouchSprint(active)}
          onResetCamera={() => engineRef.current?.resetCamera()}
        />
      )}

      {telemetry.gameState === 'paused' && (
        <PauseModal
          telemetry={telemetry}
          onResume={() => engineRef.current?.togglePause()}
          onResetCamera={() => engineRef.current?.resetCamera()}
          onOpenArchitecture={() => setInspectorOpen(true)}
          onReturnToTitle={() => engineRef.current?.returnToTitle()}
        />
      )}

      <ArchitectureDrawer
        open={inspectorOpen}
        modules={modules}
        telemetry={telemetry}
        cartographyStats={cartographyStats}
        onClose={() => setInspectorOpen(false)}
        onSelectQuality={(tier) => engineRef.current?.setQualityTier(tier)}
        onSelectTimeOfDay={(preset) => engineRef.current?.setTimeOfDay(preset)}
        onSelectLayerFilter={(filter) => engineRef.current?.setLayerFilter(filter)}
      />
    </main>
  );
}
