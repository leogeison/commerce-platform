# @commerce-platform/ui

Design system compartilhado do Commerce Platform — consumido por `apps/admin` e `apps/fastcompre`.

## Fronteira (normativa)

`packages/ui` pode conter:
- foundations e design tokens compartilhados (`tokens/`, UXF-001);
- primitivas visuais genéricas;
- componentes genéricos reutilizáveis;
- utilitários de acessibilidade compartilháveis.

`packages/ui` **nunca** contém componentes com conhecimento do domínio
Commerce Platform. Se um componente conhece conceitos como Artigo,
Produto, Oferta, Categoria ou Autor, ele permanece no app responsável
(`apps/admin` ou `apps/fastcompre`), não aqui.

**Pergunta-gate, antes de adicionar qualquer coisa a este pacote:**
"funcionaria num app sem nenhum conceito deste domínio?" Se a resposta
for não, o código pertence ao app, não a `packages/ui`.

A existência de uma possível reutilização futura não é justificativa
suficiente para promover código para cá. Reuso comprovado por um segundo
consumidor real é o critério (ver UXA-001/UXA-005).

## Estado atual

- `tokens/` (UXF-001): fundação de tokens de design — fonte única, CSS
  custom properties.
- `src/index.ts` (UXF-002): esqueleto do pacote como dependência de
  workspace — nenhum primitive real ainda.
- `src/probe.tsx` (UXF-004, subpath `@commerce-platform/ui/probe`):
  probe técnico de content-scanning cross-package do Tailwind — API
  técnica de probe/teste, **não** API de primitives do design system.
  Ver comentário do próprio arquivo e
  `scripts/verify-tailwind-cross-package-scan.mjs`.
- Primitives reais (Button, Skeleton/Badge, Text) entram na UXF-005.

## Estratégia de build

O pacote é pré-compilado para `dist/` via `tsc` (mesmo padrão de
`@commerce-platform/contracts`, com `tsconfig.json` usado só para
`typecheck: tsc --noEmit` e `tsconfig.build.json` responsável pela
emissão real). Isso é estritamente uma decisão de build/resolução
TypeScript/JS — independente de como o content-scanning do Tailwind em
`apps/admin`/`apps/fastcompre` alcança este pacote.

A UXF-004 decidiu essa segunda questão: `@source "../../../../packages/ui/src"`
em cada `globals.css` aponta para o **código-fonte** (`src/`), não para
`dist/` — o scanner do Tailwind lê o texto-fonte diretamente, sem
depender de um build prévio do pacote.

## Pendência: ponte tokens → Tailwind

Os tokens de `packages/ui/tokens/*.css` (UXF-001) continuam, depois da
UXF-004, sem nenhuma integração com o Tailwind — nenhum `@theme` foi
criado. O probe técnico de content-scanning (`src/probe.tsx`) usa
deliberadamente só utilities padrão do Tailwind (paleta/spacing do
próprio framework), nunca os tokens do projeto — evita duplicar valores
(HEX, spacing) que já têm `packages/ui/tokens/*.css` como fonte única de
verdade.

Antes de a UXF-005 consumir esses tokens através de utilities Tailwind
customizadas, alguém precisa fechar essa ponte — mapear os CSS custom
properties canônicos para `@theme` (ou mecanismo equivalente) sem criar
uma segunda fonte de verdade para os mesmos valores. Essa decisão
continua em aberto; nenhuma tarefa até aqui (UXF-001–004) a resolveu.

## Validação da UXF-002 (registro, não é passo de CI)

O critério de aceite ("os dois apps... importam sem erro um export de
prova") foi validado de forma efêmera, sem deixar nenhum arquivo
permanente em `apps/admin` ou `apps/fastcompre`:

1. **Resolução de tipos**, a partir de cada app: um arquivo `.ts`
   temporário importando `UiPackageSkeleton` de `@commerce-platform/ui`
   foi criado dentro de `src/`, verificado com `tsc --noEmit`
   (`pnpm --filter <app> typecheck`), e removido em seguida — nunca
   commitado.
2. **Resolução em runtime** de `dist/index.js`, a partir do
   `node_modules` de cada app (prova que o link de workspace do pnpm e
   os campos `main`/`exports`/`type` do `package.json` deste pacote
   realmente funcionam, independente do que o módulo exporta):
   `node -e "require('@commerce-platform/ui')"` executado a partir de
   `apps/admin/` e de `apps/fastcompre/`.

`export type UiPackageSkeleton = never;` prova só a resolução de tipos —
por ser type-only, é apagado na emissão e nunca chega a exercitar
`dist/index.js`. Por isso a prova de runtime acima existe separadamente,
sem depender de nenhum valor exportado.

Resultado (comandos e saída) registrado no relatório de fechamento da
UXF-002 — não como teste automatizado permanente, conforme o próprio
backlog define para esta tarefa ("Testes esperados: nenhum automatizado
— build/import é o próprio teste").
