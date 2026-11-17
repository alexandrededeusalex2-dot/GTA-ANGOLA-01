/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CharacterBodyBuild = 'standard' | 'lean' | 'athletic' | 'robust';

export type CharacterActionSlot =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'jump'
  | 'enterVehicle'
  | 'drive'
  | 'interact';

export type CustomizationCategory =
  | 'face'
  | 'hair'
  | 'beard'
  | 'skinTone'
  | 'clothing'
  | 'footwear'
  | 'accessories'
  | 'bodyBuild';

export interface CustomizationAnchorSlot {
  readonly category: CustomizationCategory;
  readonly boneName: string;
  readonly localOffset: readonly [number, number, number];
  readonly supportedInPhase: string;
  readonly description: string;
}

export interface CharacterAppearanceProfile {
  readonly id: string;
  readonly displayName: string;
  readonly facePreset: string;
  readonly hairStyle: string;
  readonly beardStyle: string;
  readonly skinToneHex: string;
  readonly clothingTop: string;
  readonly clothingBottom: string;
  readonly footwear: string;
  readonly accessories: readonly string[];
  readonly bodyBuild: CharacterBodyBuild;
}

export const DEFAULT_PRENDA_PROTAGONIST_APPEARANCE: CharacterAppearanceProfile = {
  id: 'luanda-cidadao-01',
  displayName: 'Mateus (Cidadão do Prenda)',
  facePreset: 'valid_black_m_03',
  hairStyle: 'afro_curto_natural',
  beardStyle: 'barba_rasa',
  skinToneHex: '#5c3a28',
  clothingTop: 'polo_cinza_urbano',
  clothingBottom: 'calcas_ganga_azul',
  footwear: 'sapatilhas_urbanas',
  accessories: [],
  bodyBuild: 'standard',
};

/**
 * Modular slot anchors prepared on the 84-joint humanoid rig for future customization
 * without breaking anatomical proportions in Phase 3.
 */
export const CUSTOMIZATION_SLOT_DEFINITIONS: readonly CustomizationAnchorSlot[] = [
  {
    category: 'face',
    boneName: 'Head',
    localOffset: [0, 0.08, 0.05],
    supportedInPhase: 'Fase 4+',
    description: 'Traços faciais, expressão e morph targets.',
  },
  {
    category: 'hair',
    boneName: 'Head',
    localOffset: [0, 0.14, 0],
    supportedInPhase: 'Fase 4+',
    description: 'Cortes de cabelo, tranças e estilos angolanos contemporâneos.',
  },
  {
    category: 'beard',
    boneName: 'Head',
    localOffset: [0, 0.02, 0.07],
    supportedInPhase: 'Fase 4+',
    description: 'Barba, bigode e contornos faciais.',
  },
  {
    category: 'skinTone',
    boneName: 'Spine2',
    localOffset: [0, 0, 0],
    supportedInPhase: 'Fase 4+',
    description: 'Calibração PBR de melanina e rugosidade cutânea.',
  },
  {
    category: 'clothing',
    boneName: 'Spine1',
    localOffset: [0, 0, 0],
    supportedInPhase: 'Fase 4+',
    description: 'Camisas, polos, t-shirts, calças e uniformes profissionais.',
  },
  {
    category: 'footwear',
    boneName: 'LeftFoot',
    localOffset: [0, -0.04, 0.04],
    supportedInPhase: 'Fase 4+',
    description: 'Sapatilhas, sapatos sociais, chinelos e botas de trabalho.',
  },
  {
    category: 'accessories',
    boneName: 'Head',
    localOffset: [0, 0.06, 0.08],
    supportedInPhase: 'Fase 4+',
    description: 'Óculos, boné, relógio (LeftHand) e mochila (Spine2).',
  },
  {
    category: 'bodyBuild',
    boneName: 'Hips',
    localOffset: [0, 0, 0],
    supportedInPhase: 'Fase 4+',
    description: 'Variação anatómica controlada mantendo compatibilidade de esqueleto.',
  },
];

export function cloneAppearanceProfile(
  base: CharacterAppearanceProfile,
  patch: Partial<CharacterAppearanceProfile>,
): CharacterAppearanceProfile {
  return {
    ...base,
    ...patch,
    accessories: patch.accessories ? [...patch.accessories] : [...base.accessories],
  };
}
