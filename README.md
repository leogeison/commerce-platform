# Commerce Platform

Motor multi-marca de conteúdo e afiliação. A primeira marca é o **FastCompre** (fastcompre.com), voltado ao público brasileiro. As decisões de arquitetura e o plano de implementação estão em `Architecture.md` e `Implementation-Backlog.md` (documentos oficiais do projeto, mantidos fora deste repositório nesta fase).

## Status

Fases 1 a 4 do backlog concluídas — monorepo, bootstrap da API com Prisma/PostgreSQL, contratos compartilhados e infraestrutura transversal da API (erros, validação, cookie, CORS, guards e `TenantContext`). Ver [Roadmap](#roadmap).

## Stack tecnológica

- **Monorepo:** pnpm workspaces (`pnpm@11.17.0`), TypeScript em modo `strict` (`ES2022`, `NodeNext`), ESLint via `@leogeison/eslint-config`.
- **`apps/api`:** NestJS 11, Prisma 7 (generator `prisma-client` com driver adapter `@prisma/adapter-pg`), PostgreSQL 16 (via Docker Compose em desenvolvimento), `nestjs-pino` para logging estruturado, Zod 4 para validação, Jest 30 (testes unitários e e2e, com `supertest` para asserções HTTP).
- **`apps/admin` e `apps/fastcompre`:** Next.js 16 (App Router) com React 19 — ainda scaffolds vazios, sem páginas reais além do padrão gerado.
- **`packages/contracts`:** schemas e tipos Zod compartilhados entre API e frontends (`ApiError`, `PaginatedResponse`).
- **CI:** GitHub Actions — instala dependências, gera o cliente Prisma, roda lint, typecheck e build a cada push/PR para `main`.

## Arquitetura

- **Separação de apps:** `apps/api` é o único ponto de acesso ao Prisma/PostgreSQL; `apps/admin` e `apps/fastcompre` ainda não consomem a API (scaffolds vazios).
- **Multi-tenancy:** isolamento por coluna discriminadora `siteId` nas tabelas do schema Prisma. `TenantContext` é um objeto imutável (`{ siteId, siteSlug }`) produzido por funções puras de resolução (`resolvePublicTenantContext`, `resolveAdminTenantContext`), sem estado global, `AsyncLocalStorage` ou provider request-scoped — o núcleo está pronto; a integração com autenticação real (extrair o usuário da sessão) é da Fase 5.
- **Banco de dados:** schema Prisma completo (11 modelos, 4 enums — `Site`, `User`, `Session`, `SiteUser`, `Category`, `Product`, `Offer`, `Article`, `ArticleProduct`, `Author`, `AffiliateClick`), migrado para PostgreSQL local. Cliente Prisma compartilhado (`PrismaService`) via driver adapter. Transação de provisionamento de tenant (`User` + `Site` + `SiteUser` atomicamente) implementada e testada.
- **Infraestrutura HTTP compartilhada (`apps/api/src/shared/http`):**
  - `AllExceptionsFilter` — filtro global que padroniza toda resposta de erro no formato `ApiError`.
  - `ZodValidationPipe` — pipe de validação genérico, reutilizável com qualquer schema Zod (local ou de `packages/contracts`).
  - `SessionCookieHelper` — aplica os atributos de segurança do cookie de sessão (`HttpOnly`, `Secure`, `SameSite=Lax`); a lógica de sessão em si (gerar/validar token) é da Fase 5.
  - `buildCorsOptions` — CORS restrito à origem exata do `apps/admin`.
  - `OriginGuard` — valida `Origin`/`Referer` em requisições mutáveis (`POST`/`PATCH`/`DELETE`); disponível como provider, ainda não aplicado a nenhuma rota real.
  - `RateLimitGuard`/`RateLimitStore` — rate limit reutilizável (janela + limite configuráveis via `@RateLimit(...)`), armazenamento em memória por processo; ainda não aplicado a nenhuma rota real.
  - `LoggingModule` — logging estruturado em JSON via `nestjs-pino`, com correlação de `x-request-id` por requisição.

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
│   │   │   │   └── tenancy/
│   │   │   │       ├── application/   # ProvisionTenantUseCase
│   │   │   │       └── domain/        # TenantContext (tipo + funções puras)
│   │   │   └── shared/
│   │   │       ├── config/            # validação de variáveis de ambiente (Zod)
│   │   │       ├── database/          # PrismaService, DatabaseModule
│   │   │       ├── http/              # filtro de erro, pipe, cookie, CORS, guards
│   │   │       └── logging/           # LoggingModule (nestjs-pino)
│   │   └── test/                      # specs e2e (supertest)
│   ├── admin/        # Next.js — scaffold vazio
│   └── fastcompre/   # Next.js — scaffold vazio
└── packages/
    └── contracts/
        └── src/common/   # ApiError, PaginatedResponse
```

## Executando localmente

1. **Instalar dependências:** `pnpm install` (na raiz).
2. **Banco de dados:** `docker compose up -d` sobe um PostgreSQL 16 local (usuário/senha/banco definidos em `docker-compose.yml`).
3. **Variáveis de ambiente:** copiar `apps/api/.env.example` para `apps/api/.env` e preencher `DATABASE_URL`, `SESSION_SECRET`, `REVALIDATION_SECRET` e `ADMIN_ORIGIN` (os comentários no próprio arquivo explicam cada uma).
4. **Cliente Prisma:** `pnpm --filter api exec prisma generate` (necessário sempre que o schema mudar; a pasta gerada não é versionada).
5. **Rodar a API:** `pnpm dev:api`. Frontends (ainda scaffolds vazios): `pnpm dev:admin` / `pnpm dev:fastcompre`.

### Testes e verificação

- `pnpm lint`, `pnpm typecheck`, `pnpm build` — na raiz, cobrem todos os workspaces.
- `pnpm --filter api test` — testes unitários (não exigem banco).
- `pnpm --filter api test:e2e` — testes e2e. A maioria não depende de banco real; os specs que dependem (`database.e2e-spec.ts`, `provision-tenant.e2e-spec.ts`) exigem um `DATABASE_URL` real **exportado no shell antes de rodar o Jest** (o fallback de teste em `jest-e2e.setup.ts` só se aplica se a variável ainda não estiver definida).

## Roadmap

Fases do `Implementation-Backlog.md`:

- [x] Fase 1 — Bootstrap do Monorepo
- [x] Fase 2 — Bootstrap da API e Prisma
- [x] Fase 3 — Contratos Compartilhados
- [x] Fase 4 — Infraestrutura Transversal da API
- [ ] Fase 5 — Identity e Autenticação
- [ ] Fase 6 — Catalog
- [ ] Fase 7 — Editorial
- [ ] Fase 8 — Application Cross-Domain
- [ ] Fase 9 — Tracking
- [ ] Fase 10 — Uploads
- [ ] Fase 11 — API Pública
- [ ] Fase 12 — FastCompre Público
- [ ] Fase 13 — Admin
- [ ] Fase 14 — Revalidação
- [ ] Fase 15 — Qualidade e Entrega do MVP
