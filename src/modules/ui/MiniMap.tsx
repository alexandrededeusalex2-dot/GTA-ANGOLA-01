/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { PrendaRoadSegment } from '../world/PrendaCartography';

export const MINIMAP_SIZE_PX = 140;
export const MINIMAP_UPDATE_INTERVAL_MS = 100; // 10x per second

export interface MiniMapBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Square North-up bounds framing UV n.º 1 core: Centro UV1 (-4, 12), Mercado UV1 (338.8, -11.8),
 * and the surrounding V3-V6 Prenda street network with clean margins.
 */
export const DEFAULT_MINIMAP_BOUNDS: MiniMapBounds = {
  minX: -145,
  maxX: 425,
  minZ: -285,
  maxZ: 285,
};

export interface MiniMapPose {
  x: number;
  z: number;
  yaw: number;
}

interface MiniMapProps {
  readonly roads: readonly PrendaRoadSegment[];
  readonly mercadoPos: { readonly x: number; readonly z: number };
  readonly centroPos: { readonly x: number; readonly z: number };
  readonly poseRef: { readonly current: MiniMapPose };
  readonly kwanzaBalance: number;
}

/**
 * Projects Three.js world XZ (+X East, -Z North) onto Canvas 2D pixels (North fixed UP).
 */
export function projectWorldToMiniMap(
  x: number,
  z: number,
  sizePx = MINIMAP_SIZE_PX,
  bounds: MiniMapBounds = DEFAULT_MINIMAP_BOUNDS,
): { readonly px: number; readonly py: number } {
  const spanX = bounds.maxX - bounds.minX;
  const spanZ = bounds.maxZ - bounds.minZ;
  const px = ((x - bounds.minX) / spanX) * sizePx;
  // North = -Z is top (py = 0); South = +Z is bottom (py = sizePx)
  const py = ((z - bounds.minZ) / spanZ) * sizePx;
  return { px, py };
}

/**
 * Converts Three.js yaw (0 = +Z South, PI/2 = +X East, PI = -Z North)
 * into Canvas 2D rotation radians where 0 points UP (North) and +PI/2 points RIGHT (East).
 */
export function computeMiniMapArrowAngleRad(yaw: number): number {
  return Math.PI - yaw;
}

/**
 * Lightweight 140x140 top-right Canvas 2D mini-map updating at 10 Hz (no new images).
 * North fixed UP (GTA SA style); draws V3-V6 gray roads, yellow Mercado square,
 * green Centro UV1 square, white rotating player/vehicle arrow, and Kz balance below.
 */
export function MiniMap({
  roads,
  mercadoPos,
  centroPos,
  poseRef,
  kwanzaBalance,
}: MiniMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawMiniMap = () => {
      const size = MINIMAP_SIZE_PX;
      ctx.clearRect(0, 0, size, size);

      // Map background
      ctx.fillStyle = '#0b0e14';
      ctx.fillRect(0, 0, size, size);

      // Subtle inner border grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, size - 1, size - 1);

      // 1. V3-V6 roads (gray lines)
      for (const road of roads) {
        if (road.points.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < road.points.length; i++) {
          const { px, py } = projectWorldToMiniMap(
            road.points[i].x,
            road.points[i].z,
            size,
          );
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        const isPrimary = road.system7v === 'V3' || road.system7v === 'V4';
        ctx.strokeStyle = isPrimary ? '#94a3b8' : '#64748b';
        ctx.lineWidth = isPrimary ? 2.4 : 1.4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      // 2. Mercado (yellow square)
      const mercadoPt = projectWorldToMiniMap(mercadoPos.x, mercadoPos.z, size);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(mercadoPt.px - 4.5, mercadoPt.py - 4.5, 9, 9);
      ctx.strokeStyle = '#0e1116';
      ctx.lineWidth = 1;
      ctx.strokeRect(mercadoPt.px - 4.5, mercadoPt.py - 4.5, 9, 9);

      // 3. Centro UV1 (green square)
      const centroPt = projectWorldToMiniMap(centroPos.x, centroPos.z, size);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(centroPt.px - 4.5, centroPt.py - 4.5, 9, 9);
      ctx.strokeStyle = '#0e1116';
      ctx.lineWidth = 1;
      ctx.strokeRect(centroPt.px - 4.5, centroPt.py - 4.5, 9, 9);

      // 4. Player / Vehicle (white arrow rotating with rotationY)
      const pose = poseRef.current;
      const playerPt = projectWorldToMiniMap(pose.x, pose.z, size);
      const clampedPx = Math.max(8, Math.min(size - 8, playerPt.px));
      const clampedPy = Math.max(8, Math.min(size - 8, playerPt.py));

      ctx.save();
      ctx.translate(clampedPx, clampedPy);
      ctx.rotate(computeMiniMapArrowAngleRad(pose.yaw));
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5.5);
      ctx.lineTo(0, 3);
      ctx.lineTo(-5, 5.5);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#0e1116';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      // 5. Fixed North indicator at top-center
      ctx.fillStyle = 'rgba(14, 17, 22, 0.86)';
      ctx.fillRect(size * 0.5 - 7, 2, 14, 12);
      ctx.fillStyle = '#facc15';
      ctx.font = '700 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('N', size * 0.5, 8.5);
    };

    drawMiniMap();
    const timerId = window.setInterval(drawMiniMap, MINIMAP_UPDATE_INTERVAL_MS);
    return () => window.clearInterval(timerId);
  }, [roads, mercadoPos.x, mercadoPos.z, centroPos.x, centroPos.z, poseRef]);

  return (
    <div
      data-testid="minimap-container"
      className="pointer-events-auto flex flex-col items-end gap-1.5"
    >
      <div className="rounded-xl overflow-hidden border border-white/15 bg-[#0b0e14]/92 shadow-xl p-1">
        <canvas
          ref={canvasRef}
          width={MINIMAP_SIZE_PX}
          height={MINIMAP_SIZE_PX}
          data-testid="minimap-canvas"
          aria-label="Mini-mapa da UV n.º 1 do Prenda com Norte fixo em cima"
          className="block w-[140px] h-[140px] rounded-lg"
        />
      </div>
      <div
        data-testid="hud-kwanza-balance"
        className="rounded-lg bg-[#0e1116]/90 border border-emerald-400/30 px-2.5 py-1 text-xs font-mono-tabular font-semibold text-emerald-300 shadow-lg"
      >
        Kz: {kwanzaBalance}
      </div>
    </div>
  );
}
