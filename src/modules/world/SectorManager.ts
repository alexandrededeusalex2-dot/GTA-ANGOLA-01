/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { QualityTier, UrbanLayerFilter, Vector3Like } from '../../core/types';
import { getChunkKey } from './luandaCoordinates';

export interface SectorManagedGroups {
  readonly historicalGroup: THREE.Group;
  readonly contemporaryAdaptationsGroup: THREE.Group;
  readonly contemporaryPropsGroup: THREE.Group;
  readonly fineDetailGroup: THREE.Group;
  readonly worldStageRoot: THREE.Group;
}

/**
 * Sector & LOD Manager (128m grid around Prenda UV n.º 1).
 * Controls Android quality LOD visibility, layer filtering (1965 base vs contemporary occupation),
 * and active chunk tracking without frame-rate GC allocations.
 */
export class SectorManager {
  private activeChunkKey = 'chunk_0_0';
  private layerFilter: UrbanLayerFilter = 'all';
  private qualityTier: QualityTier = 'medium';

  constructor(
    private readonly groups: SectorManagedGroups,
    private readonly chunkSizeMeters = 128,
  ) {}

  updateFocus(position: Vector3Like): string {
    this.activeChunkKey = getChunkKey(position, this.chunkSizeMeters);
    return this.activeChunkKey;
  }

  getActiveChunkKey(): string {
    return this.activeChunkKey;
  }

  getLayerFilter(): UrbanLayerFilter {
    return this.layerFilter;
  }

  setLayerFilter(filter: UrbanLayerFilter): void {
    this.layerFilter = filter;
    this.applyVisibility();
  }

  setQualityTier(tier: QualityTier): void {
    this.qualityTier = tier;
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const showHistorical = this.layerFilter === 'all' || this.layerFilter === 'historical';
    const showContemporary = this.layerFilter === 'all' || this.layerFilter === 'contemporary';

    this.groups.historicalGroup.visible = showHistorical;
    this.groups.contemporaryAdaptationsGroup.visible = showContemporary;
    this.groups.contemporaryPropsGroup.visible = showContemporary;

    // On low Android tier, hide small streetlight clusters to preserve 30+ FPS headroom
    this.groups.fineDetailGroup.visible = this.qualityTier !== 'low';
  }
}
