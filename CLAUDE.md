# Commerce Platform — instruções para o Claude Code

Plataforma SaaS de conteúdo e marketing de afiliados (monorepo pnpm), começando pelo FastCompre.
Responda sempre em **português**. Mensagens de commit sempre em **inglês**.

## Documentos normativos

Consulte os documentos relevantes **antes** de investigar, propor ou implementar qualquer tarefa.

| Documento | Escopo |
|---|---|
| `docs/Architecture.md` | Arquitetura, regras de negócio, invariantes e decisões estruturais |
| `docs/Implementation-Backlog.md` | Backlog original do MVP (concluído) |
| `docs/UX-Implementation-Backlog.md` | Ciclo atual de UI/UX — referência operacional das tarefas `UXF-*`, `UXA-*`, `UXE-*`, `UXW-*`, `UXQ-*` |
| `docs/editorial/editorial-serialization-contract.md` | Editorial Serialization Contract (gate normativo do editor e do pipeline MDX) |
| `docs/UXW-visual-direction-decision.md` | Direção visual do FastCompre |
| `docs/a11y/wcag-aa-checklist.md` | Checklist manual WCAG 2.2 AA |

> `docs/Architecture.md` e `docs/Implementation-Backlog.md` precisam estar versionados no repositório. Se não existirem, **interrompa e avise** — nunca presuma o conteúdo deles de memória.

Em conflito real entre documentos, **não escolha uma interpretação sozinho**: identifique o conflito, explique o impacto e aguarde decisão.

## Regras gerais

- Nunca altere decisões arquiteturais por iniciativa própria.
- Nunca implemente fora do escopo da tarefa atual nem antecipe tarefas futuras; respeite pré-requisitos e dependências do backlog.
- Preserve comportamento existente que a tarefa não altera explicitamente.
- Não transforme melhoria de UI/UX em mudança de regra de negócio sem decisão explícita.
- Diante de inconsistência, ambiguidade, requisito ausente ou decisão arquitetural necessária: **pare, explique e aguarde decisão**.
- Melhorias não necessárias à tarefa: apresente separadamente, não implemente sem aprovação.
- Sem refatorações oportunistas fora do escopo.

## Fluxo obrigatório por tarefa

Cada tarefa é tratada isoladamente.

**Antes de implementar (fase de investigação — não altere arquivos, não instale dependências, não faça commit/push):**
1. leia a tarefa completa no backlog;
2. confirme os pré-requisitos;
3. investigue o código real relacionado;
4. compare o estado atual com os critérios de aceite;
5. identifique arquivos, contratos, testes e dependências afetados;
6. apresente o desenho técnico;
7. aponte riscos, ambiguidades e decisões pendentes;
8. liste os arquivos que pretende criar/modificar;
9. **aguarde aprovação**.

**Depois da aprovação:** implemente só a tarefa aprovada, respeite os critérios de aceite, rode os testes/verificações aplicáveis, **não faça commit/push** e aguarde validação. A próxima tarefa nunca está autorizada automaticamente.

## Continuidade entre sessões

O usuário normalmente informa a última tarefa concluída e a próxima. Use isso como ponto de partida, mas:
- confirme no backlog os pré-requisitos da tarefa atual;
- consulte o código real antes de propor alterações;
- use `git log`/`git status` quando relevante;
- nunca presuma que algo existe só porque uma conversa anterior disse;
- se o repositório contradisser o estado informado, **pare e reporte** antes de alterar qualquer arquivo.

## Proteção do working tree

- Rode `git status --short` antes de editar e identifique alterações preexistentes.
- Nunca sobrescreva, reverta, descarte ou inclua silenciosamente alterações que não pertencem à tarefa.
- Se uma alteração preexistente interferir, pare e informe.
- Nada de comandos destrutivos de Git sem autorização explícita.
- Ao sugerir commit, use `git add` com **caminhos explícitos** dos arquivos da tarefa.

## Implementação

- Código simples, limpo e coerente com a arquitetura; SOLID, Clean Code e DDD quando aplicáveis.
- Priorize clareza, manutenção, acessibilidade e comportamento verificável; sem otimização prematura.
- Preserve contratos existentes, salvo autorização explícita da tarefa.
- Toda mudança deve ser sustentada pelos critérios de aceite, não por preferência pessoal.

## UI/UX e Design System

Decisões congeladas que devem ser respeitadas: WCAG 2.2 AA verificável; FastCompre mobile-first; Admin orientado à produtividade editorial; feedback explícito de loading/erro/sucesso/salvamento/indisponível; navegação completa por teclado; foco visível e gestão de foco; responsividade e reflow; `prefers-reduced-motion` quando aplicável; performance medida, não presumida; regras de Role e máquina de estados editorial preservadas. Não reduza requisitos de acessibilidade ou UX para simplificar.

### `packages/ui`

Pode conter foundations/tokens, primitivas e componentes genéricos, utilitários de acessibilidade e padrões com reuso real comprovado. **Não** pode conter nada que conheça o domínio (Artigo, Produto, Oferta, Categoria, Autor). Reuso futuro possível não justifica promoção. Se a tarefa mandar manter local até existir um segundo consumidor real, respeite.

Tokens: `packages/ui/tokens/tailwind-theme.css` é `@theme inline` — seus aliases não existem como variáveis CSS em runtime. Em CSS Modules, use as variáveis semânticas de `packages/ui/tokens/semantic-colors.css` (ex.: `--color-text-primary`, `--color-accent-text`, `--color-focus-ring`). Não introduza hex novo.

## Editor editorial (Lexical)

- `Article.bodyMdx` continua sendo a persistência textual; conteúdo existente precisa continuar compatível.
- `ArticleProduct` é a única fonte estrutural de verdade sobre Produtos referenciados; blocos Produto/Oferta nunca criam segunda fonte.
- A máquina de estados do Artigo não muda por causa do editor; publicação e autorização continuam autoridade do backend.
- Não escolha nem altere silenciosamente a sintaxe customizada dos blocos.

### Editorial Serialization Contract

É gate obrigatório para tarefas que dependem dele. Consulte sempre a versão persistida em `docs/editorial/editorial-serialization-contract.md` (nunca memória/histórico). Nunca o altere durante uma tarefa dependente sem interromper e pedir aprovação.

## Acessibilidade

Faz parte dos critérios de implementação, não é auditoria posterior. Testing Library/jest-axe e Playwright/@axe-core são gates de regressão, **não** certificação WCAG. Preserve os critérios manuais (teclado, foco, leitor de tela, zoom/reflow, contraste, reduced motion). Nunca declare conformidade WCAG só porque o axe passou.

## Performance

Meça contra os budgets do backlog. Nunca relaxe, remova ou reinterprete um budget para fazer algo passar; registre desvios explicitamente e siga os gates previstos. Um desvio nunca fica escondido num relatório de tarefa concluída.

## Testes e regressão

- A suíte existente é patrimônio do projeto: não remova nem enfraqueça testes para fazer algo passar.
- Mudança legítima de comportamento → atualize os testes para o comportamento aprovado; comportamento novo → teste novo.
- Preserve os gates de unit, e2e, lint, typecheck, build, cobertura e acessibilidade.
- Diferencie falhas preexistentes de regressões.
- **Nunca declare uma verificação como executada se ela não foi executada.** Se o ambiente impedir, explique: qual verificação, por quê, o que foi validado no lugar e o que o usuário precisa validar.

## Segurança e contratos

Mudanças de UI/UX não podem enfraquecer: autorização, isolamento de tenant/Site, validações, regras de publicação, segurança do pipeline de conteúdo, política de upload, tracking de afiliados, redirecionamento ou contratos públicos. Qualquer mudança nessas fronteiras é arquitetural/funcional, não detalhe visual.

## Controle de versão

- Nunca faça commit ou push sem autorização explícita.
- Conventional Commits, em inglês; um commit por tarefa do backlog; nunca agrupe tarefas.
- Ao concluir uma tarefa validada, sugira **exatamente uma** mensagem de commit.

## Encerramento de tarefa

Relatório objetivo com: tarefa implementada; arquivos criados/modificados; comportamento implementado; decisões técnicas; testes/verificações executados e resultados; critérios de aceite atendidos; limitações/riscos/pendências reais; confirmação de que nenhuma tarefa futura foi antecipada; confirmação de que não houve commit/push. Depois, aguarde validação.

## Ambiente de desenvolvimento local

- Ubuntu, Node 22, pnpm (`packageManager` no `package.json` raiz).
- Portas fixas: **API 3000**, **Admin 3001** (`next dev -p 3001`), **FastCompre 3002** (`next dev -p 3002`).
  - `apps/api/.env`: `ADMIN_ORIGIN=http://localhost:3001`, `REVALIDATION_TARGET_URL=http://localhost:3002`.
  - `apps/fastcompre/.env.local`: `SITE_URL=http://localhost:3002`.
  - Se uma publicação não aparecer na Home/Categoria do FastCompre, verifique primeiro `REVALIDATION_TARGET_URL` — Home/Categoria/Artigo usam `fetchCache = 'force-cache'` (Data Cache persistido em disco) e só são invalidados pela revalidação.
- Infra local via `docker compose` (`docker-compose.yml`): Postgres 16 e storage S3-compatível de desenvolvimento.
- `.env`/`.env.local` não são versionados; os `.env.example` são a referência.

## Comandos

| Objetivo | Comando |
|---|---|
| Subir apps em dev | `pnpm dev:api`, `pnpm dev:admin`, `pnpm dev:fastcompre` |
| Lint (raiz) | `pnpm lint` |
| Typecheck (todos) | `pnpm typecheck` |
| Testes de um app | `pnpm --filter <api\|admin\|fastcompre> test` |
| E2E da API | `pnpm --filter api test:e2e` |
| A11y em browser real | `pnpm --filter <admin\|fastcompre> test:a11y` |
| Baseline visual | `pnpm --filter <admin\|fastcompre> test:visual-baseline` |
| Build | `pnpm build` |

Limitações conhecidas:
- O Jest do Admin **não carrega o ESM real de `@mdx-js/mdx`** (ver `compile-article-body.spec.ts`); estrutura do MDX real é verificada em browser real (harness `e2e-a11y`).
- `apps/*/e2e-visual/` é exclusivo para captura de screenshots (`toHaveScreenshot()`); asserts programáticos de apresentação ficam em `e2e-a11y/`, em arquivo próprio, separados dos specs de axe.
- No jsdom, `DragEvent`/`ClipboardEvent` não existem — testes de paste no Lexical precisam de shim local ao bloco de teste.
