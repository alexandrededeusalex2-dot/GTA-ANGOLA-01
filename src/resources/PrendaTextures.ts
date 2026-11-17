/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import type { MaterialLibrary } from './MaterialLibrary';

export interface PrendaPbrMaterialPack {
  readonly terrainSoil: THREE.MeshStandardMaterial;
  readonly roadAsphaltV3V4: THREE.MeshStandardMaterial;
  readonly roadAsphaltLocal: THREE.MeshStandardMaterial;
  readonly pedestrianWalkway: THREE.MeshStandardMaterial;
  readonly sidewalkCurb: THREE.MeshStandardMaterial;
  readonly facadeConcrete: THREE.MeshStandardMaterial;
  readonly facadeWarmOchre: THREE.MeshStandardMaterial;
  readonly facadeIvoryPlaster: THREE.MeshStandardMaterial;
  readonly facadeContemporaryPaint: THREE.MeshStandardMaterial;
  readonly structuralConcrete: THREE.MeshStandardMaterial;
  readonly cobogoCore: THREE.MeshStandardMaterial;
  readonly roofDeck: THREE.MeshStandardMaterial;
  readonly darkMetal: THREE.MeshStandardMaterial;
  readonly corrugatedZinc: THREE.MeshStandardMaterial;
  readonly civicGlass: THREE.MeshStandardMaterial;
  readonly mosqueStucco: THREE.MeshStandardMaterial;
  readonly sportsCourt: THREE.MeshStandardMaterial;
  readonly laneMarking: THREE.MeshStandardMaterial;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function seededRand(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function createTerraVermelhaTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = seededRand(1965);
  ctx.fillStyle = '#8b4d33';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 2400; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 1 + rand() * 3.5;
    const pick = rand();
    if (pick < 0.35) ctx.fillStyle = 'rgba(116, 62, 40, 0.42)';
    else if (pick < 0.7) ctx.fillStyle = 'rgba(154, 94, 62, 0.35)';
    else ctx.fillStyle = 'rgba(104, 114, 64, 0.24)'; // patchy dry Luanda grass
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(38, 38);
  return tex;
}

function createAsphaltTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = seededRand(77);
  ctx.fillStyle = '#33363b';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 3000; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const size = 1 + rand() * 2;
    const shade = Math.floor(42 + rand() * 34);
    ctx.fillStyle = `rgb(${shade}, ${shade + 1}, ${shade + 3})`;
    ctx.fillRect(x, y, size, size);
  }
  // Subtle red-dust wear streaks
  ctx.fillStyle = 'rgba(138, 86, 60, 0.08)';
  ctx.fillRect(0, 0, 256, 24);
  ctx.fillRect(0, 232, 256, 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function createPaverTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = seededRand(404);
  ctx.fillStyle = '#9e978b';
  ctx.fillRect(0, 0, 256, 256);

  const step = 32;
  ctx.strokeStyle = 'rgba(65, 60, 54, 0.35)';
  ctx.lineWidth = 1.5;
  for (let y = 0; y <= 256; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  for (let x = 0; x <= 256; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();
  }
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(60,50,42,0.08)';
    ctx.fillRect(rand() * 256, rand() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Generates a tileable 1-story x 2-bay Tropical Modernist Prenda facade texture
 * (horizontal floor slab ledge, recessed shaded loggia gallery, louvered windows, concrete piers).
 */
function createModernistFacadeTexture(
  wallHex: string,
  slabHex: string,
  accentHex: string,
  seed: number,
): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(256, 256);
  const rand = seededRand(seed);

  // Base plaster/concrete wall
  ctx.fillStyle = wallHex;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle tropical weathering noise
  for (let i = 0; i < 1100; i++) {
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(42,36,30,0.07)';
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 4, 2 + rand() * 6);
  }

  // Top & bottom concrete floor slab spandrels
  ctx.fillStyle = slabHex;
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillRect(0, 224, 256, 32);

  // Horizontal gallery shadow band beneath upper floor overhang
  const grad = ctx.createLinearGradient(0, 32, 0, 108);
  grad.addColorStop(0, 'rgba(18, 22, 28, 0.52)');
  grad.addColorStop(1, 'rgba(18, 22, 28, 0.05)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 32, 256, 76);

  // Two recessed window/loggia bays per tile
  for (const bayX of [18, 146]) {
    // Deep window aperture
    ctx.fillStyle = '#1d2630';
    ctx.fillRect(bayX, 54, 92, 96);

    // Tropical horizontal louver slats / shutters
    ctx.fillStyle = 'rgba(205, 198, 184, 0.25)';
    for (let ly = 58; ly < 146; ly += 8) {
      ctx.fillRect(bayX + 3, ly, 40, 2.5);
    }
    // Glazed pane reflection on right half
    ctx.fillStyle = '#2d4050';
    ctx.fillRect(bayX + 48, 58, 40, 88);
    ctx.fillStyle = 'rgba(165, 206, 232, 0.18)';
    ctx.fillRect(bayX + 52, 62, 14, 72);

    // Painted concrete balcony parapet below window
    ctx.fillStyle = accentHex;
    ctx.fillRect(bayX - 4, 152, 100, 56);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bayX - 4, 152, 100, 5);
  }

  // Vertical structural concrete piers separating bays
  ctx.fillStyle = slabHex;
  ctx.fillRect(0, 0, 12, 256);
  ctx.fillRect(122, 0, 14, 256);
  ctx.fillRect(246, 0, 10, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCobogoTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#a39c91';
  ctx.fillRect(0, 0, 128, 128);

  const cell = 16;
  for (let y = 0; y < 128; y += cell) {
    for (let x = 0; x < 128; x += cell) {
      ctx.fillStyle = '#232830';
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createCorrugatedZincTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  for (let x = 0; x < 128; x += 8) {
    ctx.fillStyle = '#8b939b';
    ctx.fillRect(x, 0, 4, 128);
    ctx.fillStyle = '#606870';
    ctx.fillRect(x + 4, 0, 4, 128);
  }
  // Rust / weathering hints
  ctx.fillStyle = 'rgba(136, 72, 42, 0.22)';
  ctx.fillRect(0, 18, 128, 22);
  ctx.fillRect(0, 88, 128, 16);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function createConcreteBumpMap(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(128, 128);
  const rand = seededRand(909);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) {
    const v = Math.floor(105 + rand() * 50);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(rand() * 128, rand() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createPrendaMaterialPack(
  assetManager: AssetManager,
  materialLibrary: MaterialLibrary,
): PrendaPbrMaterialPack {
  const soilMap = assetManager.registerProceduralTexture(
    'prenda:tex:soil',
    createTerraVermelhaTexture(),
    true,
  );
  const asphaltMap = assetManager.registerProceduralTexture(
    'prenda:tex:asphalt',
    createAsphaltTexture(),
    true,
  );
  const paverMap = assetManager.registerProceduralTexture(
    'prenda:tex:paver',
    createPaverTexture(),
    true,
  );
  const concreteBump = assetManager.registerProceduralTexture(
    'prenda:tex:concreteBump',
    createConcreteBumpMap(),
    false,
  );
  const facadeConcreteMap = assetManager.registerProceduralTexture(
    'prenda:tex:facadeConcrete',
    createModernistFacadeTexture('#b6b0a4', '#948e84', '#a59a8a', 101),
    true,
  );
  const facadeWarmOchreMap = assetManager.registerProceduralTexture(
    'prenda:tex:facadeWarmOchre',
    createModernistFacadeTexture('#d1b48c', '#9d9488', '#c68a59', 202),
    true,
  );
  const facadeIvoryMap = assetManager.registerProceduralTexture(
    'prenda:tex:facadeIvory',
    createModernistFacadeTexture('#d7d1c3', '#99958d', '#b8ab96', 303),
    true,
  );
  const facadeContempMap = assetManager.registerProceduralTexture(
    'prenda:tex:facadeContemp',
    createModernistFacadeTexture('#c9c5bc', '#8b8a87', '#6c8899', 404),
    true,
  );
  const cobogoMap = assetManager.registerProceduralTexture(
    'prenda:tex:cobogo',
    createCobogoTexture(),
    true,
  );
  const zincMap = assetManager.registerProceduralTexture(
    'prenda:tex:zinc',
    createCorrugatedZincTexture(),
    true,
  );

  return {
    terrainSoil: materialLibrary.createStandardPbrMaterial('prenda:mat:terrainSoil', {
      color: 0xffffff,
      map: soilMap,
      bumpMap: concreteBump,
      bumpScale: 0.08,
      roughness: 0.94,
      metalness: 0.02,
      vertexColors: true,
    }),
    roadAsphaltV3V4: materialLibrary.createStandardPbrMaterial('prenda:mat:asphaltV3V4', {
      color: 0xffffff,
      map: asphaltMap,
      bumpMap: concreteBump,
      bumpScale: 0.04,
      roughness: 0.85,
      metalness: 0.04,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    roadAsphaltLocal: materialLibrary.createStandardPbrMaterial('prenda:mat:asphaltLocal', {
      color: 0xd9d4cd,
      map: asphaltMap,
      roughness: 0.89,
      metalness: 0.03,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    pedestrianWalkway: materialLibrary.createStandardPbrMaterial('prenda:mat:pedestrian', {
      color: 0xd6cfc2,
      map: paverMap,
      roughness: 0.9,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
    sidewalkCurb: materialLibrary.createStandardPbrMaterial('prenda:mat:sidewalk', {
      color: 0xffffff,
      map: paverMap,
      roughness: 0.86,
      metalness: 0.03,
    }),
    facadeConcrete: materialLibrary.createStandardPbrMaterial('prenda:mat:facadeConcrete', {
      color: 0xffffff,
      map: facadeConcreteMap,
      bumpMap: concreteBump,
      bumpScale: 0.05,
      roughness: 0.84,
      metalness: 0.04,
    }),
    facadeWarmOchre: materialLibrary.createStandardPbrMaterial('prenda:mat:facadeWarmOchre', {
      color: 0xffffff,
      map: facadeWarmOchreMap,
      bumpMap: concreteBump,
      bumpScale: 0.04,
      roughness: 0.8,
      metalness: 0.04,
    }),
    facadeIvoryPlaster: materialLibrary.createStandardPbrMaterial('prenda:mat:facadeIvory', {
      color: 0xffffff,
      map: facadeIvoryMap,
      bumpMap: concreteBump,
      bumpScale: 0.04,
      roughness: 0.82,
      metalness: 0.04,
    }),
    facadeContemporaryPaint: materialLibrary.createStandardPbrMaterial('prenda:mat:facadeContemp', {
      color: 0xffffff,
      map: facadeContempMap,
      roughness: 0.78,
      metalness: 0.05,
    }),
    structuralConcrete: materialLibrary.createStandardPbrMaterial('prenda:mat:structuralConcrete', {
      color: 0x9b958a,
      bumpMap: concreteBump,
      bumpScale: 0.06,
      roughness: 0.88,
      metalness: 0.04,
    }),
    cobogoCore: materialLibrary.createStandardPbrMaterial('prenda:mat:cobogo', {
      color: 0xffffff,
      map: cobogoMap,
      roughness: 0.85,
      metalness: 0.05,
    }),
    roofDeck: materialLibrary.createStandardPbrMaterial('prenda:mat:roofDeck', {
      color: 0x76726b,
      bumpMap: concreteBump,
      bumpScale: 0.05,
      roughness: 0.92,
      metalness: 0.04,
    }),
    darkMetal: materialLibrary.createStandardPbrMaterial('prenda:mat:darkMetal', {
      color: 0x353b42,
      roughness: 0.38,
      metalness: 0.72,
    }),
    corrugatedZinc: materialLibrary.createStandardPbrMaterial('prenda:mat:zinc', {
      color: 0xffffff,
      map: zincMap,
      roughness: 0.44,
      metalness: 0.65,
    }),
    civicGlass: materialLibrary.createStandardPbrMaterial('prenda:mat:civicGlass', {
      color: 0x2c4b5c,
      roughness: 0.16,
      metalness: 0.22,
    }),
    mosqueStucco: materialLibrary.createStandardPbrMaterial('prenda:mat:mosqueStucco', {
      color: 0xe6dfd1,
      roughness: 0.76,
      metalness: 0.03,
    }),
    sportsCourt: materialLibrary.createStandardPbrMaterial('prenda:mat:sportsCourt', {
      color: 0x456b5e,
      roughness: 0.86,
      metalness: 0.03,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    laneMarking: materialLibrary.createStandardPbrMaterial('prenda:mat:laneMarking', {
      color: 0xe8e2d2,
      roughness: 0.65,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  };
}
