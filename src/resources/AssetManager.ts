/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export interface AssetLoadProgress {
  readonly url: string;
  readonly loaded: number;
  readonly total: number;
}

export interface ManagedAssetEntry {
  readonly key: string;
  readonly kind: 'gltf' | 'texture' | 'json' | 'procedural';
  readonly refCount: number;
}

/**
 * Progressive resource manager for ANGOLA VIRTUAL.
 * Prepared for GLB/GLTF character, building, and vehicle streaming on Android
 * with strict GPU memory disposal, Meshopt decoding, and texture anisotropy controls.
 */
export class AssetManager {
  private readonly loadingManager: THREE.LoadingManager;
  private readonly gltfLoader: GLTFLoader;
  private readonly textureLoader: THREE.TextureLoader;
  private readonly gltfCache = new Map<string, { asset: GLTF; refs: number }>();
  private readonly textureCache = new Map<string, { texture: THREE.Texture; refs: number }>();
  private readonly jsonCache = new Map<string, { data: unknown; refs: number }>();
  private maxAnisotropy = 2;

  onProgress?: (progress: AssetLoadProgress) => void;
  onError?: (url: string) => void;

  constructor() {
    this.loadingManager = new THREE.LoadingManager();
    this.loadingManager.onProgress = (url, loaded, total) => {
      this.onProgress?.({ url, loaded, total });
    };
    this.loadingManager.onError = (url) => {
      this.onError?.(url);
    };

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
  }

  setAnisotropyLimit(limit: number): void {
    this.maxAnisotropy = Math.max(1, limit);
    for (const entry of this.textureCache.values()) {
      entry.texture.anisotropy = this.maxAnisotropy;
      entry.texture.needsUpdate = true;
    }
  }

  registerProceduralTexture(key: string, texture: THREE.Texture, isColorMap = true): THREE.Texture {
    if (isColorMap) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.anisotropy = this.maxAnisotropy;
    texture.needsUpdate = true;
    this.textureCache.set(key, { texture, refs: 1 });
    return texture;
  }

  async loadGltfModel(key: string, url: string): Promise<GLTF> {
    const existing = this.gltfCache.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.asset;
    }

    await MeshoptDecoder.ready;
    const gltf = await this.gltfLoader.loadAsync(url);
    gltf.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        obj.frustumCulled = false;
      }
    });
    this.gltfCache.set(key, { asset: gltf, refs: 1 });
    return gltf;
  }

  async loadJson<T>(key: string, url: string): Promise<T> {
    const existing = this.jsonCache.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.data as T;
    }

    const response = await fetch(url);
    if (!response.ok) {
      this.onError?.(url);
      throw new Error(`Falha ao carregar recurso JSON (${response.status}): ${url}`);
    }
    const data = (await response.json()) as T;
    this.jsonCache.set(key, { data, refs: 1 });
    return data;
  }

  async loadTexture(key: string, url: string, isColorMap = true): Promise<THREE.Texture> {
    const existing = this.textureCache.get(key);
    if (existing) {
      existing.refs += 1;
      return existing.texture;
    }

    const texture = await this.textureLoader.loadAsync(url);
    if (isColorMap) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    texture.anisotropy = this.maxAnisotropy;
    this.textureCache.set(key, { texture, refs: 1 });
    return texture;
  }

  releaseTexture(key: string): void {
    const entry = this.textureCache.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      entry.texture.dispose();
      this.textureCache.delete(key);
    }
  }

  releaseGltf(key: string): void {
    const entry = this.gltfCache.get(key);
    if (!entry) return;
    entry.refs -= 1;
    if (entry.refs <= 0) {
      this.disposeObject3D(entry.asset.scene);
      this.gltfCache.delete(key);
    }
  }

  listManagedAssets(): ManagedAssetEntry[] {
    const entries: ManagedAssetEntry[] = [];
    for (const [key, value] of this.gltfCache.entries()) {
      entries.push({ key, kind: 'gltf', refCount: value.refs });
    }
    for (const [key, value] of this.textureCache.entries()) {
      entries.push({ key, kind: 'texture', refCount: value.refs });
    }
    for (const [key, value] of this.jsonCache.entries()) {
      entries.push({ key, kind: 'json', refCount: value.refs });
    }
    return entries;
  }

  disposeObject3D(root: THREE.Object3D): void {
    root.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        for (const mat of mesh.material) {
          this.disposeMaterialTextures(mat);
          mat.dispose();
        }
      } else if (mesh.material) {
        this.disposeMaterialTextures(mesh.material);
        mesh.material.dispose();
      }
    });
  }

  private disposeMaterialTextures(material: THREE.Material): void {
    const std = material as THREE.MeshStandardMaterial;
    std.map?.dispose();
    std.normalMap?.dispose();
    std.roughnessMap?.dispose();
    std.metalnessMap?.dispose();
    std.bumpMap?.dispose();
    std.aoMap?.dispose();
  }

  disposeAll(): void {
    for (const entry of this.textureCache.values()) {
      entry.texture.dispose();
    }
    this.textureCache.clear();

    for (const entry of this.gltfCache.values()) {
      this.disposeObject3D(entry.asset.scene);
    }
    this.gltfCache.clear();
    this.jsonCache.clear();
  }
}
