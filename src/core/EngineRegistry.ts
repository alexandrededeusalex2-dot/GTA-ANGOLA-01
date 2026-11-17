/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EngineModule, ModuleDescriptor, ModuleId } from './types';

/**
 * Central lifecycle registry for all 12 ANGOLA VIRTUAL modules.
 * Guarantees deterministic initialization order, frame updates, and clean disposal.
 */
export class EngineRegistry {
  private modules = new Map<ModuleId, EngineModule>();
  private initialized = false;

  register(module: EngineModule): void {
    const id = module.descriptor.id;
    if (this.modules.has(id)) {
      throw new Error(`Module "${id}" is already registered.`);
    }
    this.modules.set(id, module);
  }

  get<T extends EngineModule>(id: ModuleId): T | undefined {
    return this.modules.get(id) as T | undefined;
  }

  listDescriptors(): ModuleDescriptor[] {
    return [...this.modules.values()]
      .map((m) => m.descriptor)
      .sort((a, b) => a.index - b.index);
  }

  async initAll(): Promise<void> {
    if (this.initialized) return;
    const ordered = [...this.modules.values()].sort(
      (a, b) => a.descriptor.index - b.descriptor.index,
    );
    for (const mod of ordered) {
      await mod.init();
    }
    this.initialized = true;
  }

  updateAll(dt: number): void {
    if (!this.initialized) return;
    for (const mod of this.modules.values()) {
      mod.update?.(dt);
    }
  }

  disposeAll(): void {
    const reverse = [...this.modules.values()].reverse();
    for (const mod of reverse) {
      mod.dispose();
    }
    this.initialized = false;
  }
}
