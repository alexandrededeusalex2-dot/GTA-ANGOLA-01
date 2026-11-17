/**
 * Generates real low-poly textured GLB v2 assets for Phase 8 (Cidade Viva):
 * - public/assets/models/props/bola_low.glb
 * - public/assets/models/props/estabelecimento_interior.glb
 * - public/assets/models/props/acessorios_prenda.glb
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRgba(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeSolidOrPatternPng(width, height, pixelFn) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = pixelFn(x, y, width, height);
      const idx = (y * width + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }
  return encodePngRgba(width, height, rgba);
}

function buildGlb(parts, outFile) {
  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];
  const images = [];
  const textures = [];
  const materials = [];
  const meshes = [];
  const nodes = [];

  const appendBin = (buf, target) => {
    const pad = (4 - (buf.length % 4)) % 4;
    const padded = pad > 0 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
    const viewIndex = bufferViews.length;
    bufferViews.push({
      buffer: 0,
      byteOffset,
      byteLength: buf.length,
      ...(target ? { target } : {}),
    });
    chunks.push(padded);
    byteOffset += padded.length;
    return viewIndex;
  };

  for (const part of parts) {
    const pngView = appendBin(part.pngBuffer);
    const imgIdx = images.length;
    images.push({ bufferView: pngView, mimeType: 'image/png' });
    const texIdx = textures.length;
    textures.push({ source: imgIdx, sampler: 0 });
    const matIdx = materials.length;
    materials.push({
      name: part.materialName,
      pbrMetallicRoughness: {
        baseColorTexture: { index: texIdx },
        metallicFactor: part.metallic ?? 0.04,
        roughnessFactor: part.roughness ?? 0.72,
      },
      ...(part.doubleSided ? { doubleSided: true } : {}),
    });

    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    g.computeVertexNormals();
    const pos = g.attributes.position;
    const norm = g.attributes.normal;
    let uv = g.attributes.uv;
    if (!uv) {
      const uvArr = new Float32Array(pos.count * 2);
      uv = new THREE.BufferAttribute(uvArr, 2);
    }

    const posBuf = Buffer.from(pos.array.buffer, pos.array.byteOffset, pos.array.byteLength);
    const normBuf = Buffer.from(norm.array.buffer, norm.array.byteOffset, norm.array.byteLength);
    const uvBuf = Buffer.from(uv.array.buffer, uv.array.byteOffset, uv.array.byteLength);

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }

    const posView = appendBin(Buffer.from(posBuf), 34962);
    const normView = appendBin(Buffer.from(normBuf), 34962);
    const uvView = appendBin(Buffer.from(uvBuf), 34962);

    const posAcc = accessors.length;
    accessors.push({
      bufferView: posView,
      componentType: 5126,
      count: pos.count,
      type: 'VEC3',
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    });
    const normAcc = accessors.length;
    accessors.push({
      bufferView: normView,
      componentType: 5126,
      count: norm.count,
      type: 'VEC3',
    });
    const uvAcc = accessors.length;
    accessors.push({
      bufferView: uvView,
      componentType: 5126,
      count: uv.count,
      type: 'VEC2',
    });

    const meshIdx = meshes.length;
    meshes.push({
      name: part.name,
      primitives: [
        {
          attributes: {
            POSITION: posAcc,
            NORMAL: normAcc,
            TEXCOORD_0: uvAcc,
          },
          material: matIdx,
        },
      ],
    });
    nodes.push({
      name: part.name,
      mesh: meshIdx,
      ...(part.translation ? { translation: part.translation } : {}),
    });
    if (g !== part.geometry) g.dispose();
  }

  const gltf = {
    asset: { version: '2.0', generator: 'angola-virtual-phase8-props' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    textures,
    samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }],
    images,
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const jsonStr = JSON.stringify(gltf);
  const jsonBufRaw = Buffer.from(jsonStr, 'utf8');
  const jsonPad = (4 - (jsonBufRaw.length % 4)) % 4;
  const jsonBuf = jsonPad > 0 ? Buffer.concat([jsonBufRaw, Buffer.alloc(jsonPad, 0x20)]) : jsonBufRaw;
  const binBuf = Buffer.concat(chunks);

  const totalLen = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0); // glTF
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLen, 8);

  const jsonHdr = Buffer.alloc(8);
  jsonHdr.writeUInt32LE(jsonBuf.length, 0);
  jsonHdr.writeUInt32LE(0x4e4f534a, 4); // JSON

  const binHdr = Buffer.alloc(8);
  binHdr.writeUInt32LE(binBuf.length, 0);
  binHdr.writeUInt32LE(0x004e4942, 4); // BIN

  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, Buffer.concat([header, jsonHdr, jsonBuf, binHdr, binBuf]));
  console.log('Wrote GLB:', outFile, 'bytes:', totalLen);
}

function mergeList(geoms) {
  const clean = geoms.map((g) => {
    const ni = g.index ? g.toNonIndexed() : g.clone();
    ni.computeVertexNormals();
    if (!ni.attributes.uv) {
      ni.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ni.attributes.position.count * 2), 2));
    }
    return ni;
  });
  const merged = mergeGeometries(clean, false);
  for (const g of clean) g.dispose();
  for (const g of geoms) g.dispose();
  return merged;
}

// 1. BOLA_LOW.GLB (Low-poly geodesic soccer ball)
{
  const ballGeom = new THREE.IcosahedronGeometry(0.145, 1).toNonIndexed();
  const pos = ballGeom.attributes.position;
  const uvArr = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, y, z) || 0.145;
    uvArr[i * 2] = 0.5 + Math.atan2(z, x) / (Math.PI * 2);
    uvArr[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, y / r))) / Math.PI;
  }
  ballGeom.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));

  const ballPng = makeSolidOrPatternPng(128, 128, (x, y, w, h) => {
    const u = (x / w) * Math.PI * 2;
    const v = (y / h) * Math.PI;
    const sx = Math.sin(v) * Math.cos(u);
    const sy = Math.cos(v);
    const sz = Math.sin(v) * Math.sin(u);
    // 12 icosahedral pentagon directions -> crisp classic Telstar soccer ball pattern
    const phi = (1 + Math.sqrt(5)) / 2;
    const dirs = [
      [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
      [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
      [phi, 0, 1], [-phi, 0, 1], [phi, 0, -1], [-phi, 0, -1],
    ];
    let maxDot = -1;
    for (const [dx, dy, dz] of dirs) {
      const len = Math.hypot(dx, dy, dz);
      const d = (sx * dx + sy * dy + sz * dz) / len;
      if (d > maxDot) maxDot = d;
    }
    if (maxDot > 0.895) return [24, 26, 32, 255];
    if (maxDot > 0.875) return [150, 155, 162, 255];
    return [242, 240, 232, 255];
  });

  buildGlb(
    [
      {
        name: 'soccer-ball',
        materialName: 'SoccerBallLeather',
        geometry: ballGeom,
        pngBuffer: ballPng,
        roughness: 0.55,
      },
    ],
    'public/assets/models/props/bola_low.glb',
  );
  ballGeom.dispose();
}

// 2. ESTABELECIMENTO_INTERIOR.GLB (Walls + doorway + animated DoorPivot + Balcao + Awning)
{
  const shellParts = [];
  const box = (w, h, d, x, y, z) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return g;
  };
  // Floor, roof, back, left, right, front doorway piers & lintel
  shellParts.push(
    box(4.6, 0.08, 3.8, 0, 0.04, 0),
    box(4.6, 2.95, 0.22, 0, 1.55, -1.79),
    box(0.22, 2.95, 3.8, -2.19, 1.55, 0),
    box(0.22, 2.95, 3.8, 2.19, 1.55, 0),
    box(1.45, 2.95, 0.22, -1.575, 1.55, 1.79),
    box(1.45, 2.95, 0.22, 1.575, 1.55, 1.79),
    box(1.70, 0.72, 0.22, 0, 2.66, 1.79),
    box(4.85, 0.22, 4.1, 0, 3.10, 0.05),
  );
  const shellGeom = mergeList(shellParts);
  const shellPng = makeSolidOrPatternPng(128, 128, (x, y) => {
    const tile = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) * 10;
    return [228 - tile, 212 - tile, 186 - tile, 255];
  });

  // DoorPivot hinged at (-0.84, 0.08, 1.79)
  const doorParts = [
    box(0.08, 2.26, 0.06, 0.04, 1.13, 0),      // hinge stile
    box(0.08, 2.26, 0.06, 1.60, 1.13, 0),      // latch stile
    box(1.64, 0.56, 0.06, 0.82, 0.28, 0),      // lower kick panel
    box(1.64, 0.14, 0.06, 0.82, 2.19, 0),      // top rail
    box(1.48, 1.50, 0.025, 0.82, 1.32, 0),     // tinted door glass pane
    box(0.05, 0.44, 0.10, 1.44, 1.08, 0.05),   // push handle
  ];
  const doorGeom = mergeList(doorParts);
  const doorPng = makeSolidOrPatternPng(64, 64, (_x, y) => {
    return y < 32 ? [84, 128, 158, 255] : [45, 54, 66, 255];
  });

  // Balcao (counter + return + register + rear display shelves + bottles)
  const counterParts = [
    box(2.75, 0.92, 0.62, 0.18, 0.50, -0.58),   // counter base
    box(2.90, 0.10, 0.78, 0.18, 1.01, -0.56),   // wooden countertop
    box(0.62, 0.92, 1.05, 1.24, 0.50, -1.18),   // L-return
    box(0.36, 0.24, 0.30, -0.45, 1.18, -0.56),  // cash register
    box(2.40, 2.05, 0.28, 0.15, 1.10, -1.56),   // rear shelf backboard
    box(2.34, 0.06, 0.36, 0.15, 0.95, -1.46),   // shelf 1
    box(2.34, 0.06, 0.36, 0.15, 1.48, -1.46),   // shelf 2
    box(2.34, 0.06, 0.36, 0.15, 1.96, -1.46),   // shelf 3
  ];
  // Add small molded display bottles along shelves (CylinderGeometry inside offline generator)
  for (let i = -3; i <= 3; i++) {
    const b1 = new THREE.CylinderGeometry(0.045, 0.055, 0.24, 7);
    b1.translate(0.15 + i * 0.28, 1.63, -1.46);
    counterParts.push(b1);
    const b2 = new THREE.CylinderGeometry(0.05, 0.05, 0.20, 7);
    b2.translate(0.15 + i * 0.28, 2.09, -1.46);
    counterParts.push(b2);
  }
  const counterGeom = mergeList(counterParts);
  const counterPng = makeSolidOrPatternPng(64, 64, (x, y) => {
    const grain = ((x + y * 2) % 8) * 3;
    return [136 - grain, 86 - grain, 48 - grain, 255];
  });

  // Awning & signboard
  const awningSlope = new THREE.BoxGeometry(4.85, 0.10, 1.25);
  awningSlope.rotateX(0.24);
  awningSlope.translate(0, 2.52, 2.38);
  const signPanel = box(3.2, 0.52, 0.12, 0, 2.95, 1.98);
  const awningGeom = mergeList([awningSlope, signPanel]);
  const awningPng = makeSolidOrPatternPng(128, 64, (x) => {
    return Math.floor(x / 16) % 2 === 0 ? [218, 92, 46, 255] : [245, 240, 226, 255];
  });

  buildGlb(
    [
      {
        name: 'InteriorShell',
        materialName: 'ShopPlasterTile',
        geometry: shellGeom,
        pngBuffer: shellPng,
        roughness: 0.85,
      },
      {
        name: 'DoorPivot',
        materialName: 'ShopDoorGlassFrame',
        geometry: doorGeom,
        pngBuffer: doorPng,
        translation: [-0.84, 0.08, 1.79],
        roughness: 0.35,
      },
      {
        name: 'Balcao',
        materialName: 'ShopWoodCounter',
        geometry: counterGeom,
        pngBuffer: counterPng,
        roughness: 0.68,
      },
      {
        name: 'Awning',
        materialName: 'ShopAwning',
        geometry: awningGeom,
        pngBuffer: awningPng,
        roughness: 0.72,
      },
    ],
    'public/assets/models/props/estabelecimento_interior.glb',
  );
  shellGeom.dispose();
  doorGeom.dispose();
  counterGeom.dispose();
  awningGeom.dispose();
}

// 3. ACESSORIOS_PRENDA.GLB (Zungueira_Tabuleiro + Hair_LowFade)
{
  // Zungueira tray (Lathe flared bowl + 4 molded water bottles)
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.15, 0.0),
    new THREE.Vector2(0.25, 0.065),
    new THREE.Vector2(0.27, 0.075),
    new THREE.Vector2(0.24, 0.075),
    new THREE.Vector2(0.145, 0.014),
    new THREE.Vector2(0.0, 0.014),
  ];
  const trayBowl = new THREE.LatheGeometry(pts, 14);
  const trayParts = [trayBowl];
  const bottleOffsets = [
    [-0.08, 0.08],
    [0.08, 0.08],
    [-0.08, -0.07],
    [0.08, -0.07],
  ];
  for (const [bx, bz] of bottleOffsets) {
    const b = new THREE.CylinderGeometry(0.032, 0.034, 0.14, 8);
    b.translate(bx, 0.085, bz);
    trayParts.push(b);
  }
  const trayGeom = mergeList(trayParts);
  const trayPng = makeSolidOrPatternPng(64, 64, (x, y) => {
    const weave = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) * 18;
    return [196 - weave, 146 - weave, 64, 255];
  });

  // Low Fade sculpted hair crown
  const hairProfile = [
    new THREE.Vector2(0.0, 0.095),
    new THREE.Vector2(0.078, 0.095),
    new THREE.Vector2(0.102, 0.072),
    new THREE.Vector2(0.106, 0.032),
    new THREE.Vector2(0.098, 0.005),
    new THREE.Vector2(0.076, 0.0),
  ];
  const hairGeom = new THREE.LatheGeometry(hairProfile, 16);
  hairGeom.scale(0.95, 1.0, 1.08);
  const hairPng = makeSolidOrPatternPng(64, 64, (x, y) => {
    const curl = ((x * 7 + y * 13) % 11) * 2;
    return [22 + curl, 20 + curl, 20 + curl, 255];
  });

  buildGlb(
    [
      {
        name: 'Zungueira_Tabuleiro',
        materialName: 'ZungueiraTray',
        geometry: trayGeom,
        pngBuffer: trayPng,
        roughness: 0.78,
      },
      {
        name: 'Hair_LowFade',
        materialName: 'LowFadeHair',
        geometry: hairGeom,
        pngBuffer: hairPng,
        roughness: 0.92,
      },
    ],
    'public/assets/models/props/acessorios_prenda.glb',
  );
  trayGeom.dispose();
  hairGeom.dispose();
}
