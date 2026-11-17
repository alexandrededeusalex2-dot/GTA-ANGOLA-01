/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Vector3Like } from '../core/types';

export type ColliderShapeType = 'box' | 'capsule' | 'cylinder' | 'trimesh' | 'heightfield';

export interface RigidBodyDescriptor {
  readonly id: string;
  readonly type: 'dynamic' | 'fixed' | 'kinematicPosition';
  readonly position: Vector3Like;
  readonly massKg?: number;
}

export interface ColliderDescriptor {
  readonly bodyId: string;
  readonly shape: ColliderShapeType;
  readonly halfExtents?: Vector3Like;
  readonly radius?: number;
  readonly halfHeight?: number;
  readonly friction?: number;
  readonly restitution?: number;
}

export interface RaycastHitResult {
  readonly bodyId: string;
  readonly distance: number;
  readonly point: Vector3Like;
  readonly normal: Vector3Like;
}

/**
 * Abstraction layer prepared for Rapier 3D (@dimforge/rapier3d-compat).
 * Phase 1 defines the contract and lifecycle without loading WASM physics
 * until Phase 2 introduces terrain colliders, characters, and vehicles.
 */
export interface IPhysicsWorldAdapter {
  readonly backendName: 'rapier3d-planned' | 'rapier3d-wasm';
  readonly isSimulationActive: boolean;
  init(): Promise<void>;
  step(fixedDtSeconds: number): void;
  createRigidBody(desc: RigidBodyDescriptor): void;
  attachCollider(desc: ColliderDescriptor): void;
  raycast(origin: Vector3Like, direction: Vector3Like, maxDistance: number): RaycastHitResult | null;
  dispose(): void;
}

export class PlannedRapierPhysicsAdapter implements IPhysicsWorldAdapter {
  readonly backendName = 'rapier3d-planned' as const;
  private active = false;
  private bodies = new Map<string, RigidBodyDescriptor>();

  get isSimulationActive(): boolean {
    return this.active;
  }

  async init(): Promise<void> {
    // Phase 2 integration point: await RAPIER.init() and create new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    this.active = true;
  }

  step(_fixedDtSeconds: number): void {
    // Intentionally a no-op in Phase 1 until rigid bodies are spawned in Phase 2.
  }

  createRigidBody(desc: RigidBodyDescriptor): void {
    this.bodies.set(desc.id, desc);
  }

  attachCollider(_desc: ColliderDescriptor): void {
    // Reserved for Phase 2 Rapier ColliderDesc attachment.
  }

  raycast(
    _origin: Vector3Like,
    _direction: Vector3Like,
    _maxDistance: number,
  ): RaycastHitResult | null {
    return null;
  }

  dispose(): void {
    this.bodies.clear();
    this.active = false;
  }
}
