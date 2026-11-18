# Commerce Platform

Motor multi-marca de conteúdo e afiliação. A primeira marca é o **FastCompre** (fastcompre.com), voltado ao público brasileiro.

As decisões de arquitetura, os backlogs e os contratos normativos do projeto estão versionados em [`docs/`](#documentação).

## Status

- **MVP concluído:** fases 1 a 15 do `docs/Implementation-Backlog.md`, com o marco `MVP-M01` atingido (produto ponta a ponta, do login administrativo à navegação pública e ao clique de afiliado).
- **Ciclo UI/UX concluído:** marcos `UX-M01` a `UX-M06` do `docs/UX-Implementation-Backlog.md`, com `UX-M06 UI/UX Complete` formalmente fechado. O `UX-M05` foi fechado por waiver formal do PO, com o desvio de LCP documentado em `docs/performance/final-uxq-007.md`.
- **Próxima fase:** infraestrutura de produção, ainda não definida. Nada neste README descreve um ambiente de produção.

## Stack tecnológica

- **Monorepo:** pnpm workspaces (`pnpm@11.17.0`), TypeScript em modo `strict`, ESLint via `@leogeison/eslint-config`.
- **`apps/api`:** NestJS 11, Prisma 7 (generator `prisma-client` com driver adapter `@prisma/adapter-pg`), PostgreSQL 16, `nestjs-pino`, Zod 4, Jest 30 (unitários e e2e com `supertest`).
- **`apps/admin`:** Next.js 16 (App Router) e React 19. Painel administrativo autenticado (Dashboard, Artigos, Produtos/Ofertas, Categorias, Autores), com editor de Artigo em Lexical e preview do MDX.
- **`apps/fastcompre`:** Next.js 16 (App Router) e React 19. Site público (Home, Categoria, Artigo, `sitemap.xml`, `robots.txt`, JSON-LD de Article/Product).
- **`packages/contracts`:** schemas e tipos Zod compartilhados entre a API e os frontends.
- **`packages/ui`:** design tokens (Tailwind v4 + CSS custom properties) e primitivas genéricas de UI, sem conhecimento de domínio.
- **`packages/editorial`:** gramática e validação dos blocos editoriais do `bodyMdx`, compartilhadas pelo Admin e pelo FastCompre.
- **Qualidade:** Testing Library + `jest-axe`, Playwright + `@axe-core/playwright` (acessibilidade em browser real) e Playwright `toHaveScreenshot()` (regressão visual).

## Arquitetura

Visão resumida. A referência completa é `docs/Architecture.md`.

- **Separação de apps:** `apps/api` é o único ponto de acesso ao PostgreSQL. `apps/admin` e `apps/fastcompre` consomem a API via HTTP.
- **Multi-tenancy:** isolamento por `siteId` em todas as tabelas de conteúdo, com chaves compostas `[id, siteId]` que impedem fisicamente vínculos entre Sites diferentes. `TenantContext` é imutável e resolvido por funções puras.
- **Banco de dados:** 11 modelos e 4 enums (`Role`, `Marketplace`, `ArticleType`, `ArticleStatus`), migrados via `prisma migrate`.
- **Editorial:** a máquina de estados do Artigo (`DRAFT`, `PENDING_REVIEW`, `PUBLISHED`, `ARCHIVED`, com as transições válidas em `docs/Architecture.md`) e a autorização por Role (`VIEWER`/`EDITOR`/`OWNER`) são autoridade exclusiva da API. `Article.bodyMdx` é a persistência textual do corpo, e `ArticleProduct` é a única fonte estrutural de verdade sobre os Produtos referenciados (ver `docs/editorial/editorial-serialization-contract.md`).
- **Infraestrutura HTTP (`apps/api/src/shared/http`):** erro padronizado (`ApiError`), validação Zod, cookie de sessão seguro (`HttpOnly`, `Secure`, `SameSite=Lax`), CORS restrito à origem do Admin, `OriginGuard` em rotas de escrita, rate limit (login e redirect de afiliado) e logging estruturado com `x-request-id`.
- **Tracking:** `GET /r/:siteSlug/:offerId` é o único redirecionador de afiliado. Registra o `AffiliateClick` e responde `302` para a `affiliateUrl` real, ou `410` se a Oferta estiver arquivada. Uma Oferta com cliques não pode ser excluída fisicamente (`409`).
- **Uploads:** `POST /admin/sites/:siteSlug/uploads/images` (Role mínima `EDITOR`), com MIME validado por magic bytes (JPEG/PNG/WebP), limite de 5 MiB e nome gerado pelo servidor. Finalidades: `PRODUCT`, `ARTICLE_COVER` e `AUTHOR_AVATAR` (URL gravada no campo do recurso) e `ARTICLE_BODY_IMAGE` (URL persistida dentro do `bodyMdx`). O armazenamento passa por uma porta explícita (`StoragePort`), implementada por `S3StorageAdapter` (qualquer provedor S3-compatível).
- **API pública (sem sessão, Site resolvido por `siteSlug`):**
  - `GET /public/sites/:siteSlug/articles` e `GET /public/sites/:siteSlug/articles/:slug` (detalhe com `bodyMdx`, `author`, `products[]` e `offers[]`);
  - `GET /public/sites/:siteSlug/categories` e `GET /public/sites/:siteSlug/categories/:slug`.

  Nenhuma resposta pública expõe `status`, `siteId`, `authorId` ou `affiliateUrl`.
- **Revalidação:** a API aciona a revalidação on-demand do FastCompre (`/api/internal/revalidate`, protegida por `REVALIDATION_SECRET`) depois de cada mutação que afeta conteúdo publicado. Mutações de Categoria revalidam o site inteiro. Home, Categoria e Artigo usam `fetchCache = 'force-cache'` e só são atualizados por essa revalidação.

## Estrutura do projeto

```text
commerce-platform/
├── apps/
│   ├── api/                 # NestJS + Prisma
│   │   ├── prisma/          # schema.prisma e migrations/
│   │   ├── scripts/         # bootstrap-admin.ts
│   │   ├── src/modules/     # application, catalog, editorial, identity,
│   │   │                    # revalidation, tenancy, tracking, uploads
│   │   ├── src/shared/      # config, database, http, logging
│   │   └── test/            # specs e2e (supertest)
│   ├── admin/               # Next.js: painel administrativo
│   │   ├── e2e-a11y/        # Playwright + axe
│   │   └── e2e-visual/      # baselines de regressão visual
│   └── fastcompre/          # Next.js: site público
│       ├── e2e-a11y/
│       └── e2e-visual/
├── packages/
│   ├── contracts/           # contratos Zod (admin, public, tracking, internal, common)
│   ├── ui/                  # tokens e primitivas de UI
│   └── editorial/           # gramática/validação dos blocos editoriais
├── docs/                    # documentação normativa (ver abaixo)
├── scripts/                 # dev-api, medição de performance, verificação do Tailwind
└── spikes/                  # provas técnicas históricas (não fazem parte da CI)
```

## Documentação

| Documento | Conteúdo |
|---|---|
| `docs/Architecture.md` | Arquitetura, regras de negócio, invariantes e decisões estruturais |
| `docs/Implementation-Backlog.md` | Backlog do MVP (concluído) |
| `docs/UX-Implementation-Backlog.md` | Backlog do ciclo UI/UX (concluído), com os registros de fechamento de cada gate |
| `docs/editorial/editorial-serialization-contract.md` | Contrato de serialização do editor e do pipeline MDX |
| `docs/UXW-visual-direction-decision.md` | Direção visual do FastCompre |
| `docs/a11y/wcag-aa-checklist.md` | Checklist manual WCAG 2.2 AA (Admin e FastCompre) |
| `docs/performance/` | Baseline, budget e medição final de performance do FastCompre |

## Executando localmente

Pré-requisitos: Node.js compatível com as dependências atuais, pnpm 11 e Docker.

1. **Dependências:** `pnpm install` (na raiz).
2. **Infraestrutura local:** `docker compose up -d postgres minio minio-init` sobe o PostgreSQL 16 e um storage S3-compatível de desenvolvimento (Silo, um fork mantido do MinIO; o serviço continua se chamando `minio`). Credenciais e bucket são valores fixos de desenvolvimento, definidos em `docker-compose.yml`.
3. **Variáveis de ambiente** (`.env`/`.env.local` não são versionados):
   - `apps/api/.env`: copie de `apps/api/.env.example`. Os comentários do arquivo explicam cada variável (`DATABASE_URL`, `SESSION_SECRET`, `REVALIDATION_SECRET`, `ADMIN_ORIGIN`, `REVALIDATION_TARGET_URL` e as variáveis `STORAGE_S3_*`).
   - `apps/fastcompre/.env.local`: copie de `apps/fastcompre/.env.example`. O `REVALIDATION_SECRET` precisa ser igual ao da API.
   - `apps/admin/.env.local`: defina `NEXT_PUBLIC_API_URL` com a URL da API local (por exemplo, `http://localhost:3000`).
4. **Banco:** `pnpm --filter api exec prisma generate` e `pnpm --filter api exec prisma migrate deploy`.
5. **Primeiro administrador:** ver [Criando o primeiro administrador](#criando-o-primeiro-administrador).
6. **Apps em desenvolvimento** (portas fixas):

   | Comando | App | Porta |
   |---|---|---|
   | `pnpm dev:api` | API | 3000 |
   | `pnpm dev:admin` | Admin | 3001 |
   | `pnpm dev:fastcompre` | FastCompre | 3002 |

   No local, `ADMIN_ORIGIN` deve ser `http://localhost:3001`, `REVALIDATION_TARGET_URL` deve ser `http://localhost:3002`, e `SITE_URL` (FastCompre) deve ser `http://localhost:3002`. Se uma publicação não aparecer na Home ou na Categoria, verifique primeiro o `REVALIDATION_TARGET_URL`.

Alternativa: `docker compose up --build` sobe também a migration (serviço `migrate`) e a API em container (serviço `api`, porta 3000), a partir do `Dockerfile` de `apps/api`. Os frontends continuam rodando via `pnpm dev:admin`/`pnpm dev:fastcompre`.

### Criando o primeiro administrador

A API não faz seed automático. O primeiro `User` + `Site` + `SiteUser(OWNER)` é criado por um comando interativo, nunca por um endpoint HTTP. O banco precisa estar migrado e o `apps/api/.env` configurado; a API não precisa estar rodando.

```bash
pnpm --filter api run bootstrap:admin -- \
  --email admin@email.com \
  --user-name "Nome do Administrador" \
  --site-name "Nome do Site" \
  --site-slug meu-site \
  --site-domain meusite.com \
  --site-locale pt-BR
```

- `--email`, `--site-name`, `--site-slug` e `--site-domain` são obrigatórios. `--user-name` é opcional, e `--site-locale` tem default `pt-BR`.
- A senha **nunca** é passada como argumento: o comando pede duas vezes, de forma interativa e sem eco.
- `User` (com hash da senha), `Site` e `SiteUser` com Role `OWNER` são criados atomicamente.

Depois, rode `pnpm dev:api` e `pnpm dev:admin` e faça login no Admin. Com acesso a um único Site, o login redireciona direto para o Dashboard (`/<site-slug>`). Com mais de um, a página raiz mostra o seletor de Site.

## Testes e verificação

| Objetivo | Comando |
|---|---|
| Lint (todos os workspaces) | `pnpm lint` |
| Typecheck (todos) | `pnpm typecheck` |
| Build (todos) | `pnpm build` |
| Unitários da API + gate de cobertura | `pnpm --filter api test:coverage:domain` |
| Unitários do Admin / FastCompre | `pnpm --filter admin test` / `pnpm --filter fastcompre test` |
| Unitários de `ui` / `editorial` | `pnpm --filter @commerce-platform/ui test` / `pnpm --filter @commerce-platform/editorial test` |
| E2E da API | `pnpm --filter api test:e2e` |
| Acessibilidade em browser real (Playwright + axe) | `pnpm --filter admin test:a11y` / `pnpm --filter fastcompre test:a11y` |
| Regressão visual (comparação com os baselines) | `pnpm --filter admin test:visual-baseline` / `pnpm --filter fastcompre test:visual-baseline` |

Observações:

- **E2E da API:** os specs exigem PostgreSQL real. O setup carrega o `DATABASE_URL` do `apps/api/.env`, e um `DATABASE_URL` exportado no shell tem precedência. A limpeza dos testes é restrita aos dados que eles próprios criam.
- **Harnesses Playwright:** cada um sobe seu próprio build de produção com mocks da API, em portas dedicadas, sem depender de banco.
- **Baselines visuais:** dependem do ambiente de captura (as fontes de fallback do sistema influenciam a renderização). Os atuais foram gerados em Ubuntu nativo com o Chromium do Playwright 1.62.1. `test:visual-baseline:update` regenera os baselines e só deve ser usado para mudanças visuais aprovadas.
- **Acessibilidade:** axe e `jest-axe` são gates de regressão, não certificação WCAG. A verificação manual está em `docs/a11y/wcag-aa-checklist.md`.

### CI

O GitHub Actions (`.github/workflows/ci.yml`) roda a cada push para `main` e em todo pull request, em dois jobs:

- **`build-lint-typecheck`:** `pnpm install --frozen-lockfile`, geração do cliente Prisma, build de `contracts`/`ui`/`editorial`, testes de `ui`, unitários da API com gate de cobertura, testes do Admin e do FastCompre, migrations num PostgreSQL efêmero, e2e completo da API, lint, typecheck e build.
- **`a11y-playwright`:** os harnesses de acessibilidade do Admin e do FastCompre, no container oficial do Playwright.

Os harnesses de regressão visual não fazem parte da CI.

## Roadmap

- [x] **MVP** (`docs/Implementation-Backlog.md`): fases 1 a 15, da bootstrap do monorepo à entrega do MVP (`MVP-M01`).
- [x] **Ciclo UI/UX** (`docs/UX-Implementation-Backlog.md`):
  - [x] `UX-M01` Foundations Ready
  - [x] `UX-M02` Admin Rebuilt
  - [x] `UX-M03` Editorial Platform Ready
  - [x] `UX-M04` FastCompre Rebuilt
  - [x] `UX-M05` Quality Gate Passed (por waiver formal de performance)
  - [x] `UX-M06` UI/UX Complete
- [ ] **Produção:** definição de infraestrutura e deploy (próxima fase).
