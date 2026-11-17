# Registo de Decisões Arquiteturais (ADR) — ANGOLA VIRTUAL

## ADR-001 a ADR-004 (Fase 1 — Preservados)
Mantêm-se integralmente as decisões da Fase 1: isolamento `ThreeViewportController` ↔ React, `AssetManager` com descarte explícito, `SaveSystem` IndexedDB e ausência de cubos/esferas/cones provisórios.

## ADR-005: Projeção Cartográfica Dupla WGS84 (EPSG:4326) ↔ UTM 33 Sul (EPSG:32733)
Para alinhar a cartografia real do bairro Prenda com métricas exatas em metros no mundo Three.js (`+X` Este, `-Z` Norte), implementou-se conversão analítica WGS84 ↔ UTM Zona 33 Sul em `src/modules/world/luandaCoordinates.ts`, mantendo `08°50'10" S, 13°13'26" E` como âncora local `(0, 0)`.

## ADR-006: Empacotamento Cartográfico Dual (`.geojson` + `uv01_cartografia.json`)
Os ficheiros geográficos canónicos residem em `CARTOGRAFIA/LUANDA/PRENDA/UV_01/*/*.geojson`. Para compatibilidade direta entre Vite, TypeScript (`resolveJsonModule`) e executor Node (`tsx --test`), um bundle sincronizado `GEOJSON/uv01_cartografia.json` é importado estaticamente sem pedidos HTTP sujeitos a 404.

## ADR-007: Arquitetura Modernista Tropical Composta e Otimizada para Android
Em conformidade com a proibição de cubos/esferas simples, cada bloco habitacional do Prenda é construído a partir da planta poligonal real OSM (`ExtrudeGeometry` com UVs métricos por piso de `2.95m`) combinada com embasamento enterrado no terreno, pilotis instanciados, núcleo recuado de *cobogó*, *brise-soleil* verticais, consola de cobertura e adaptações contemporâneas no rés-do-chão, mantendo orçamento reduzido de draw calls via `InstancedMesh` e `mergeGeometries`.

## ADR-008: Honestidade Tipológica na Inspeção 3D
Sempre que o OpenStreetMap não fornece `building:levels` para um dos 22 blocos residenciais, o sistema exibe explicitamente na ficha técnica do edifício que o polígono é real (OSM), mas a tipologia (A/B1/D1/D2/16P) e a estimativa de pisos constituem hipótese zonal baseada em HPIP/*Modernism in Africa*, pendentes de validação cadastral.

## ADR-009: Protagonista Humano GLB Local (UCF/Google VALID) + Bundle de Animações Retargetizadas
Para evitar qualquer boneco geométrico provisório e garantir carregamento determinístico offline/sem 404 em Android, integrou-se localmente o modelo `Black_M_3_Casual.glb` (`c-frame/valid-avatars-glb`, Licença MIT) comprimido com Meshopt (`MeshoptDecoder`). As animações `walk` e `run` (de `Soldier.glb` / Mixamo em `mrdoob/three.js`) foram pré-retargetizadas para os 84 ossos exatos com calibração de `Hips.position.y` e emparelhadas com um ciclo `idle` civil natural em `/public/assets/animations/prenda_locomotion.json`, preservando a pose de repouso original do GLB sem invocar `skeleton.pose()`.

## ADR-010: Assentamento Pedonal em Passeios e Faixas via Raycast (`walkableSurfaceMeshes`)
Como os passeios (`+0.23m`/`+0.25m`), vias (`+0.16m`/`+0.18m`) e caminhos (`+0.19m`) do Prenda têm espessura própria acima da função analítica `groundHeightAt`, `WorldEngine.sampleGroundHeight` efetua *raycast* descendente sobre `walkableSurfaceMeshes` para que as solas do protagonista assentem exatamente sobre passeios e asfalto sem enterrar os tornozelos.

