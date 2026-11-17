/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PerformanceMetricsSnapshot,
  QualityProfileConfig,
  QualityTier,
} from './types';

export const ANDROID_QUALITY_PROFILES: Record<QualityTier, QualityProfileConfig> = {
  low: {
    tier: 'low',
    label: 'Poupança Android',
    maxPixelRatio: 1.0,
    shadowsEnabled: false,
    shadowMapSize: 512,
    anisotropy: 2,
    antialias: false,
    maxDrawCallsBudget: 60,
    maxTextureMemoryMB: 64,
  },
  medium: {
    tier: 'medium',
    label: 'Equilibrado',
    maxPixelRatio: 1.5,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    anisotropy: 4,
    antialias: true,
    maxDrawCallsBudget: 120,
    maxTextureMemoryMB: 128,
  },
  high: {
    tier: 'high',
    label: 'Alta Fidelidade',
    maxPixelRatio: 2.0,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    anisotropy: 8,
    antialias: true,
    maxDrawCallsBudget: 200,
    maxTextureMemoryMB: 256,
  },
};

export interface RendererStatsInput {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
}

/**
 * Pure telemetry and adaptive quality evaluator designed for constrained
 * Android mobile GPUs and WebGL budgets.
 */
export class PerformanceMonitor {
  private frameTimesMs: number[] = [];
  private readonly maxSamples: number;

  constructor(maxSamples = 45) {
    this.maxSamples = maxSamples;
  }

  recordFrame(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const clampedMs = Math.min(deltaSeconds * 1000, 250);
    this.frameTimesMs.push(clampedMs);
    if (this.frameTimesMs.length > this.maxSamples) {
      this.frameTimesMs.shift();
    }
  }

  getAverageFrameTimeMs(): number {
    if (this.frameTimesMs.length === 0) return 16.67;
    const sum = this.frameTimesMs.reduce((acc, v) => acc + v, 0);
    return sum / this.frameTimesMs.length;
  }

  getEstimatedFps(): number {
    const avgMs = this.getAverageFrameTimeMs();
    if (avgMs <= 0) return 60;
    return Math.min(120, Math.round(1000 / avgMs));
  }

  recommendQualityTier(
    currentTier: QualityTier,
    isSoftwareGl: boolean,
  ): QualityTier {
    if (isSoftwareGl) return 'low';
    if (this.frameTimesMs.length < 15) return currentTier;

    const fps = this.getEstimatedFps();
    if (fps < 26) return 'low';
    if (fps < 44 && currentTier === 'high') return 'medium';
    if (fps >= 55 && currentTier === 'low') return 'medium';
    return currentTier;
  }

  buildSnapshot(
    rendererStats: RendererStatsInput,
    currentTier: QualityTier,
    isSoftwareGl: boolean,
    estimatedHeapMB: number | null = null,
  ): PerformanceMetricsSnapshot {
    const avgMs = this.getAverageFrameTimeMs();
    const fps = this.getEstimatedFps();
    return {
      fps,
      frameTimeMs: Math.round(avgMs * 10) / 10,
      drawCalls: rendererStats.drawCalls,
      triangles: rendererStats.triangles,
      geometries: rendererStats.geometries,
      textures: rendererStats.textures,
      estimatedHeapMB,
      isSoftwareGl,
      recommendedTier: this.recommendQualityTier(currentTier, isSoftwareGl),
    };
  }

  reset(): void {
    this.frameTimesMs = [];
  }
}
