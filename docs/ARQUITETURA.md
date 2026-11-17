# Arquitetura Técnica — ANGOLA VIRTUAL (Fase 3 · Personagem Principal em Prenda UV n.º 1)

## 1. Visão Geral

**ANGOLA VIRTUAL** é um videojogo 3D de mundo aberto concebido prioritariamente para dispositivos móveis Android, iniciando o território jogável em **Luanda — Unidade de Vizinhança n.º 1 do bairro Prenda** (`08°50'10" S, 13°13'26" E`).

A arquitetura modular das Fases 1 e 2 é integralmente preservada sem dependências circulares, acrescentando na Fase 3 o protagonista humano 3D articulado:
1. **Núcleo (`src/core/`)**: Contratos TypeScript, `EventBus`, `EngineRegistry` e `PerformanceMonitor`.
2. **Motor de Renderização (`src/engine/`)**: `ThreeViewportController` (câmara em `third-person` centrada no protagonista com órbita, *wall pull-in*, distância mínima de segurança e contrato futuro para 1.ª pessoa, mais `free-inspect` e sobrevoo aéreo inicial) e fachada de composição `AngolaVirtualEngine`.
3. **Personagem Principal (`src/modules/character/`)**: `CharacterEngine`, `CharacterRigLoader` (carregamento GLB com `MeshoptDecoder`, calibração PBR Android e sombra de contacto), `CharacterLocomotionController` (física pura testável, mistura suave `idle`/`walk`/`run`, sincronização anti-deslizamento) e `CharacterCustomization` (slots para rosto, cabelo, vestuário e ações futuras).
4. **Cartografia Digital (`CARTOGRAFIA/LUANDA/PRENDA/UV_01/`)**: Ficheiros GeoJSON em `EPSG:4326` (WGS84) e `EPSG:32733` (UTM Zona 33 Sul), manifestos de modelos 3D (`manifesto_personagem_fase3.json`) e texturas.
5. **Construtores Urbanos (`src/modules/world/`)**: `PrendaCartography`, `PrendaTerrainAndRoadsBuilder` (sistema 7V + `walkableSurfaceMeshes` para assentamento exato de pés), `PrendaBuildingsBuilder` (22 blocos modernistas + 12 edifícios cívicos/comerciais OSM), `PrendaUrbanPropsBuilder` e `SectorManager` (setores de `128m`, LOD Android e filtro histórico/atual).
6. **Recursos PBR (`src/resources/`)**: `AssetManager` (GLTF + `MeshoptDecoder` + JSON em cache), `MaterialLibrary` e `PrendaTextures`.
7. **Entrada Unificada (`src/input/`)**, **Física (`src/physics/`)**, **Áudio (`src/modules/audio/`)**, **Persistência IndexedDB (`src/modules/save/`)** e **Interface Android (`src/modules/ui/`)**.

## 2. Organização Cartográfica, Recursos 3D e Módulos

```text
public/assets/
├── models/characters/prenda_protagonist.glb   (Black_M_3_Casual · MIT · Meshopt · 84 ossos)
└── animations/prenda_locomotion.json          (idle + walk + run sincronizados)

CARTOGRAFIA/LUANDA/PRENDA/UV_01/
├── EDIFICIOS/edificios_uv01.geojson
├── RUAS/ruas_7v_uv01.geojson
├── CRUZAMENTOS/cruzamentos_uv01.geojson
├── LOTES/lotes_uv01.geojson
├── ESPACOS_PUBLICOS/espacos_publicos_uv01.geojson
├── CONSTRUCOES_INFORMAIS/ocupacao_contemporanea_uv01.geojson
├── MODELOS_3D/
│   ├── manifesto_modelos.json
│   └── manifesto_personagem_fase3.json
├── TEXTURAS/manifesto_texturas.json
└── GEOJSON/
    ├── uv01_referencia_e_perimetro.geojson
    └── uv01_cartografia.json
```

## 3. Regras de Dependência e Desempenho Android

- `src/core/` permanece isolado sem importar módulos de domínio.
- Instanciação em lote (`THREE.InstancedMesh`) para elementos urbanos e compressão `EXT_meshopt_compression` + texturas WebP embutidas no protagonista (`prenda_protagonist.glb`, 1,9 MB), mantendo orçamento Android reduzido em draw calls e memória VRAM.
- Atualização de telemetria React limitada a ~4Hz; zero `backdrop-filter` sobre a tela WebGL2; `afterDraw` preservado para Software WebGL.
