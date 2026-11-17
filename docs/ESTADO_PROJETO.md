# Estado do Projeto — ANGOLA VIRTUAL

**Fase Atual**: Fase 3 — Personagem Principal Realista Jogável (Prenda, Unidade de Vizinhança n.º 1, Luanda)  
**Data de Referência**: 16 de Novembro de 2026

## 1. O que foi construído e funciona efetivamente

- **Base Geográfica e Cartográfica (`CARTOGRAFIA/LUANDA/PRENDA/UV_01/`)**:
  - Ponto de referência publicado `08°50'10" S, 13°13'26" E` projetado em **WGS84 (EPSG:4326)** e **UTM Zona 33 Sul (EPSG:32733)**.
  - **34 polígonos de edifícios reais OpenStreetMap**: os **22 blocos habitacionais históricos** do Prenda (incluindo *Lote 1* a *Lote 6*) e **12 edifícios cívicos/comerciais** (*Mesquita do Prenda* com `building:levels=2` confirmado no OSM, *Supermercado Kibabo*, *Supermercado Magnite*, *Hospital do Prenda*, *Colégio*).
  - **133 segmentos viários reais** classificados na hierarquia **7V** (`V3`, `V4`, `V5`, `V6`, `V7`), **20 cruzamentos e impasses V6**, **42 espaços públicos/barreiras OSM** e **24 registos de ocupação contemporânea**.
- **Ambiente Urbano 3D Explorável (`WorldEngine` + `Prenda*Builders`)**:
  - Terreno contínuo de Luanda (`1800x1800m`) com textura procedural *terra vermelha* e relevo navegável (`groundHeightAt` + *raycast* sobre passeios, faixas de rodagem e caminhos pedonais).
  - Rede viária 7V com passeios elevados, marcações rodoviárias em vias V3, cruzamentos e bolsas de estacionamento.
  - Edifícios modernistas multi-componente com embasamento ancorado ao terreno, piso térreo sobre **pilotis**, núcleo de circulação vertical com **cobogó**, lâminas verticais de **brise-soleil**, platibanda de cobertura, depósitos de água e adaptações contemporâneas no rés-do-chão (*cantinas*/toldos).
  - Mobiliário urbano e vegetação instanciada: bancas de comércio na zona de mercado/V4, campo multiusos comunitário, candeeiros em vias V3–V5, acácias e palmeiras filtradas fora dos edifícios e faixas de rodagem.
- **Personagem Principal Realista (`CharacterEngine` + `CharacterRigLoader` + `CharacterLocomotionController`)**:
  - Modelo humano masculino adulto em GLB comprimido com Meshopt (`/public/assets/models/characters/prenda_protagonist.glb`, variante `Black_M_3_Casual.glb` da biblioteca *UCF/Google VALID* — **Licença MIT**, 58 724 triângulos, 7 malhas `SkinnedMesh` com rosto, olhos, boca/dentes, orelhas, cabelo, mãos com dedos individualizados, vestuário e calçado PBR).
  - Esqueleto humanoide funcional de **84 ossos** e bundle de animações `/public/assets/animations/prenda_locomotion.json` (`idle` civil natural em repouso, `walk` e `run` com transições suaves por mistura de pesos e sincronização `timeScale` anti-deslizamento, extraídos/retargetizados de `Soldier.glb` / Mixamo no repositório oficial `mrdoob/three.js`).
  - Slots preparados para animações futuras (`sit`, `jump`, `enterVehicle`, `drive`, `interact`) e perfil extensível em `CharacterCustomization.ts` (rosto, cabelo, barba, tom de pele, vestuário, calçado, acessórios e estrutura corporal).
  - Locomoção 3D integrada com colisão OBB 2D contra os 34 edifícios, assentamento exato nos passeios e faixas via *raycast* (`sampleGroundHeight`), sombra de contacto no chão e passos procedurais no `AudioEngine`.
- **Exploração em 3.ª Pessoa, Inspeção e Controlos Android (`ThreeViewportController` + `TouchControls`)**:
  - Câmara de acompanhamento em **3.ª Pessoa** centrada no protagonista com órbita tátil/rato, compensação de obstáculos (*wall pull-in*) e altura mínima acima do solo, além de contrato preparado para futura câmara em **1.ª Pessoa** e modo **Inspeção Livre** (`[V]`).
  - Controlos táteis Android: joystick virtual esquerdo de 360°, botão de corrida (`Acelerar movimento`), reposição de câmara (`[R]`) e arrasto para orbitar; suporte completo para teclado (`WASD`/Setas, `Shift`, `V`, `R`, `E`, `M`, `I`, `P`).
- **Fundação da Fase 1 Preservada**: 12 módulos em `src/modules/`, `SaveSystem` IndexedDB, `PerformanceMonitor`, `AudioEngine`, `InputManager`.

## 2. Módulos em Base Técnica ou Contratos Pendentes

- **Base Técnica**: `GameplayEngine` (estados `title` / `playing` / `paused`), `AudioEngine` (tons UI e passos procedurais).
- **Contratos para Fases Seguintes**: `VehicleEngine`, `NpcEngine`, `EconomyEngine`, `CareerEngine`, `SocialEngine`, `MultiplayerService` (WebSocket), `PhysicsAdapter` (Rapier 3D WASM), persistência remota PostgreSQL e ações futuras do personagem (`sit`, `jump`, `enterVehicle`, `drive`).

## 3. Integridade Geográfica e Pendências

- **Confirmado**: Ponto `08°50'10" S, 13°13'26" E`, traçado viário OSM, 34 polígonos de edifícios OSM, 2 pisos na *Mesquita do Prenda* (`building:levels=2`).
- **Base Histórica (1963–1965)**: Referências HPIP / Simões de Carvalho / *Modernism in Africa* / *Optimistic Suburbia?* (22 de 28 blocos construídos, sistema 7V, tipologias Tipo A 12P, A2/A3, B1 7P, D1 7P, D2 6P e torres 16P).
- **Por Confirmar / Pendente**: Número exato de pisos e tipologia individual de cada um dos 22 blocos (apresentados com etiqueta explícita de hipótese zonal HPIP na ficha de inspeção), cotas altimétricas cadastrais oficiais e modelos `.glb`/`.gltf` fotogramétricos.
