/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

/**
 * Shared PBR Material Library for ANGOLA VIRTUAL.
 * Prepared to register, share, and dispose physically-based materials
 * for Phase 2+ GLTF/GLB assets without generating geometric placeholders.
 */
export class MaterialLibrary {
  private readonly materials = new Map<string, THREE.Material>();

  registerMaterial<T extends THREE.Material>(key: string, material: T): T {
    const existing = this.materials.get(key);
    if (existing && existing !== material) {
      existing.dispose();
    }
    this.materials.set(key, material);
    return material;
  }

  getMaterial<T extends THREE.Material>(key: string): T | undefined {
    return this.materials.get(key) as T | undefined;
  }

  createStandardPbrMaterial(
    key: string,
    params: THREE.MeshStandardMaterialParameters,
  ): THREE.MeshStandardMaterial {
    const cached = this.materials.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial(params);
    this.materials.set(key, mat);
    return mat;
  }

  listMaterialKeys(): string[] {
    return [...this.materials.keys()];
  }

  dispose(): void {
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
  }
}
