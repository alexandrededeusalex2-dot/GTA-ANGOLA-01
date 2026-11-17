/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { Vector3Like } from '../../core/types';
import type { AssetManager } from '../../resources/AssetManager';
import { groundHeightAt } from './luandaCoordinates';

export const ESTABELECIMENTO_INTERIOR_GLB_URL =
  '/assets/models/props/estabelecimento_interior.glb';

export const ESTABLISHMENT_DOOR_OPEN_RADIUS_METERS = 4.5;
export const ESTABLISHMENT_INTERACT_RADIUS_METERS = 4.2;
export const BOUTIQUE_TSHIRT_PRICE_KZ = 200;
export const BOUTIQUE_TSHIRT_LABEL = 'Mudar T-shirt - 200 Kz';
export const BARBEARIA_LOWFADE_PRICE_KZ = 150;
export const BARBEARIA_LOWFADE_LABEL = 'Corte Low Fade - 150 Kz';

export type EstablishmentKind = 'cantina' | 'boutique' | 'barbearia' | 'casa';

export interface EstablishmentSpec {
  readonly id: EstablishmentKind;
  readonly name: string;
  readonly subtitle: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly awningHex: number;
  readonly promptText: string;
}

export const PRENDA_ESTABLISHMENTS: readonly EstablishmentSpec[] = [
  {
    id: 'cantina',
    name: 'Cantina da Prenda',
    subtitle: 'Comida quente e bebidas frescas',
    x: -16,
    z: -8,
    yaw: -0.52,
    awningHex: 0xd97706,
    promptText: 'Entrar na Cantina [E]',
  },
  {
    id: 'boutique',
    name: 'Boutique Luanda',
    subtitle: 'Moda urbana · T-shirts Prenda',
    x: -29,
    z: -15,
    yaw: -0.52,
    awningHex: 0x0284c7,
    promptText: 'Abrir Boutique [E]',
  },
  {
    id: 'barbearia',
    name: 'Barbearia Low Fade',
    subtitle: 'Cortes modernos da banda',
    x: -42,
    z: -22,
    yaw: -0.52,
    awningHex: 0xdc2626,
    promptText: 'Cortar Cabelo [E]',
  },
  {
    id: 'casa',
    name: 'Casa do Mateus',
    subtitle: 'Descansar e recuperar energia',
    x: 4,
    z: -10,
    yaw: 0.35,
    awningHex: 0x15803d,
    promptText: 'Entrar em Casa [E]',
  },
];

export const BOUTIQUE_SHIRT_OPTIONS: readonly { readonly id: string; readonly label: string; readonly hex: string }[] = [
  { id: 'vermelho', label: 'Vermelho Banda', hex: '#dc2626' },
  { id: 'azul', label: 'Azul Luanda', hex: '#0284c7' },
  { id: 'amarelo', label: 'Ouro Prenda', hex: '#eab308' },
  { id: 'verde', label: 'Verde Maianga', hex: '#16a34a' },
];

export function stepEstablishmentDoorAngle(
  currentAngleRad: number,
  isPlayerNear: boolean,
  dt: number,
): number {
  const target = isPlayerNear ? 1.42 : 0;
  const rate = Math.min(1, Math.max(0.001, dt) * 6.5);
  return currentAngleRad + (target - currentAngleRad) * rate;
}

export function findNearestEstablishment(
  playerPos: { readonly x: number; readonly z: number },
  specs: readonly EstablishmentSpec[] = PRENDA_ESTABLISHMENTS,
  maxRadiusMeters = ESTABLISHMENT_INTERACT_RADIUS_METERS,
): { readonly spec: EstablishmentSpec; readonly distanceMeters: number } | null {
  let best: EstablishmentSpec | null = null;
  let bestDist = Infinity;

  for (const spec of specs) {
    const d = Math.hypot(playerPos.x - spec.x, playerPos.z - spec.z);
    if (d <= maxRadiusMeters && d < bestDist) {
      bestDist = d;
      best = spec;
    }
  }

  return best ? { spec: best, distanceMeters: bestDist } : null;
}

function createEstablishmentSignSprite(
  title: string,
  accentHex: number,
): { readonly sprite: THREE.Sprite; readonly texture: THREE.CanvasTexture; readonly material: THREE.SpriteMaterial } | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0e1116';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = `#${accentHex.toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 256, 10);
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 128, 38, 240);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: false,
    depthWrite: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.5, 0.52, 1);
  return { sprite, texture, material };
}

interface SpawnedEstablishment {
  readonly spec: EstablishmentSpec;
  readonly rootGroup: THREE.Group;
  readonly doorPivot: THREE.Object3D | null;
  readonly clonedMaterials: THREE.Material[];
  readonly signHandle: ReturnType<typeof createEstablishmentSignSprite>;
  doorAngleRad: number;
}

/**
 * Loads estabelecimento_interior.glb (InteriorShell + DoorPivot + Balcao + Awning)
 * for Cantina, Boutique, Barbearia, and Casa in Prenda UV1 — no geometric primitives.
 */
export class EstablishmentsManager {
  private instances: SpawnedEstablishment[] = [];
  private mountPromise: Promise<void> | null = null;
  private disposed = false;
  private nearbySpec: EstablishmentSpec | null = null;

  constructor(private readonly assetManager?: AssetManager) {}

  async mountToScene(
    scene: THREE.Scene,
    sampleGroundY: (x: number, z: number) => number = groundHeightAt,
  ): Promise<void> {
    if (this.disposed || !this.assetManager) return;
    if (this.instances.length > 0) {
      for (const inst of this.instances) {
        if (inst.rootGroup.parent !== scene) scene.add(inst.rootGroup);
      }
      return;
    }
    if (this.mountPromise) return this.mountPromise;

    this.mountPromise = this.assetManager
      .loadGltfModel('props:estabelecimento_interior', ESTABELECIMENTO_INTERIOR_GLB_URL)
      .then((gltf) => {
        if (this.disposed) return;

        for (const spec of PRENDA_ESTABLISHMENTS) {
          const clone = gltf.scene.clone(true);
          const clonedMaterials: THREE.Material[] = [];
          let doorPivot: THREE.Object3D | null = null;

          clone.traverse((node) => {
            if (node.name === 'DoorPivot') {
              doorPivot = node;
            }
            if ((node as THREE.Mesh).isMesh) {
              const mesh = node as THREE.Mesh;
              mesh.castShadow = false;
              mesh.receiveShadow = false;
              if (mesh.name === 'Awning' && mesh.material) {
                const src = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
                if (src && (src as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const mat = (src as THREE.MeshStandardMaterial).clone();
                  mat.color.setHex(spec.awningHex);
                  mesh.material = mat;
                  clonedMaterials.push(mat);
                }
              }
            }
          });

          const y = sampleGroundY(spec.x, spec.z);
          const rootGroup = new THREE.Group();
          rootGroup.name = `Establishment_${spec.id}`;
          rootGroup.position.set(spec.x, y, spec.z);
          rootGroup.rotation.set(0, spec.yaw, 0);
          rootGroup.add(clone);

          const signHandle = createEstablishmentSignSprite(spec.name, spec.awningHex);
          if (signHandle) {
            signHandle.sprite.position.set(0, 2.74, 1.97);
            rootGroup.add(signHandle.sprite);
          }

          scene.add(rootGroup);
          this.instances.push({
            spec,
            rootGroup,
            doorPivot,
            clonedMaterials,
            signHandle,
            doorAngleRad: 0,
          });
        }
      })
      .finally(() => {
        this.mountPromise = null;
      });

    return this.mountPromise;
  }

  update(playerPos: Vector3Like, dt: number): EstablishmentSpec | null {
    const clampedDt = Math.min(Math.max(dt, 0.001), 0.1);
    let nearest: EstablishmentSpec | null = null;
    let nearestDist = Infinity;

    for (const inst of this.instances) {
      const dist = Math.hypot(playerPos.x - inst.spec.x, playerPos.z - inst.spec.z);
      inst.rootGroup.visible = dist <= 80;
      if (inst.signHandle) {
        inst.signHandle.sprite.visible = dist <= 36;
      }
      const isNearDoor = dist <= ESTABLISHMENT_DOOR_OPEN_RADIUS_METERS;
      inst.doorAngleRad = stepEstablishmentDoorAngle(inst.doorAngleRad, isNearDoor, clampedDt);
      if (inst.doorPivot) {
        inst.doorPivot.rotation.y = inst.doorAngleRad;
      }

      if (dist <= ESTABLISHMENT_INTERACT_RADIUS_METERS && dist < nearestDist) {
        nearestDist = dist;
        nearest = inst.spec;
      }
    }

    this.nearbySpec = nearest;
    if (typeof document !== 'undefined' && document.body) {
      document.body.dataset.nearbyShop = nearest ? nearest.id : 'none';
      const anyDoorOpen = this.instances.some((i) => i.doorAngleRad > 0.35);
      document.body.dataset.shopDoorOpen = anyDoorOpen ? 'true' : 'false';
    }
    return nearest;
  }

  getNearbyEstablishment(): EstablishmentSpec | null {
    return this.nearbySpec;
  }

  getDoorStates(): readonly { readonly id: EstablishmentKind; readonly doorAngleRad: number }[] {
    return this.instances.map((i) => ({ id: i.spec.id, doorAngleRad: i.doorAngleRad }));
  }

  dispose(): void {
    this.disposed = true;
    for (const inst of this.instances) {
      inst.rootGroup.removeFromParent();
      for (const m of inst.clonedMaterials) m.dispose();
      inst.signHandle?.texture.dispose();
      inst.signHandle?.material.dispose();
    }
    this.instances = [];
  }
}
