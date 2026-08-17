# Tokens de design — `packages/ui/tokens`

Fundação de tokens de design do Commerce Platform (**UXF-001**), consumível por `packages/ui` e por `apps/admin`/`apps/fastcompre`. Este diretório contém **só** os tokens — nenhum componente, nenhum `package.json`, nenhuma integração com Admin/FastCompre. Isso é intencional: ver "Fronteira desta tarefa" no final.

## Direção de design

- **Editorial Contemporâneo** (Etapa B, congelada), na mesma linha de referência já registrada em `Architecture.md` (Apple/Stripe/Linear/Vercel/Notion): minimal, elegante, consistente.
- Neutros **tinta/grafite levemente quentes** — nunca cinza frio/azulado.
- **Um único acento verde-floresta/verde profundo**, usado de forma contida — não é uma paleta de marca extensa, é um acento.
- Mesma família cromática para Admin e FastCompre. Densidade diferente (compacto vs. confortável), não paleta diferente.
- Geist Sans para interface (ambos os apps). Source Serif 4 só para conteúdo editorial do FastCompre.
- WCAG 2.2 AA obrigatório — contraste é critério de aceite desta tarefa, verificado automaticamente por `check-contrast.mjs`.

## Primitivo vs. semântico

- **Primitivo** (`colors.css`): a rampa crua de cor — `--color-neutral-*`, `--color-green-*`, `--color-red-*`. Descreve o **valor** (matiz + luminosidade), nunca um papel de uso. Não deve ser consumido diretamente por componentes.
- **Semântico** (`semantic-colors.css`): o **papel de uso** — `--color-text-primary`, `--color-accent-fill-default`, `--color-focus-ring` etc. Cada token semântico resolve, via `var()`, para um primitivo. Componentes consomem exclusivamente a camada semântica.

### Por que `green-*`, não `forest-*`

Um token primitivo deve nomear o valor bruto, não uma intenção de marca — senão ele passa a carregar parte do papel que já pertence à camada semântica (`accent-*`), confundindo as duas camadas. `green-*` é descritivo e estável mesmo que o tom exato seja recalibrado no futuro dentro da mesma família; `forest-*` embutiria uma leitura de marca dentro do primitivo. "Verde-floresta" é a justificativa de escolha do acento — documentada aqui, nunca usada como nome de token. Segue a mesma convenção de `neutral-*` e `red-*`.

## Paleta primitiva (só os passos efetivamente criados)

Nenhum passo foi criado sem um consumidor semântico definido nesta tarefa — não existem passos "gerados só para completar a rampa".

### Neutros — tinta/grafite (hue ~30–40°, baixa saturação)

| Token | Hex |
|---|---|
| `--color-neutral-0` | `#FFFFFF` |
| `--color-neutral-25` | `#FCFCFB` |
| `--color-neutral-50` | `#F9F9F7` |
| `--color-neutral-100` | `#F3F2EE` |
| `--color-neutral-200` | `#E5E2DC` |
| `--color-neutral-300` | `#CDC7BE` |
| `--color-neutral-400` | `#ABA396` |
| `--color-neutral-500` | `#8B8072` |
| `--color-neutral-600` | `#70665A` |
| `--color-neutral-700` | `#595045` |
| `--color-neutral-800` | `#3F372F` |
| `--color-neutral-900` | `#29221C` |
| `--color-neutral-950` | `#1A1511` |

`--color-neutral-950` é o passo de ênfase máxima da rampa neutra — parte da escala estrutural, **não** um token criado para dark mode. Dark mode continua fora do escopo (ver seção própria abaixo).

### Verde-floresta — acento único, contido (hue ~146–155°)

Só os passos com uso semântico atribuído. `green-200/300/400/500/900` **não existem** — não há consumidor para eles nesta tarefa.

| Token | Hex | Consumidor semântico |
|---|---|---|
| `--color-green-50` | `#F0F9F6` | `accent-subtle-bg` |
| `--color-green-100` | `#DEF2E9` | reserva próxima de `green-50` (fundo sutil alternativo) |
| `--color-green-600` | `#2C7D53` | `accent-fill-default`, `focus-ring` |
| `--color-green-700` | `#1F633F` | `accent-fill-hover`, `accent-text` |
| `--color-green-800` | `#15492D` | `accent-fill-active`, `accent-subtle-text` |

### Vermelho — feedback de erro

| Token | Hex | Consumidor semântico |
|---|---|---|
| `--color-red-50` | `#FCF1F0` | `feedback-danger-subtle-bg` |
| `--color-red-600` | `#A42B23` | `feedback-danger-fill` |
| `--color-red-700` | `#852019` | `feedback-danger-text` |

`warning`/`info` deliberadamente fora do escopo — nenhuma tarefa já lida no backlog (`UXA-002`, `UXA-003`, `UXA-004`) exige essas cores por nome. Entram just-in-time quando um consumidor real existir, seguindo o mesmo princípio que o próprio backlog já aplica a componentes (`UXF-005`).

## Camada semântica

| Token semântico | Resolve para | Papel |
|---|---|---|
| `--color-text-primary` | `neutral-900` | texto principal |
| `--color-text-secondary` | `neutral-700` | texto secundário |
| `--color-text-muted` | `neutral-600` | texto normal/muted/helper — **nunca `neutral-500`** (3.87:1, abaixo de 4.5:1) |
| `--color-text-disabled` | `neutral-400` | isento de AA (WCAG); nunca o único indicador de estado desabilitado |
| `--color-text-inverse` | `neutral-0` | texto claro de uso geral sobre superfície escura futura (ver nota abaixo) |
| `--color-on-accent-text` | `neutral-0` | texto sobre `accent-fill-*` |
| `--color-on-danger-text` | `neutral-0` | texto sobre `feedback-danger-fill` |
| `--color-surface-page` | `neutral-25` | fundo de página |
| `--color-surface-raised` | `neutral-0` | superfície elevada (cards, inputs) |
| `--color-surface-subtle` | `neutral-50` | fundo sutil (hover/seleção) |
| `--color-border-subtle` | `neutral-200` | borda decorativa, sem requisito de contraste |
| `--color-border-default` | `neutral-300` | borda de repouso (inputs), sem requisito de contraste |
| `--color-border-meaningful` | `neutral-500` | borda informativa — precisa ≥3:1 (não-texto) |
| `--color-icon-muted` | `neutral-500` | ícone com significado próprio — precisa ≥3:1 (não-texto) |
| `--color-accent-fill-default` | `green-600` | preenchimento padrão do acento |
| `--color-accent-fill-hover` | `green-700` | hover do preenchimento |
| `--color-accent-fill-active` | `green-800` | active/pressed do preenchimento |
| `--color-accent-text` | `green-700` | texto/link de acento |
| `--color-accent-subtle-bg` | `green-50` | fundo sutil de destaque |
| `--color-accent-subtle-text` | `green-800` | texto sobre `accent-subtle-bg` |
| `--color-focus-ring` | `green-600` | anel de foco |
| `--color-feedback-danger-text` | `red-700` | texto de erro |
| `--color-feedback-danger-fill` | `red-600` | preenchimento de erro (botão destrutivo) |
| `--color-feedback-danger-subtle-bg` | `red-50` | fundo sutil de erro |

`--color-text-inverse` está declarado por completude semântica mas **não tem par de teste em `check-contrast.mjs`**: ainda não existe uma superfície semântica escura consumidora (`surface-inverse` não foi criada — sem uso definido). Seu uso atual sobre preenchimentos coloridos já é coberto por `on-accent-text`/`on-danger-text`, que têm tokens e testes próprios.

## Resultado do teste de contraste

19 pares avaliados numericamente (16 exigindo ≥4.5:1 para texto normal, 4 exigindo ≥3:1 para uso não-textual — anel de foco, borda/ícone significativos, indicador de erro), todos **PASS**. 3 pares adicionais documentados como deliberadamente isentos (texto desabilitado, bordas decorativas). Saída completa e reproduzível via:

```
node packages/ui/tokens/check-contrast.mjs
```

## Escala de spacing

Grid de 4px, primitivos únicos e compartilhados: `space-0`(0) `space-1`(4px) `space-2`(8px) `space-3`(12px) `space-4`(16px) `space-5`(20px) `space-6`(24px) `space-8`(32px) `space-10`(40px) `space-12`(48px) `space-16`(64px) `space-20`(80px) `space-24`(96px).

### Capacidade de densidade (Admin compacto / FastCompre confortável)

`spacing.css` define quatro aliases sensíveis a densidade (`--space-control-y`, `--space-control-x`, `--space-stack`, `--space-section-gap`) com valor default ("comfortable") em `:root` e override em `[data-density="compact"]`. **Isso é só a capacidade.** Nenhum app aplica o atributo `data-density` ainda — isso é trabalho do shell de cada app (ex. `UXA-006`, `UXW-001`). Nenhum componente é obrigado a consumir esses aliases: quem construir cada componente decide, tarefa a tarefa, se a abstração se aplica. UXF-001 não congela essa regra de consumo.

## Escala de radius

`radius-xs`(4px) `radius-sm`(6px) `radius-md`(8px) `radius-lg`(12px) `radius-xl`(20px) `radius-full`(9999px).

## Escala de elevação

4 níveis (`elevation-0` a `elevation-3`), sombra tingida com `--color-neutral-900` (`#29221C`) em baixa opacidade em vez de preto puro — mantém a mesma direção cromática também na sombra.

## Tokens tipográficos

`--font-family-sans` (Geist Sans, interface, ambos os apps) e `--font-family-serif` (Source Serif 4, só conteúdo editorial do FastCompre) + escala de tamanho/line-height (`xs` a `4xl`) + peso (`regular`/`medium`/`semibold`/`bold`).

### Carregamento de fontes (lacuna identificada, fora do escopo desta tarefa)

`typography.css` só declara os **nomes** das famílias — nenhum `next/font`, `@font-face` ou carregamento real de arquivo de fonte acontece aqui. Revisão do `UX-Implementation-Backlog.md` não encontrou nenhuma tarefa que nomeie explicitamente "carregar fontes via `next/font`". Os dois candidatos mais próximos, sem que nenhum assuma isso por nome:

- **UXF-005** (Primitives mínimos de prova) — primeiro lugar onde texto real é renderizado com o design system; candidato natural para Geist Sans.
- **UXW-009** (Página de Artigo: estrutura base) — seu critério de aceite já exige "tipografia editorial (Source Serif 4) aplicada ao corpo renderizado", o que na prática exige a fonte carregada, ainda que não nomeie o mecanismo.

Fica para decisão do usuário onde essa implementação pertence formalmente.

## Dark mode: só preparação arquitetural

Cada token semântico é uma indireção (`var(--color-neutral-XXX)`), nunca um valor literal repetido — isso é, deliberadamente, **toda** a preparação para dark mode desta tarefa. Nenhuma paleta escura foi criada, nenhum seletor `[data-theme="dark"]` existe. Uma tarefa futura poderia redeclarar os mesmos nomes semânticos sob um seletor de tema escuro sem alterar nenhum componente consumidor — é essa indireção, e só ela, que torna isso possível depois.

## Relação com Tailwind

Nenhum arquivo desta tarefa usa `@theme`. Todos os tokens — primitivos e semânticos — são CSS puro em blocos `:root`, válidos em qualquer motor, sem depender de nenhum processador. Essa é a **fonte canônica**: é o que `check-contrast.mjs` lê e resolve, e é o que qualquer consumidor futuro (com ou sem Tailwind) pode usar via `var()`.

`@theme` é sintaxe específica do Tailwind v4 para registrar tokens como utilitários gerados automaticamente. Introduzir `@theme` aqui, mesmo de forma inerte, criaria uma dependência conceitual do Tailwind dentro de uma tarefa que o próprio backlog reserva para depois: é a **UXF-004** ("Tailwind v4 consumindo `packages/ui` nos dois apps") que tem como objetivo declarado configurar o `content`/scanner do Tailwind apontando para este pacote. Registrar tokens em `@theme` é esse trabalho. UXF-001 entrega os tokens 100% agnósticos de ferramenta; a integração com Tailwind (e a decisão de usar ou não `@theme`) fica para quando essa integração de fato acontecer.

## Fronteira desta tarefa

- Nenhum `package.json`, `tsconfig.json` ou `src/index.ts` foi criado em `packages/ui` — isso é escopo da `UXF-002`.
- Nenhum arquivo de `apps/admin` ou `apps/fastcompre` foi alterado.
- Nenhuma integração com Tailwind (`UXF-003`/`UXF-004`) foi antecipada.
- Nenhum app aplica `data-density` ainda.
- Nenhuma fonte é carregada de fato (ver "Carregamento de fontes" acima).
