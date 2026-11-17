# Plano de Testes — ANGOLA VIRTUAL (Fase 3 · Personagem Principal em Prenda UV n.º 1)

## 1. Testes Unitários de Lógica Pura (`node:test` via `tsx`)

| Ficheiro de Teste | Cobertura | Comando |
| --- | --- | --- |
| `src/core/EventBus.test.ts` | Entrega tipada de eventos e remoção de listeners sem fugas. | `npx --yes tsx --test src/core/EventBus.test.ts` |
| `src/core/PerformanceMonitor.test.ts` | Cálculo de FPS médio e recomendação adaptativa Android (`low`/`medium`/`high`). | `npx --yes tsx --test src/core/PerformanceMonitor.test.ts` |
| `src/modules/world/luandaCoordinates.test.ts` | Conversão WGS84 ↔ UTM 33 Sul (`EPSG:32733`), origem `08°50'10" S, 13°13'26" E` e `groundHeightAt`. | `npx --yes tsx --test src/modules/world/luandaCoordinates.test.ts` |
| `src/modules/world/PrendaCartography.test.ts` | Carga dos 34 edifícios (22 blocos históricos), 133 troços 7V, colisão OBB 2D e deteção de via mais próxima. | `npx --yes tsx --test src/modules/world/PrendaCartography.test.ts` |
| `src/modules/character/CharacterLocomotion.test.ts` | Rotação pelo menor arco, pesos de mistura `idle`/`walk`/`run`, sincronização `timeScale`, cadência de passo e bloqueio por colisão OBB. | `npx --yes tsx --test src/modules/character/CharacterLocomotion.test.ts` |
| `src/modules/save/SaveSystem.test.ts` | Sanitização de esquema de gravação e persistência com fallback em memória. | `npx --yes tsx --test src/modules/save/SaveSystem.test.ts` |

## 2. Verificação Estática e Compilação

- **Verificação TypeScript**: `npm run lint` (`tsc --noEmit`).
- **Build de Produção Vite**: `npm run build` (`vite build`).

## 3. Verificação Visual e Interativa em Navegador Real (`playwright-cli`)

1. **Ecrã Inicial e Nascimento do Protagonista (Desktop 1440×900)**:
   - Confirmar carregamento HTTP 200 de `prenda_protagonist.glb` e `prenda_locomotion.json`, zero erros de consola e sobrevoo aéreo da UV n.º 1 do Prenda.
   - Com `?autostart=1`, validar `data-char-rig="ready"` imediato, personagem humana adulta visível com pés assentes em cima do passeio, braços relaxados em `idle` e >85% da viewport livre.
2. **Locomoção, Câmara e Inspeção (`data-state === "playing"`)**:
   - Confirmar transição `Repouso` -> `A caminhar` (`W`) -> `A correr` (`W + Shift`), rotação suave (`A`/`D`), colisão OBB em edifícios, alternância de câmara (`[V]`) e reposição (`[R]`).
   - Confirmar na gaveta técnica (`[I]`) que o módulo `Character Engine` aparece como `Personagem Jogável (Fase 3)`.
   - Testar seleção de edifício com ficha UTM 33S / WGS84 e filtros de camada (`Base 1965` / `Atual` / `Tudo`).
3. **Ecrãs Android (Horizontal 844×390 e Vertical 390×844 com `?autostart=1`)**:
   - Em `844×390`: confirmar barra inferior colapsada automaticamente (`< 520px`), joystick tátil esquerdo funcional, botões `Acelerar` e `Repor vista` `>= 44px` sem sobreposição e `0` erros WebGL.
   - Em `390×844`: confirmar aviso não-bloqueante de orientação horizontal acima da zona do polegar e layout íntegro sem scroll horizontal.
