/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import type { EventBus } from '../../core/EventBus';
import type {
  EngineEvents,
  EngineModule,
  ModuleDescriptor,
  QualityTier,
  TimeOfDayPreset,
  UrbanLayerFilter,
  UrbanSelectionInfo,
  Vector3Like,
} from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import { MaterialLibrary } from '../../resources/MaterialLibrary';
import { createPrendaMaterialPack, type PrendaPbrMaterialPack } from '../../resources/PrendaTextures';
import { buildPrendaBuildings, type PrendaBuildingsBuildResult } from './PrendaBuildingsBuilder';
import {
  buildingToSelectionInfo,
  findNearestStreetLabel,
  loadPrendaCartography,
  resolveBuildingCollision2D,
  type LocalPoint2D,
  type PrendaCartographyDataset,
} from './PrendaCartography';
import { buildPrendaTerrainAndRoads } from './PrendaTerrainAndRoadsBuilder';
import { buildPrendaUrbanProps, type PrendaUrbanPropsResult } from './PrendaUrbanPropsBuilder';
import { SectorManager } from './SectorManager';
import {
  groundHeightAt,
  LUANDA_TIME_PRESETS,
  PRENDA_UV1_PUBLISHED_DMS,
} from './luandaCoordinates';

const _surfaceRayOrigin = new THREE.Vector3();
const _surfaceRayDir = new THREE.Vector3(0, -1, 0);
const _surfaceRaycaster = new THREE.Raycaster(_surfaceRayOrigin, _surfaceRayDir, 0, 12);

export interface WorldZoneTarget {
  readonly id: string;
  readonly displayName: string;
  readonly district: string;
  readonly city: string;
  readonly georeferenced: boolean;
  readonly referenceCoordinateDms: string;
  readonly chunkSizeMeters: number;
}

export const INITIAL_WORLD_TARGET: WorldZoneTarget = {
  id: 'prenda-uv-1',
  displayName: 'Unidade de Vizinhança n.º 1',
  district: 'Bairro Prenda',
  city: 'Luanda',
  georeferenced: true,
  referenceCoordinateDms: PRENDA_UV1_PUBLISHED_DMS,
  chunkSizeMeters: 128,
};

/**
 * World Engine (Phase 2 — Unidade de Vizinhança n.º 1, Prenda, Luanda):
 * Builds and manages the explorable 3D urban terrain, 7V road network,
 * 22 modernist residential blocks + 12 civic/commercial OSM footprints,
 * contemporary street-commerce adaptations, and Sector/LOD manager.
 */
export class WorldEngine implements EngineModule {
  readonly descriptor: ModuleDescriptor = {
    id: 'world',
    index: 1,
    name: 'World Engine',
    responsibility:
      'Ambiente urbano 3D da UV n.º 1 do Prenda (Luanda) projetado em UTM 33S sobre OpenStreetMap real, sistema viário 7V, 22 blocos modernistas e ocupação contemporânea.',
    status: 'implemented',
    targetPhase: 'Fase 2 (Ambiente Urbano Prenda UV n.º 1) + Fase 3 (GLB/Rapier 3D)',
    dependencies: ['AssetManager', 'MaterialLibrary', 'EventBus', 'SectorManager'],
    pendingTasks: [
      'Confirmar número exato de pisos e tipologia individual (A/A2/A3/B1/D1/D2/16P) em cada bloco residencial.',
      'Substituir volumetrias procedurais por ativos GLB/GLTF individuais quando houver levantamento fotogramétrico.',
      'Ativar colisores físicos Rapier 3D para veículos e personagens.',
    ],
  };

  readonly scene: THREE.Scene;
  readonly materialLibrary: MaterialLibrary;
  readonly worldStageRoot = new THREE.Group();

  private sky: Sky | null = null;
  private sunLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private sunDir = new THREE.Vector3(0.7, 0.5, 0.5).normalize();

  private currentTimeOfDay: TimeOfDayPreset = 'morning';
  private dataset: PrendaCartographyDataset | null = null;
  private materialPack: PrendaPbrMaterialPack | null = null;
  private buildingsBuild: PrendaBuildingsBuildResult | null = null;
  private propsBuild: PrendaUrbanPropsResult | null = null;
  private walkableSurfaces: THREE.Mesh[] = [];
  private sectorManager: SectorManager | null = null;
  private nearestStreetLabel = 'Prenda · Núcleo UV n.º 1';

  private unsubTime?: () => void;

  constructor(
    private readonly assetManager: AssetManager,
    private readonly eventBus: EventBus<EngineEvents>,
  ) {
    this.scene = new THREE.Scene();
    this.materialLibrary = new MaterialLibrary();
    this.worldStageRoot.name = 'AngolaVirtualWorldStageRoot';
  }

  init(): void {
    this.setupSkyAndFog();
    this.setupLightingRig();

    this.dataset = loadPrendaCartography();
    this.materialPack = createPrendaMaterialPack(this.assetManager, this.materialLibrary);

    const terrainAndRoads = buildPrendaTerrainAndRoads(this.dataset, this.materialPack);
    this.walkableSurfaces = [...terrainAndRoads.walkableSurfaceMeshes];
    this.buildingsBuild = buildPrendaBuildings(this.dataset, this.materialPack);
    this.propsBuild = buildPrendaUrbanProps(this.dataset, this.materialPack);

    this.worldStageRoot.add(terrainAndRoads.group);
    this.worldStageRoot.add(this.buildingsBuild.group);
    this.worldStageRoot.add(this.propsBuild.group);
    this.scene.add(this.worldStageRoot);
    this.worldStageRoot.updateMatrixWorld(true);

    this.sectorManager = new SectorManager(
      {
        historicalGroup: this.buildingsBuild.historicalGroup,
        contemporaryAdaptationsGroup: this.buildingsBuild.contemporaryAdaptationsGroup,
        contemporaryPropsGroup: this.propsBuild.contemporaryPropsGroup,
        fineDetailGroup: this.propsBuild.fineDetailGroup,
        worldStageRoot: this.worldStageRoot,
      },
      INITIAL_WORLD_TARGET.chunkSizeMeters,
    );

    this.applyTimeOfDay(this.currentTimeOfDay);
    this.nearestStreetLabel = findNearestStreetLabel(0, 0, this.dataset.roads);

    this.unsubTime = this.eventBus.on('world:timeChanged', ({ preset }) => {
      this.applyTimeOfDay(preset);
    });
  }

  /**
   * Mount point preserved for future GLTF/GLB world assets.
   */
  mountWorldAsset(assetGroup: THREE.Object3D): void {
    this.worldStageRoot.add(assetGroup);
  }

  private setupSkyAndFog(): void {
    this.sky = new Sky();
    this.sky.scale.setScalar(4500);
    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = 6.2;
    uniforms.rayleigh.value = 2.0;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);

    this.scene.fog = new THREE.FogExp2(0xc9dbe6, 0.00145);
  }

  private setupLightingRig(): void {
    this.sunLight = new THREE.DirectionalLight(0xffdfb8, 2.35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 95;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 320;
    this.sunLight.shadow.bias = -0.0006;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.hemiLight = new THREE.HemisphereLight(0x9ac6e8, 0x5c4332, 0.95);
    this.hemiLight.position.set(0, 80, 0);
    this.scene.add(this.hemiLight);

    this.rimLight = new THREE.DirectionalLight(0x8ecae6, 0.45);
    this.rimLight.position.set(-80, 45, -75);
    this.scene.add(this.rimLight);
  }

  applyTimeOfDay(preset: TimeOfDayPreset): void {
    this.currentTimeOfDay = preset;
    const cfg = LUANDA_TIME_PRESETS[preset];

    const phi = THREE.MathUtils.degToRad(90 - cfg.elevationDeg);
    const theta = THREE.MathUtils.degToRad(cfg.azimuthDeg);
    this.sunDir.setFromSphericalCoords(1, phi, theta).normalize();

    if (this.sky) {
      this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    }
    if (this.sunLight) {
      const target = this.sunLight.target.position;
      this.sunLight.position.copy(target).addScaledVector(this.sunDir, 150);
      this.sunLight.color.setHex(cfg.keyLightColorHex);
      this.sunLight.intensity = cfg.keyLightIntensity;
    }
    if (this.hemiLight) {
      this.hemiLight.color.setHex(cfg.hemisphereSkyHex);
      this.hemiLight.groundColor.setHex(cfg.hemisphereGroundHex);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(cfg.fogColorHex);
    }
  }

  setShadowEnabled(enabled: boolean, mapSize: number): void {
    if (!this.sunLight) return;
    this.sunLight.castShadow = enabled;
    if (
      this.sunLight.shadow.mapSize.width !== mapSize ||
      this.sunLight.shadow.mapSize.height !== mapSize
    ) {
      this.sunLight.shadow.mapSize.set(mapSize, mapSize);
      this.sunLight.shadow.map?.dispose();
      this.sunLight.shadow.map = null;
    }
  }

  setQualityTier(tier: QualityTier): void {
    this.sectorManager?.setQualityTier(tier);
  }

  setLayerFilter(filter: UrbanLayerFilter): void {
    this.sectorManager?.setLayerFilter(filter);
  }

  getLayerFilter(): UrbanLayerFilter {
    return this.sectorManager?.getLayerFilter() ?? 'all';
  }

  resolveExplorerCollision(x: number, z: number, radius = 0.9): LocalPoint2D {
    if (!this.dataset) return { x, z };
    return resolveBuildingCollision2D(x, z, radius, this.dataset.buildings);
  }

  sampleGroundHeight(x: number, z: number): number {
    const baseY = groundHeightAt(x, z);
    if (this.walkableSurfaces.length === 0) return baseY;
    _surfaceRayOrigin.set(x, baseY + 4.5, z);
    _surfaceRaycaster.set(_surfaceRayOrigin, _surfaceRayDir);
    const hits = _surfaceRaycaster.intersectObjects(this.walkableSurfaces, false);
    if (hits.length > 0) {
      return hits[0].point.y;
    }
    return baseY;
  }

  pickBuildingByRaycaster(raycaster: THREE.Raycaster): UrbanSelectionInfo | null {
    if (!this.buildingsBuild) return null;
    const hits = raycaster.intersectObjects([...this.buildingsBuild.interactableMeshes], false);
    if (hits.length === 0) return null;
    const buildingId = hits[0].object.userData.buildingId as string | undefined;
    if (!buildingId) return null;
    const record = this.buildingsBuild.buildingMap.get(buildingId);
    return record ? buildingToSelectionInfo(record) : null;
  }

  getInteractableMeshes(): readonly THREE.Mesh[] {
    return this.buildingsBuild?.interactableMeshes ?? [];
  }

  updateFocusPosition(pos: Vector3Like): string {
    const chunkKey = this.sectorManager?.updateFocus(pos) ?? 'chunk_0_0';

    if (this.dataset) {
      this.nearestStreetLabel = findNearestStreetLabel(pos.x, pos.z, this.dataset.roads);
    }

    // Keep shadow frustum centered near explorer position without shifting every pixel (snap to 4m grid)
    if (this.sunLight) {
      const sx = Math.round(pos.x / 4) * 4;
      const sz = Math.round(pos.z / 4) * 4;
      this.sunLight.target.position.set(sx, 0, sz);
      this.sunLight.position.set(sx, 0, sz).addScaledVector(this.sunDir, 150);
    }

    return chunkKey;
  }

  getNearestStreetLabel(): string {
    return this.nearestStreetLabel;
  }

  getActiveChunkKey(): string {
    return this.sectorManager?.getActiveChunkKey() ?? 'chunk_0_0';
  }

  getTimeOfDay(): TimeOfDayPreset {
    return this.currentTimeOfDay;
  }

  getCartographyStats() {
    return {
      dataset: this.dataset?.stats ?? null,
      props: this.propsBuild?.propsSummary ?? null,
    };
  }

  update(_dt: number): void {
    // Phase 2 urban stage updates are driven by focus updates and sector visibility.
  }

  dispose(): void {
    this.unsubTime?.();
    this.assetManager.disposeObject3D(this.worldStageRoot);
    this.materialLibrary.dispose();
    if (this.sky) {
      this.sky.geometry.dispose();
      this.sky.material.dispose();
    }
    this.scene.clear();
  }
}
