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
- `tokens/tailwind-theme.css` (UXF-005): adapter Tailwind v4 dos tokens
  acima — ver seção "Ponte tokens → Tailwind" abaixo.
- `src/index.ts` (UXF-002, substituído na UXF-005): esqueleto do pacote
  como dependência de workspace — o export type-only de prova
  (`UiPackageSkeleton`) foi substituído pelos exports reais dos
  primitives.
- `src/probe.tsx` (UXF-004, subpath `@commerce-platform/ui/probe`):
  probe técnico de content-scanning cross-package do Tailwind — API
  técnica de probe/teste, **não** API de primitives do design system.
  Ver comentário do próprio arquivo e
  `scripts/verify-tailwind-cross-package-scan.mjs`.
- `src/components/{text,button,skeleton}.tsx` (UXF-005): os três
  primitives mínimos de prova do design system — `Text`, `Button`,
  `Skeleton`. Ver comentário de cada arquivo para a API e o raciocínio de
  escopo mínimo (derivado do primeiro consumidor real previsto, Categoria
  em `apps/admin`).
- `lucide-react` (UXF-006): dependência de ícones resolvida — ver seção
  "Ícones" abaixo. Nenhum primitive a consome ainda.

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

## Ponte tokens → Tailwind (UXF-005)

Fechada nesta tarefa, via `tokens/tailwind-theme.css`, importado em cada
`globals.css` logo após `tokens/index.css`:

```css
@import "tailwindcss";
@import "../../../../packages/ui/tokens/index.css";
@import "../../../../packages/ui/tokens/tailwind-theme.css";
@source "../../../../packages/ui/src";
```

Mecanismo: `@theme inline` do Tailwind v4, referenciando via `var()` as
custom properties já declaradas em `colors.css`/`semantic-colors.css`/
`typography.css`/`spacing.css`/`radius.css` — nenhum HEX, px, rem ou peso
numérico é duplicado em `tailwind-theme.css`. `packages/ui/tokens/*.css`
continua sendo a única fonte canônica de valores; o arquivo da ponte é
só um adapter de nomenclatura Tailwind.

Nomes das utilities geradas são **deliberadamente distintos** dos nomes
dos tokens de origem (ex.: `bg-accent` → `var(--color-accent-fill-default)`,
nunca `--color-accent-fill-default: var(--color-accent-fill-default)`) —
investigação da UXF-005 provou com `tailwindcss@4.3.3` real que
autorreferência same-name funciona hoje (cascade layers: declaração sem
`@layer` sempre vence declaração com `@layer`, e `tokens/*.css` nunca usa
`@layer`), mas essa é uma propriedade estrutural em que decidimos não nos
apoiar — nomes distintos não dependem de nenhuma sutileza de cascata.

Escopo **mínimo**: só os tokens efetivamente consumidos por `Text`/
`Button`/`Skeleton` (ver `tokens/tailwind-theme.css` para a lista
completa e comentada). Qualquer token novo exposto aqui exige um
consumidor real — nunca especulativo.

## Ícones (UXF-006)

`lucide-react` está disponível como `dependency` de `@commerce-platform/ui`
(não `peerDependency`, não instalado em `apps/admin`/`apps/fastcompre`) —
resolvido e pronto para uso por primitives futuros. Nenhum re-export,
facade ou subconjunto nomeado de ícones existe ainda, e nenhum dos três
primitives (`Text`/`Button`/`Skeleton`) foi alterado por esta tarefa —
nenhum consumidor real precisa de ícone hoje; promoção de um subconjunto
só ocorre quando um consumidor real exigir (mesmo critério já usado em
outras partes deste pacote, ex. UXA-001/UXA-005).

Requisito de acessibilidade, em termos de **resultado** (não de
implementação específica):

- **Ícone decorativo:** deve permanecer fora da árvore de acessibilidade
  (`aria-hidden="true"`) — comportamento padrão do próprio Lucide, sem
  configuração adicional.
- **Ícone funcional sem texto visível** (ex.: botão só-ícone): o elemento
  interativo que o envolve precisa ter nome acessível; o ícone em si
  continua decorativo. Texto visualmente oculto associado ao controle é
  o padrão preferido neste projeto (mesmo mecanismo já usado no CTA de
  afiliado planejado para o FastCompre), mas **não** é a única forma
  tecnicamente válida de produzir esse nome acessível — `aria-label` no
  próprio controle, por exemplo, também satisfaz o requisito.

### Validação da UXF-006 (registro, pendente de execução local)

Procedimento de prova aprovado — efêmero, sem nenhum arquivo permanente:

1. Instalar a dependência com `pnpm install` na raiz do repositório.
2. Criar um arquivo temporário `src/__uxf006-proof.spec.tsx`:

   ```tsx
   import { render, screen } from '@testing-library/react';
   import { House } from 'lucide-react';

   describe('UXF-006 — prova efêmera (não commitada)', () => {
     it('ícone decorativo renderiza com aria-hidden="true" por padrão do Lucide', () => {
       const { container } = render(<House />);
       expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
     });

     it('controle somente-ícone tem nome acessível e o SVG continua decorativo por padrão', () => {
       render(
         <button type="button">
           <House />
           <span className="sr-only">Ir para o início</span>
         </button>,
       );
       const btn = screen.getByRole('button', { name: 'Ir para o início' });
       expect(btn).toBeInTheDocument();
       expect(btn.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
     });
   });
   ```

   Nenhum `aria-hidden` é passado manualmente ao ícone em nenhum dos dois
   cenários — a asserção verifica o comportamento padrão real do pacote
   instalado, não fornece manualmente o que a prova deveria comprovar.
3. Rodar `pnpm --filter @commerce-platform/ui test -- __uxf006-proof`.
4. Registrar o resultado real aqui.
5. Apagar `src/__uxf006-proof.spec.tsx` e confirmar com
   `git status --porcelain src` que nada ficou pendente, antes de
   qualquer commit.

**Não executado neste ambiente**: o `device_bash` usado nesta sessão não
tem `pnpm` disponível (confirmado: `pnpm --version` → `command not found`),
só `npm`. Como o lockfile só pode mudar via `pnpm install` (decisão já
registrada), a dependência não pôde ser instalada aqui, e por consequência
os passos 1–4 acima (instalação, execução da prova, `typecheck`, `build`)
não puderam ser executados nem seu resultado registrado. Passo 5 (remoção)
não se aplica ainda, pois o arquivo temporário nunca chegou a ser criado
neste ambiente. Esta seção deve ser atualizada com o resultado real depois
da execução local.

## Pendência: carregamento real de fontes

`Text`/`Button` usam `font-ui` → `var(--font-family-sans)` ("Geist
Sans"), mas nenhum carregamento real de fonte (`next/font`, `@font-face`)
acontece — nem nesta tarefa nem em nenhuma anterior. `packages/ui` não
tem e não deve ganhar conhecimento de `next/font` (fronteira normativa:
não é um app Next.js). O fallback declarado no próprio token
(`ui-sans-serif, -apple-system, ...`) cobre a ausência de carregamento
sem quebrar. Essa pendência normativa **continua em aberto** após a
UXF-005, sem tarefa dona ainda no backlog atual — mesma lacuna já
registrada por `packages/ui/tokens/README.md`.

## Testes — `jest-axe` deferido para a UXF-007

`packages/ui` tem `jest.config.ts` próprio (`ts-jest` + `jest-environment-jsdom`,
já que não é uma app Next.js e não pode reaproveitar `next/jest`).
Os specs de `Text`/`Button`/`Skeleton` cobrem renderização, variantes/
tons, interação (clique, `disabled`), os invariantes de `type="button"`
default e `aria-hidden="true"` do `Skeleton`, e composição de `className`
— tudo via `@testing-library/react`/`user-event`/`jest-dom`.

**Não incluem `jest-axe`** — decisão explícita desta tarefa. A
verificação automatizada de acessibilidade (`jest-axe`) destes três
componentes é entregue pela **UXF-007** ("Gate de acessibilidade
automatizada, camada 1"), que depende desta tarefa e adiciona esses
testes aos componentes já existentes, sem reabri-los estruturalmente.

## Prova visual/cross-app

Sem rota nova: as rotas técnicas `/tailwind-scan-probe` (Admin e
FastCompre, nascidas na UXF-004) foram estendidas para também renderizar
`Text`, `Button` e `Skeleton`, preservando o `TailwindScanProbe` original
e o `noindex` já existente no FastCompre. Prova que os três primitives
renderizam corretamente nos dois apps através da mesma ponte
tokens→Tailwind, sem scaffolding descartável.

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

`export type UiPackageSkeleton = never;` provou só a resolução de tipos —
por ser type-only, era apagado na emissão e nunca chegava a exercitar
`dist/index.js`. Por isso a prova de runtime acima existiu separadamente,
sem depender de nenhum valor exportado. Esse export foi substituído pelos
primitives reais na UXF-005 (ver "Estado atual").

Resultado (comandos e saída) registrado no relatório de fechamento da
UXF-002 — não como teste automatizado permanente, conforme o próprio
backlog define para esta tarefa ("Testes esperados: nenhum automatizado
— build/import é o próprio teste").
