# Commerce Platform

Motor multi-marca de conteúdo e afiliação. A primeira marca é o **FastCompre** (fastcompre.com), voltado ao público brasileiro. As decisões de arquitetura e o plano de implementação estão em `Architecture.md` e `Implementation-Backlog.md` (documentos oficiais do projeto, mantidos fora deste repositório nesta fase).

## Status

Fases 1 a 15 do backlog concluídas e o marco `MVP-M01` (produto ponta a ponta, do login administrativo à navegação pública e ao clique de afiliado) atingido. O backlog atual está encerrado. Ver [Roadmap](#roadmap).

## Stack tecnológica

- **Monorepo:** pnpm workspaces (`pnpm@11.17.0`), TypeScript em modo `strict` (`ES2022`, `NodeNext`), ESLint via `@leogeison/eslint-config`.
- **`apps/api`:** NestJS 11, Prisma 7 (generator `prisma-client` com driver adapter `@prisma/adapter-pg`), PostgreSQL 16 (via Docker Compose em desenvolvimento), `nestjs-pino` para logging estruturado, Zod 4 para validação, Jest 30 (testes unitários e e2e, com `supertest` para asserções HTTP).
- **`apps/admin`:** Next.js 16 (App Router) com React 19 — painel administrativo autenticado (Categorias, Produtos/Ofertas, Artigos, Autores), consumindo a API real.
- **`apps/fastcompre`:** Next.js 16 (App Router) com React 19 — site público da marca FastCompre (listagem/detalhe de Artigo por Categoria, `sitemap.xml`, `robots.txt`), consumindo a API real.
- **`packages/contracts`:** schemas e tipos Zod compartilhados entre API e frontends (contratos admin, públicos, de tracking e comuns como `ApiError`/`PaginatedResponse`).
- **CI:** GitHub Actions — instala dependências, gera o cliente Prisma, builda `packages/contracts`, roda os testes unitários da API (com gate de cobertura), Admin e FastCompre, aplica as migrations num PostgreSQL efêmero, roda a suíte e2e completa da API e só então roda lint, typecheck e build — a cada push/PR para `main`.

## Arquitetura

- **Separação de apps:** `apps/api` é o único ponto de acesso ao Prisma/PostgreSQL; `apps/admin` e `apps/fastcompre` consomem a API real via HTTP, sem acesso direto ao banco.
- **Multi-tenancy:** isolamento por coluna discriminadora `siteId` nas tabelas do schema Prisma. `TenantContext` é um objeto imutável (`{ siteId, siteSlug }`) produzido por funções puras de resolução (`resolvePublicTenantContext`, `resolveAdminTenantContext`), sem estado global, `AsyncLocalStorage` ou provider request-scoped — a integração com autenticação real (extrair o usuário da sessão) já está implementada (Fase 5, Identity e Autenticação).
- **Banco de dados:** schema Prisma completo (11 modelos, 4 enums — `Site`, `User`, `Session`, `SiteUser`, `Category`, `Product`, `Offer`, `Article`, `ArticleProduct`, `Author`, `AffiliateClick`), migrado para PostgreSQL local. Cliente Prisma compartilhado (`PrismaService`) via driver adapter. Transação de provisionamento de tenant (`User` + `Site` + `SiteUser` atomicamente) implementada e testada.
- **Infraestrutura HTTP compartilhada (`apps/api/src/shared/http`):**
  - `AllExceptionsFilter` — filtro global que padroniza toda resposta de erro no formato `ApiError`.
  - `ZodValidationPipe` — pipe de validação genérico, reutilizável com qualquer schema Zod (local ou de `packages/contracts`).
  - `SessionCookieHelper` — aplica os atributos de segurança do cookie de sessão (`HttpOnly`, `Secure`, `SameSite=Lax`); a lógica de sessão em si (gerar/validar token) é implementada pelo módulo Identity.
  - `buildCorsOptions` — CORS restrito à origem exata do `apps/admin`.
  - `OriginGuard` — valida `Origin`/`Referer` em requisições mutáveis (`POST`/`PATCH`/`DELETE`); aplicado a todas as rotas administrativas de escrita (login, exclusão/criação/atualização em Catalog, Editorial e Application, e upload de imagem em Uploads).
  - `RateLimitGuard`/`RateLimitStore` — rate limit reutilizável (janela + limite configuráveis via `@RateLimit(...)`), armazenamento em memória por processo; aplicado ao login (`5/60s`) e ao redirect público de afiliado (`30/60s`).
  - `LoggingModule` — logging estruturado em JSON via `nestjs-pino`, com correlação de `x-request-id` por requisição.

- **Tracking:** `GET /r/:siteSlug/:offerId` é o único redirecionador de link de afiliado — resolve o Site publicamente (sem sessão), registra `AffiliateClick` (UTM, referer, user-agent como telemetria não confiável) e responde `302` para a `affiliateUrl` real (nunca aceita URL da requisição) ou `410` com corpo amigável se a Oferta estiver arquivada. Exclusão física de Oferta (`DELETE /admin/sites/:siteSlug/products/:productId/offers/:id`) é bloqueada com `409` quando existe `AffiliateClick` vinculado — verificação cross-domain feita em `apps/api/src/modules/application`, nunca dentro do Catalog.

- **Uploads:** `POST /admin/sites/:siteSlug/uploads/images` é o único endpoint de upload de imagem (Role mínima `EDITOR`), usado por Produto, Artigo (capa) e Autor (avatar). Formato validado por assinatura binária real (magic bytes — JPEG/PNG/WebP), não por extensão ou `Content-Type` declarado; limite de 5 MiB aplicado tanto no parser multipart quanto por checagem defensiva no controller; nome do arquivo sempre gerado pelo servidor (nunca o nome original enviado). Armazenamento desenhado com uma porta explícita (`StoragePort`), implementada por `S3StorageAdapter` (compatível com AWS S3, Cloudflare R2, DigitalOcean Spaces, MinIO). Resposta `{ url }`, sem entidade `Media` — a URL é gravada direto no campo do recurso que a usa.

- **API Pública:** três endpoints, sem sessão, resolvendo o Site por `siteSlug` (`PublicTenantGuard`) — `GET /public/sites/:siteSlug/articles` (listagem paginada, só Artigo `PUBLISHED`, filtros opcionais de `categorySlug`/`type`), `GET /public/sites/:siteSlug/articles/:slug` (detalhe, com `bodyMdx` e `products[]` → `offers[]` embutidos) e `GET /public/sites/:siteSlug/categories/:slug`. Nenhuma resposta pública expõe `status`, `siteId`, `authorId` ou `affiliateUrl`; todo Artigo público carrega `categorySlug` solto (nunca um objeto Categoria aninhado). Ordenação sempre `publishedAt DESC` com `id ASC` como desempate estável. Dentro do detalhe do Artigo, Ofertas arquivadas nunca aparecem em `offers[]` (evita CTA que sempre responderia `410`); Produtos arquivados continuam em `products[]` (com `offers: []` se todas as Ofertas dele estiverem arquivadas) e Categoria arquivada continua resolvível — arquivamento bloqueia uso administrativo futuro, mas não invalida referências históricas já publicadas.

## Estrutura do projeto

```text
commerce-platform/
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── src/
│   │   │   ├── health.controller.ts
│   │   │   ├── app.module.ts
│   │   │   ├── main.ts
│   │   │   ├── modules/
│   │   │   │   ├── application/   # orquestração cross-domain (ex.: health de Artigo)
│   │   │   │   ├── catalog/       # Categoria, Produto, Oferta
│   │   │   │   ├── editorial/     # Artigo, Autor, máquina de estados editorial
│   │   │   │   ├── identity/      # autenticação, sessão, Roles
│   │   │   │   ├── revalidation/  # revalidação do FastCompre após publish
│   │   │   │   ├── tenancy/       # TenantContext, provisionamento de Site
│   │   │   │   ├── tracking/      # redirect de afiliado, AffiliateClick
│   │   │   │   └── uploads/       # upload de imagem (S3-compatível)
│   │   │   └── shared/
│   │   │       ├── config/            # validação de variáveis de ambiente (Zod)
│   │   │       ├── database/          # PrismaService, DatabaseModule
│   │   │       ├── http/              # filtro de erro, pipe, cookie, CORS, guards
│   │   │       └── logging/           # LoggingModule (nestjs-pino)
│   │   └── test/                      # specs e2e (supertest)
│   ├── admin/         # Next.js — painel administrativo (Categorias, Produtos, Artigos, Autores)
│   └── fastcompre/    # Next.js — site público da marca (Artigo, Categoria, sitemap, robots)
└── packages/
    └── contracts/
        └── src/
            ├── admin/    # contratos das rotas administrativas
            ├── public/   # contratos das rotas públicas
            ├── tracking/ # contratos de redirect/telemetria
            └── common/   # ApiError, PaginatedResponse
```

## Executando localmente

1. **Instalar dependências:** `pnpm install` (na raiz).
2. **Banco de dados:** `docker compose up -d` sobe um PostgreSQL 16 e um MinIO locais (usuário/senha/bucket definidos em `docker-compose.yml`).
3. **Variáveis de ambiente:** copiar `apps/api/.env.example` para `apps/api/.env` e preencher `DATABASE_URL`, `SESSION_SECRET`, `REVALIDATION_SECRET`, `ADMIN_ORIGIN` e as variáveis de storage `STORAGE_S3_BUCKET`/`STORAGE_S3_REGION`/`STORAGE_S3_PUBLIC_URL_BASE` (obrigatórias) — `STORAGE_S3_ENDPOINT`, `STORAGE_S3_FORCE_PATH_STYLE` e as credenciais `STORAGE_S3_ACCESS_KEY_ID`/`STORAGE_S3_SECRET_ACCESS_KEY` são opcionais, necessárias apenas para provedores S3-compatíveis que não sejam a AWS real (os comentários no próprio arquivo explicam cada uma).
4. **Cliente Prisma:** `pnpm --filter api exec prisma generate` (necessário sempre que o schema mudar; a pasta gerada não é versionada).
5. **Rodar a API e os frontends:** `pnpm dev:api`, `pnpm dev:admin`, `pnpm dev:fastcompre`.

Alternativamente, `docker compose up --build` sobe a stack completa da API em containers (PostgreSQL, MinIO, aplicação das migrations pelo serviço `migrate` e a API pelo serviço `api`, na porta `3000`) a partir do `Dockerfile` de `apps/api` — útil para validar o build de produção da API sem montar o ambiente Node local. Os frontends (`apps/admin`, `apps/fastcompre`) continuam rodando via `pnpm dev:admin`/`pnpm dev:fastcompre` mesmo nesse fluxo.

### Criando o primeiro administrador

A API não faz seed automático de dados: o primeiro `User` + `Site` + `SiteUser(OWNER)` é criado por um comando interativo (`bootstrap:admin`, `AUTH-013`), nunca por um endpoint HTTP.

**Pré-requisitos:**
- Banco de dados já migrado (`docker compose up -d` + `pnpm --filter api exec prisma migrate deploy`).
- `apps/api/.env` configurado (passo 3 acima).
- A API **não** precisa estar rodando — o comando sobe seu próprio contexto de aplicação NestJS direto, independente do `pnpm dev:api`.

**Comando:**

```bash
pnpm --filter api run bootstrap:admin -- \
  --email admin@email.com \
  --user-name "Nome do Administrador" \
  --site-name "Nome do Site" \
  --site-slug meu-site \
  --site-domain meusite.com \
  --site-locale pt-BR
```

- `--email`, `--site-name`, `--site-slug`, `--site-domain` são obrigatórios.
- `--user-name` é opcional. `--site-locale` tem default `pt-BR` se omitido.
- A senha **nunca** é passada como argumento: o comando pede duas vezes, interativamente, sem eco no terminal (confirmação evita erro de digitação).

**O que o comando cria:** `User` (com a senha informada, já com hash), `Site` e `SiteUser` com Role `OWNER` — os três atomicamente (falha em qualquer etapa não deixa nenhum dos três).

**Exemplo completo:**

```
$ pnpm --filter api run bootstrap:admin -- \
    --email admin@fastcompre.com \
    --user-name "Léo Geison" \
    --site-name "FastCompre" \
    --site-slug fastcompre \
    --site-domain fastcompre.com

Senha: ********
Confirme a senha: ********
Administrador criado com sucesso.
  E-mail: admin@fastcompre.com
  Site: FastCompre (fastcompre)
  Role: OWNER
```

**Depois de criado:** rode `pnpm dev:api` e `pnpm dev:admin`, acesse o Admin e faça login com o e-mail e a senha informados acima. Como o bootstrap cria exatamente um Site, o login redireciona automaticamente para `/<site-slug>/categories` desse Site (a página raiz só mostra uma lista para escolher quando o usuário tem acesso a mais de um Site).

### Testes e verificação

- `pnpm lint`, `pnpm typecheck`, `pnpm build` — na raiz, cobrem todos os workspaces.
- `pnpm --filter api test:coverage:domain` — testes unitários da API com gate de cobertura sobre `domain`/`application` (não exigem banco). `pnpm --filter admin test` e `pnpm --filter fastcompre test` cobrem os respectivos frontends.
- `pnpm --filter api test:e2e` — suíte e2e da API. A maioria dos specs exige um PostgreSQL real: exporte um `DATABASE_URL` válido no shell antes de rodar o Jest (o fallback em `jest-e2e.setup.ts` só se aplica se a variável ainda não estiver definida).
- **CI:** o GitHub Actions roda automaticamente, a cada push/PR para `main`, todos os passos acima (unitários com gate de cobertura, testes de Admin/FastCompre, migrations num Postgres efêmero, e2e completo, lint, typecheck e build) — ver a seção [Stack tecnológica](#stack-tecnológica).

## Roadmap

Fases do `Implementation-Backlog.md`:

- [x] Fase 1 — Bootstrap do Monorepo
- [x] Fase 2 — Bootstrap da API e Prisma
- [x] Fase 3 — Contratos Compartilhados
- [x] Fase 4 — Infraestrutura Transversal da API
- [x] Fase 5 — Identity e Autenticação
- [x] Fase 6 — Catalog
- [x] Fase 7 — Editorial
- [x] Fase 8 — Application Cross-Domain
- [x] Fase 9 — Tracking
- [x] Fase 10 — Uploads
- [x] Fase 11 — API Pública
- [x] Fase 12 — FastCompre Público
- [x] Fase 13 — Admin
- [x] Fase 14 — Revalidação
- [x] Fase 15 — Qualidade e Entrega do MVP

Todas as fases do backlog foram concluídas e o marco `MVP-M01` foi atingido. O backlog atual está encerrado.
