# Implementation-Backlog.md — Commerce Platform / FastCompre MVP

> Documento oficial de backlog. Consolida integralmente a Etapa 16 do processo de projeto, incluindo as duas rodadas de correção de dependências circulares aprovadas posteriormente. Não altera, remove ou compacta nenhuma tarefa aprovada. Para as decisões de arquitetura, produto e regras de negócio que fundamentam este backlog, ver `Architecture.md`.

## Visão Geral da Estratégia de Implementação

O backlog segue rigorosamente a ordem definida ao longo do processo arquitetural: **Produto → MVP → Regras → Domínios → Arquitetura → Apps → Packages → Banco → API → Frontend → Estrutura de pastas → Backlog → Implementação**. A implementação em si (Etapa 17) executa uma tarefa por vez, no formato fixo definido desde o início da colaboração: o que será feito, por que será feito, arquivos envolvidos, comandos que serão executados, código da tarefa, explicação do código, como testar, resultado esperado, sugestão de commit, e parada obrigatória para validação antes da próxima tarefa.

A unidade do backlog é sempre uma **pequena capacidade verificável** — nunca um arquivo isolado, nunca uma entrega ampla do tipo "implementar módulo inteiro". Tarefas são agrupadas em 15 fases, sequenciadas por dependência técnica real, com um caminho crítico único e ramos paralelizáveis explícitos. A validação automática do schema Prisma é deliberadamente a primeira atividade da fase de implementação (Fase 2), não algo resolvido durante a etapa arquitetural — enquanto o projeto não existe fisicamente, essa validação misturaria arquitetura com implementação.

Duas rodadas de revisão identificaram e corrigiram dependências circulares e responsabilidades duplicadas neste backlog antes de sua aprovação definitiva:
- **Primeira rodada:** separou operações internas de domínio (Catalog/Editorial) de casos de uso cross-domain (Application), e moveu toda a coordenação de revalidação da Fase 8 (Application) para a Fase 14 (Revalidação), eliminando um ciclo de dependência com o marco da Fase 8.
- **Segunda rodada:** garantiu um único caminho HTTP para publicação e arquivamento de Artigo (passando obrigatoriamente pela coordenação de revalidação), tornou obrigatória a coordenação de revalidação para toda alteração de Categoria/Produto/Oferta/Autor que afete Artigo publicado, e corrigiu a exclusão de Oferta para não fazer Catalog depender de Tracking.

O backlog abaixo já reflete o estado final, aprovado definitivamente.

---

## Visão Geral das Fases

| Fase | Nome | Entrega |
|---|---|---|
| 1 | Bootstrap do monorepo | Workspace pnpm com os 3 apps e 1 package vazios, build/lint/typecheck rodando |
| 2 | Bootstrap da API e Prisma | Banco real, schema materializado, migration inicial, bootstrap transacional |
| 3 | Contratos compartilhados | DTOs criados just-in-time, junto de cada fase que os consome (não antecipados) |
| 4 | Infraestrutura transversal da API | Erros, logging, validação, cookies, CORS, rate limit, TenantContext |
| 5 | Identity e autenticação | Sessão opaca, login/logout/me, guards, isolamento entre Sites |
| 6 | Catalog | Categorias, Produtos, Ofertas — CRUD + arquivamento |
| 7 | Editorial | Autores, Artigos, vínculo com Produto, máquina de estados |
| 8 | Application cross-domain | Saúde do artigo, publicação persistida, exclusões cross-domain (Produto/Categoria), preparação do redirect, descoberta de páginas afetadas — **sem revalidação, movida para a Fase 14** |
| 9 | Tracking | Endpoint de redirect, registro de clique, 302/410 (resposta 410 já com corpo amigável) |
| 10 | Uploads | Upload de imagem sem entidade Media; porta de armazenamento explícita antes do adaptador concreto |
| 11 | API pública | Listagem/detalhe público, paginação, categorySlug |
| 12 | FastCompre público | Home, Categoria, Artigo, SEO, sitemap (percorrendo toda a listagem pública), canônico, **apenas 404** |
| 13 | Admin | Login, seletor de site, telas de cada recurso, editor de artigo |
| 14 | Revalidação | Endpoint interno, **adaptador cliente**, coordenação ao publicar/arquivar/alterar dependências, logging estruturado, teste de não-reversão |
| 15 | Qualidade e entrega do MVP | Testes, segurança, CI (estendendo o CI inicial da Fase 1), checklist final |

**Nota sobre Fase 3:** cada bloco de contrato (`CTR-00X`) é entregue imediatamente antes da fase que o consome (ex: `CTR-002 admin/auth` acontece logo antes de `AUTH-004`), nunca todos de uma vez no início — evita DTO especulativo. Cada contrato agora exporta **schema de runtime (Zod) + tipo inferido (`z.infer`)** — validação estrutural mora no contrato, regra de negócio mora no domínio/application, e a API nunca duplica o schema em DTOs próprios.

**Nota de convenção:** blocos de tarefas agrupadas (ex: `CAT-001` a `CAT-007`) herdam os campos comuns declarados uma vez no início do bloco — não é omissão dos 11 campos, é a forma de evitar repetir texto idêntico onze vezes por tarefa.

---

## Fase 1 — Bootstrap do Monorepo

### MONO-001 — Criar raiz do workspace pnpm
**Objetivo:** ter um `package.json` raiz válido, sem apps ainda.
**Contexto:** primeiro artefato físico do projeto.
**Pré-requisitos:** nenhum.
**Escopo incluído:** `package.json` raiz, `.gitignore`, `README.md` inicial.
**Fora do escopo:** qualquer app ou package.
**Arquivos/áreas:** raiz do repositório.
**Critérios de aceite:** `pnpm install` roda sem erro na raiz vazia.
**Testes esperados:** nenhum automatizado — verificação manual do install.
**Riscos/observações:** nenhum.
**Dependências:** nenhuma.

### MONO-002 — Configurar `pnpm-workspace.yaml`
**Objetivo:** declarar `apps/*` e `packages/*` como workspaces.
**Contexto:** necessário antes de criar qualquer app/package.
**Pré-requisitos:** MONO-001.
**Escopo incluído:** arquivo `pnpm-workspace.yaml` com os dois globs.
**Fora do escopo:** conteúdo de apps/packages.
**Arquivos/áreas:** `pnpm-workspace.yaml`.
**Critérios de aceite:** `pnpm -r list` roda sem erro (lista vazia é aceitável).
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-001.

### MONO-003 — Configurar `tsconfig.base.json`
**Objetivo:** base de compilação TS compartilhada pelos 3 apps.
**Contexto:** decisão da Etapa 8 — sem `packages/config`, tsconfig na raiz.
**Pré-requisitos:** MONO-001.
**Escopo incluído:** `strict: true`, target/module compatíveis com Next.js e NestJS.
**Fora do escopo:** tsconfig específico de cada app (herda depois).
**Arquivos/áreas:** `tsconfig.base.json`.
**Critérios de aceite:** arquivo válido, `tsc --showConfig` não gera erro isoladamente.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** confirmar compatibilidade simultânea com Next.js e NestJS antes de travar opções restritivas demais.
**Dependências:** MONO-001.

### MONO-004 — Instalar e aplicar `@leogeison/eslint-config`
**Objetivo:** lint consistente nos 3 apps desde o início.
**Contexto:** decisão da Etapa 8 — reaproveitar pacote existente, sem duplicar config.
**Pré-requisitos:** MONO-002.
**Escopo incluído:** instalação como devDependency raiz, arquivo de config raiz que o consome.
**Fora do escopo:** regras customizadas novas.
**Arquivos/áreas:** `package.json` raiz, arquivo de config ESLint raiz.
**Critérios de aceite:** `pnpm lint` roda na raiz sem erro de configuração.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** confirmar que a versão do pacote suporta o ESLint usado pelo Next.js/NestJS atuais.
**Dependências:** MONO-002.

### MONO-005 — Criar `apps/api` vazio
**Objetivo:** esqueleto Nest CLI mínimo, sem módulos de domínio.
**Contexto:** primeiro dos três apps.
**Pré-requisitos:** MONO-002, MONO-003.
**Escopo incluído:** projeto Nest gerado, `main.ts`, herda `tsconfig.base.json`.
**Fora do escopo:** qualquer módulo de domínio, Prisma.
**Arquivos/áreas:** `apps/api/`.
**Critérios de aceite:** `pnpm --filter api build` e `start` sobem um servidor Nest vazio.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-002, MONO-003, MONO-004.

### MONO-006 — Criar `apps/admin` vazio
**Objetivo:** esqueleto Next.js mínimo.
**Pré-requisitos:** MONO-002, MONO-003.
**Escopo incluído:** projeto Next.js (App Router), herda `tsconfig.base.json`.
**Fora do escopo:** qualquer página real, cliente de API.
**Arquivos/áreas:** `apps/admin/`.
**Critérios de aceite:** `pnpm --filter admin dev` sobe página em branco.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-002, MONO-003, MONO-004.

### MONO-007 — Criar `apps/fastcompre` vazio
**Objetivo:** esqueleto Next.js mínimo, mesma base do admin.
**Pré-requisitos:** MONO-002, MONO-003.
**Escopo incluído:** projeto Next.js (App Router), herda `tsconfig.base.json`.
**Fora do escopo:** qualquer rota real.
**Arquivos/áreas:** `apps/fastcompre/`.
**Critérios de aceite:** `pnpm --filter fastcompre dev` sobe página em branco.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-002, MONO-003, MONO-004.

### MONO-008 — Criar `packages/contracts` vazio
**Objetivo:** package publicável internamente, sem conteúdo ainda.
**Pré-requisitos:** MONO-002, MONO-003.
**Escopo incluído:** `package.json`, `tsconfig.json`, `src/index.ts` vazio, pastas `public/ admin/ tracking/ internal/ common/` só quando o primeiro contrato de cada uma nascer (não antes).
**Fora do escopo:** qualquer DTO real.
**Arquivos/áreas:** `packages/contracts/`.
**Critérios de aceite:** os 3 apps conseguem declarar `packages/contracts` como dependência do workspace e importar sem erro.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-002, MONO-005, MONO-006, MONO-007.

### MONO-009 — Configurar scripts da raiz
**Objetivo:** `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm dev:api/admin/fastcompre` funcionando via workspace.
**Pré-requisitos:** MONO-005 a MONO-008.
**Escopo incluído:** scripts no `package.json` raiz delegando para `-r`/`--filter`.
**Fora do escopo:** Turborepo (fora de escopo sem decisão explícita).
**Arquivos/áreas:** `package.json` raiz.
**Critérios de aceite:** cada script roda com sucesso contra os 4 workspaces vazios.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** MONO-005, MONO-006, MONO-007, MONO-008.

### MONO-010 — Confirmar build/lint/typecheck mínimos do workspace
**Objetivo:** marco de fechamento da Fase 1.
**Pré-requisitos:** MONO-009.
**Escopo incluído:** rodar os três comandos contra o workspace inteiro e registrar resultado.
**Fora do escopo:** qualquer lógica de negócio.
**Arquivos/áreas:** nenhum novo.
**Critérios de aceite:** os três comandos passam sem erro nos 3 apps + 1 package vazios.
**Testes esperados:** nenhum automatizado — este é o teste.
**Riscos/observações:** primeiro ponto real de fricção de ferramentas costuma aparecer aqui (versões de TS incompatíveis entre Next/Nest).
**Dependências:** MONO-001 a MONO-009.

### MONO-011 — CI inicial (build/lint/typecheck)
**Objetivo:** pipeline de GitHub Actions rodando a cada push/PR desde o início do projeto, não só na Fase 15.
**Contexto:** correção da revisão — CI não deveria esperar até QA-011; o esqueleto do workspace já é suficiente para validar build/lint/typecheck automaticamente.
**Pré-requisitos:** MONO-010.
**Escopo incluído:** workflow com os três comandos da raiz.
**Fora do escopo:** testes (ainda não existem — entram quando QA-011 estender este mesmo workflow).
**Arquivos/áreas:** `.github/workflows/ci.yml`.
**Critérios de aceite:** workflow roda verde num PR de teste contra o workspace vazio.
**Testes esperados:** nenhum automatizado — é o próprio CI o critério.
**Riscos/observações:** nenhum.
**Dependências:** MONO-010.

---

## Fase 2 — Bootstrap da API e Prisma

### DB-001 — Aplicação NestJS mínima com health check
**Objetivo:** `app.module.ts` real + endpoint `GET /health`.
**Pré-requisitos:** MONO-005.
**Escopo incluído:** módulo raiz, controller de health.
**Fora do escopo:** qualquer módulo de domínio.
**Arquivos/áreas:** `apps/api/src/app.module.ts`, `apps/api/src/main.ts`.
**Critérios de aceite:** `GET /health` responde 200.
**Testes esperados:** teste de integração simples do health check.
**Riscos/observações:** nenhum.
**Dependências:** MONO-010.

### DB-002 — Variáveis de ambiente
**Objetivo:** `.env.example` + validação de env na subida da API.
**Pré-requisitos:** DB-001.
**Escopo incluído:** `DATABASE_URL`, segredo de sessão, segredo de revalidação — validação com erro claro se faltar.
**Fora do escopo:** segredos reais de produção.
**Arquivos/áreas:** `apps/api/src/shared/config/`, `.env.example`.
**Critérios de aceite:** API recusa subir com env incompleta, com mensagem clara.
**Testes esperados:** teste unitário da validação de config.
**Riscos/observações:** nenhum.
**Dependências:** DB-001.

### DB-003 — PostgreSQL local via Docker Compose
**Objetivo:** banco local reproduzível.
**Pré-requisitos:** DB-002.
**Escopo incluído:** `docker-compose.yml` com serviço Postgres, volume, variáveis compatíveis com `.env.example`.
**Fora do escopo:** banco de produção.
**Arquivos/áreas:** `docker-compose.yml` (raiz).
**Critérios de aceite:** `docker compose up` sobe Postgres acessível localmente.
**Testes esperados:** nenhum automatizado — verificação manual de conexão.
**Riscos/observações:** nenhum.
**Dependências:** DB-002.

### DB-004 — Instalar Prisma e inicializar schema vazio
**Objetivo:** `apps/api/prisma/schema.prisma` existente, com datasource/generator apenas.
**Pré-requisitos:** DB-003.
**Escopo incluído:** instalação do Prisma CLI e client como dependência da `api`.
**Fora do escopo:** models de domínio ainda.
**Arquivos/áreas:** `apps/api/prisma/schema.prisma`.
**Critérios de aceite:** `pnpm --filter api exec prisma -v` funciona.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum.
**Dependências:** DB-003.

### DB-005 — Materializar o schema aprovado
**Objetivo:** todos os models da Etapa 11/12 no `schema.prisma`.
**Pré-requisitos:** DB-004.
**Escopo incluído:** `Site, User, Session, SiteUser, Category, Product, Offer, Article, ArticleProduct, Author, AffiliateClick` + enums.
**Fora do escopo:** qualquer model fora do MVP (Media, Tag, AIDraft, PriceHistory).
**Arquivos/áreas:** `apps/api/prisma/schema.prisma`.
**Critérios de aceite:** arquivo completo conforme o texto aprovado nas Etapas 11/12.
**Testes esperados:** nenhum ainda — validação é a próxima tarefa.
**Riscos/observações:** nenhum novo além dos já documentados.
**Dependências:** DB-004.

### DB-006 — Rodar `prisma format`
**Objetivo:** primeira execução real da ferramenta contra o schema.
**Pré-requisitos:** DB-005.
**Escopo incluído:** rodar o comando, corrigir apenas formatação.
**Fora do escopo:** mudança de modelagem.
**Arquivos/áreas:** `schema.prisma`.
**Critérios de aceite:** comando roda sem erro.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** primeiro ponto onde o ambiente real (com acesso a `binaries.prisma.sh`) precisa existir — não reproduzível no sandbox de arquitetura usado até aqui.
**Dependências:** DB-005.

### DB-007 — Rodar `prisma validate` e resolver erros reais
**Objetivo:** confirmar (ou corrigir) as relações compostas opcionais.
**Pré-requisitos:** DB-006.
**Escopo incluído:** rodar o comando; se as 4 relações compostas opcionais (`Product.category`, `Article.category`, `Article.author`, `AffiliateClick.article`) forem rejeitadas (risco documentado, issue prisma#6042), ajustar apenas o necessário — nunca abandonar a proteção de tenant, buscar alternativa equivalente (ex: FK manual via SQL na migration).
**Fora do escopo:** qualquer mudança de regra de negócio.
**Arquivos/áreas:** `schema.prisma`, possivelmente SQL manual futuro (DB-010).
**Critérios de aceite:** `prisma validate` passa sem erro.
**Testes esperados:** nenhum automatizado — este é o teste da etapa.
**Riscos/observações:** ponto de maior incerteza técnica do schema, documentado desde a Etapa 12.
**Dependências:** DB-006.

### DB-008 — Rodar `prisma generate`
**Objetivo:** client Prisma tipado gerado.
**Pré-requisitos:** DB-007.
**Escopo incluído:** rodar o comando, confirmar tipos gerados batem com o schema.
**Fora do escopo:** uso do client ainda (isso é DB-012).
**Arquivos/áreas:** `node_modules/.prisma` (gerado).
**Critérios de aceite:** import do client compila sem erro em um arquivo de teste isolado.
**Testes esperados:** nenhum automatizado.
**Riscos/observações:** nenhum, assumindo DB-007 resolvido.
**Dependências:** DB-007.

### DB-009 — Gerar migration inicial com `--create-only`
**Objetivo:** SQL gerado, ainda não aplicado.
**Pré-requisitos:** DB-008.
**Escopo incluído:** `prisma migrate dev --name init --create-only`, revisão manual do SQL (FKs compostas, ações referenciais, índices).
**Fora do escopo:** aplicar a migration (próxima tarefa).
**Arquivos/áreas:** `apps/api/prisma/migrations/`.
**Critérios de aceite:** SQL gerado corresponde ao desenhado nas Etapas 11/12 (Restrict/Cascade corretos, índices corretos).
**Testes esperados:** revisão manual documentada, sem teste automatizado.
**Riscos/observações:** nenhum, assumindo DB-007 resolvido corretamente.
**Dependências:** DB-008.

### DB-010 — Adicionar manualmente `CHECK ("price" > 0)`
**Objetivo:** reforçar em banco a regra de preço válido.
**Pré-requisitos:** DB-009.
**Escopo incluído:** editar o SQL gerado, adicionando o `CHECK` na tabela `Offer`.
**Fora do escopo:** qualquer outro `CHECK` não decidido.
**Arquivos/áreas:** arquivo de migration gerado.
**Critérios de aceite:** SQL contém o `CHECK` antes de aplicar.
**Testes esperados:** teste de integração tentando inserir `Offer` com `price <= 0` e esperando erro do banco.
**Riscos/observações:** nenhum.
**Dependências:** DB-009.

### DB-011 — Aplicar a migration
**Objetivo:** schema real criado no Postgres local.
**Pré-requisitos:** DB-010.
**Escopo incluído:** `prisma migrate dev` (aplicando a migration já revisada).
**Fora do escopo:** dado de seed.
**Arquivos/áreas:** banco local.
**Critérios de aceite:** todas as tabelas/índices/constraints existem no banco.
**Testes esperados:** consulta ao catálogo do Postgres confirmando FKs e `CHECK`.
**Riscos/observações:** nenhum.
**Dependências:** DB-010.

### DB-012 — Cliente Prisma compartilhado
**Objetivo:** módulo NestJS (`shared/database`) expondo o `PrismaClient` como provider injetável.
**Pré-requisitos:** DB-011.
**Escopo incluído:** conexão única, encerramento gracioso.
**Fora do escopo:** qualquer repository concreto (isso entra por módulo, nas fases seguintes).
**Arquivos/áreas:** `apps/api/src/shared/database/`.
**Critérios de aceite:** provider injetável em qualquer módulo, testado com uma query simples.
**Testes esperados:** teste de integração de conexão.
**Riscos/observações:** este módulo não pode conter regra de negócio (regra da Etapa 15).
**Dependências:** DB-011.

### DB-013 — Provar a transação de provisionamento (com fixture)
**Objetivo:** validar que `User + Site + SiteUser(OWNER)` se cria atomicamente, ou nada se cria.
**Contexto:** correção da revisão — nesta fase o serviço de hash (`AUTH-002`) ainda não existe, então esta tarefa usa um `passwordHash` de fixture, não uma senha real. O comando real de bootstrap fica para `AUTH-013`, depois que o hash existir.
**Pré-requisitos:** DB-012.
**Escopo incluído:** transação única criando os três registros com `passwordHash` fixo de teste; idempotência mínima.
**Fora do escopo:** geração real de hash, comando utilizável em produção, interface de administração de múltiplos Sites.
**Arquivos/áreas:** `apps/api/src/modules/tenancy/application/` (ou teste de integração equivalente).
**Critérios de aceite:** a transação cria os três registros atomicamente; falha simulada no meio não deixa nenhum dos três.
**Testes esperados:** teste de integração simulando falha no meio da transação e confirmando rollback total.
**Riscos/observações:** este é o único ponto de criação de `Site` no MVP — nunca expor como endpoint de API, nem aqui nem em `AUTH-013`.
**Dependências:** DB-012.

---

## Fase 3 — Contratos Compartilhados

Cada `CTR-00X` é uma tarefa pequena: definir os tipos daquela superfície em `packages/contracts`, sem lógica. Entregues just-in-time, imediatamente antes da fase que os consome.

- **CTR-001 — `common`**: `ApiError { statusCode, code, error, message, details? }`, `PaginatedResponse<T>`. Entregue antes de DB-013/AUTH-001.
- **CTR-002 — `admin/auth`**: request/response de login, `me`. Entregue antes de AUTH-007.
- **CTR-003 — `admin/categories`**: entregue antes de CAT-001.
- **CTR-004 — `admin/products`**: entregue antes de CAT-008.
- **CTR-005 — `admin/offers`**: entregue antes de CAT-015.
- **CTR-006 — `admin/authors`**: entregue antes de EDT-001.
- **CTR-007 — `admin/articles`**: entregue antes de EDT-006.
- **CTR-008 — `admin/publication`**: entregue antes de EDT-013.
- **CTR-009 — `admin/uploads`**: entregue antes de UPL-001.
- **CTR-010 — `public`**: entregue antes de PUB-001.
- **CTR-011 — `tracking`**: entregue antes de TRK-001.
- **CTR-012 — `internal/revalidation`**: entregue antes de REV-001.

Cada uma tem o mesmo template reduzido: **Objetivo** (definir a superfície X como **schema Zod + tipo inferido `z.infer`**, não apenas `interface`/`type`), **Pré-requisito** (MONO-008), **Escopo** (schema de runtime + tipo, sem lógica de negócio), **Fora do escopo** (regra de negócio — isso é domínio/application na API), **Critério de aceite** (os apps consumidores importam o schema e o tipo sem erro; a API usa esse schema diretamente em `INF-003`, nunca duplica), **Dependência** (a fase correspondente listada acima).

---

## Fase 4 — Infraestrutura Transversal da API

### INF-001 — Tratamento global de erros → `ApiError`
**Objetivo:** todo erro não tratado vira `ApiError` consistente.
**Pré-requisitos:** CTR-001, DB-001.
**Escopo incluído:** exception filter global do NestJS.
**Fora do escopo:** mapeamento de erros de domínio específicos (cada módulo mapeia os seus).
**Arquivos/áreas:** `apps/api/src/shared/http/`.
**Critérios de aceite:** erro não tratado retorna `ApiError` com `code: "INTERNAL_ERROR"`, nunca stack trace ao cliente.
**Testes esperados:** teste de integração forçando um erro não tratado.
**Riscos/observações:** nenhum.
**Dependências:** CTR-001, DB-001.

### INF-002 — Logging estruturado
**Objetivo:** logs em formato consistente (JSON), com nível e contexto.
**Pré-requisitos:** DB-002.
**Escopo incluído:** logger compartilhado, correlação básica por request.
**Fora do escopo:** agregação externa de log (fora do MVP).
**Arquivos/áreas:** `apps/api/src/shared/logging/`.
**Critérios de aceite:** toda requisição gera pelo menos uma linha de log estruturado.
**Testes esperados:** teste verificando formato do log.
**Riscos/observações:** este módulo não pode conter regra de negócio.
**Dependências:** DB-002.

### INF-003 — Validação de entrada via schema Zod do contrato
**Objetivo:** todo body/query validado contra o **schema de runtime Zod exportado por `packages/contracts`**, antes de chegar ao caso de uso.
**Contexto:** correção da revisão — tipo TypeScript não valida em runtime; cada contrato passa a exportar `schema + z.infer<typeof schema>`. A API consome esse schema diretamente, nunca cria DTO ou schema duplicado próprio.
**Pré-requisitos:** INF-001, CTR-001.
**Escopo incluído:** pipe genérico que recebe um schema Zod (do contrato) e valida o payload contra ele.
**Fora do escopo:** regra de negócio (isso é domínio/application) — o pipe só garante forma, não significado.
**Arquivos/áreas:** `apps/api/src/shared/http/`.
**Critérios de aceite:** payload inválido retorna `422` com `ApiError` antes de tocar em qualquer caso de uso; o schema usado é sempre importado de `packages/contracts`, nunca redefinido na API.
**Testes esperados:** teste de integração com payload malformado; teste garantindo que alterar o schema do contrato muda a validação sem tocar na API.
**Riscos/observações:** nenhum.
**Dependências:** INF-001, CTR-001.

### INF-004 — Configuração de cookies de sessão
**Objetivo:** infraestrutura de cookie `HttpOnly`/`Secure`/`SameSite=Lax`/`Path=/`, host-only.
**Pré-requisitos:** DB-002.
**Escopo incluído:** helper de set/clear cookie, sem lógica de sessão ainda (isso é Fase 5).
**Fora do escopo:** geração/validação de token de sessão.
**Arquivos/áreas:** `apps/api/src/shared/http/`.
**Critérios de aceite:** helper testável isoladamente, atributos corretos no header `Set-Cookie`.
**Testes esperados:** teste unitário dos atributos do cookie.
**Riscos/observações:** nenhum.
**Dependências:** DB-002.

### INF-005 — CORS restritivo
**Objetivo:** só a origem exata do `apps/admin` é permitida em rotas administrativas.
**Pré-requisitos:** DB-002.
**Escopo incluído:** configuração de CORS por variável de ambiente.
**Fora do escopo:** CORS de rotas públicas (mais permissivo, tratado à parte).
**Arquivos/áreas:** `apps/api/src/main.ts`, `shared/config`.
**Critérios de aceite:** requisição de origem não autorizada é bloqueada.
**Testes esperados:** teste de integração com header `Origin` inválido.
**Riscos/observações:** nenhum.
**Dependências:** DB-002.

### INF-006 — Validação de `Origin`/`Referer` em rotas mutáveis
**Objetivo:** proteção CSRF adicional além de `SameSite`.
**Pré-requisitos:** INF-005.
**Escopo incluído:** guard/middleware que rejeita `POST/PATCH/DELETE` administrativos sem `Origin` esperado.
**Fora do escopo:** token CSRF explícito (só entra se isso se mostrar insuficiente).
**Arquivos/áreas:** `apps/api/src/shared/http/`.
**Critérios de aceite:** requisição mutável sem `Origin` correto é rejeitada.
**Testes esperados:** teste de integração simulando requisição cross-site.
**Riscos/observações:** nenhum.
**Dependências:** INF-005.

### INF-007 — Rate limiting (infraestrutura)
**Objetivo:** mecanismo de rate limit reutilizável, sem regra específica ainda.
**Pré-requisitos:** DB-002.
**Escopo incluído:** guard configurável por rota (janela + limite).
**Fora do escopo:** aplicação em rotas específicas (login e redirect aplicam isso na Fase 5/9).
**Arquivos/áreas:** `apps/api/src/shared/http/`.
**Critérios de aceite:** guard reutilizável, testável isoladamente com limite baixo.
**Testes esperados:** teste unitário do guard.
**Riscos/observações:** nenhum.
**Dependências:** DB-002.

### INF-008 — Resolução de `TenantContext`
**Objetivo:** função/guard que resolve `Site` de forma confiável pós-autenticação (admin) ou via `siteSlug` público (conteúdo), produzindo um **objeto imutável explícito**.
**Contexto:** correção da revisão — nada de provider request-scoped nem `AsyncLocalStorage`; não existe "tenant atual" global. O `TenantContext` é criado no controller/guard e **passado como parâmetro explícito** para o caso de uso, ponta a ponta.
**Pré-requisitos:** INF-003, DB-012.
**Escopo incluído:** tipo `TenantContext` imutável (`{ siteId, siteSlug }`), função de resolução pura, sem estado global.
**Fora do escopo:** autorização por Role (isso é Fase 5).
**Arquivos/áreas:** `apps/api/src/shared/http/`, ou módulo `tenancy`.
**Critérios de aceite:** `siteId` nunca é lido diretamente do body/query em nenhum caso de uso; nenhum módulo acessa "tenant atual" por injeção implícita — todo caso de uso recebe `TenantContext` como argumento.
**Testes esperados:** teste garantindo que um `siteId` forjado no body é ignorado; teste confirmando que dois requests concorrentes com Sites diferentes nunca compartilham contexto (prova de que não há estado global).
**Riscos/observações:** este é o ponto mais crítico de segurança da API — testar exaustivamente.
**Dependências:** INF-003, DB-012.

### INF-009 — Confirmar infraestrutura completa (marco da Fase 4)
**Objetivo:** todos os itens acima funcionando em conjunto.
**Pré-requisitos:** INF-001 a INF-008.
**Escopo incluído:** teste de integração combinando erro global + validação + cookie + CORS + tenant context num endpoint de exemplo (o próprio `/health` estendido).
**Fora do escopo:** qualquer módulo de domínio real.
**Arquivos/áreas:** nenhum novo.
**Critérios de aceite:** suíte de testes da Fase 4 passa integralmente.
**Testes esperados:** os já descritos acima, rodando juntos.
**Riscos/observações:** nenhum.
**Dependências:** INF-001 a INF-008.

---

## Fase 5 — Identity e Autenticação

### AUTH-001 — Modelo e repository de `User`
**Objetivo:** camada `infrastructure` do módulo `identity` para `User`.
**Pré-requisitos:** DB-012.
**Escopo incluído:** repository concreto (Prisma) com criação e busca por e-mail (normalizado para minúsculas).
**Fora do escopo:** hash de senha (próxima tarefa), sessão.
**Arquivos/áreas:** `apps/api/src/modules/identity/infrastructure/`.
**Critérios de aceite:** criar/buscar `User` funciona; e-mail sempre normalizado antes de salvar/consultar.
**Testes esperados:** teste de integração de normalização (`A@x.com` e `a@x.com` colidem).
**Riscos/observações:** nenhum.
**Dependências:** DB-012.

### AUTH-002 — Hash de senha
**Objetivo:** caso de uso de hashing seguro (bcrypt/argon2), isolado.
**Pré-requisitos:** AUTH-001.
**Escopo incluído:** função de hash e de verificação.
**Fora do escopo:** fluxo de login completo.
**Arquivos/áreas:** `apps/api/src/modules/identity/domain/` (interface) + `infrastructure/` (implementação).
**Critérios de aceite:** hash não reversível, verificação correta de senha certa/errada.
**Testes esperados:** teste unitário de hash/verify.
**Riscos/observações:** escolher algoritmo com custo configurável (evitar hardcode de rounds baixos).
**Dependências:** AUTH-001.

### AUTH-003 — Criação de sessão opaca
**Objetivo:** caso de uso que gera token aleatório e salva apenas o hash.
**Pré-requisitos:** AUTH-002, DB-012.
**Escopo incluído:** geração de token com entropia suficiente, hash do token armazenado, nunca o valor bruto.
**Fora do escopo:** endpoint HTTP (isso é AUTH-006).
**Arquivos/áreas:** `apps/api/src/modules/identity/domain/`, `application/`.
**Critérios de aceite:** token bruto nunca aparece em nenhuma query/log; só o hash é persistido.
**Testes esperados:** teste unitário confirmando que o valor salvo no banco não bate com o token bruto retornado.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-002, DB-012.

### AUTH-004 — `CTR-002` (contrato `admin/auth`)
Ver Fase 3 — entregue aqui.

### AUTH-005 — Login (caso de uso + endpoint)
**Objetivo:** `POST /admin/auth/login`.
**Pré-requisitos:** AUTH-003, AUTH-004, INF-004, INF-007.
**Escopo incluído:** validação de credencial, mensagem genérica em erro, rate limit aplicado, cookie de sessão setado.
**Fora do escopo:** MFA, social login.
**Arquivos/áreas:** `identity/presentation/`, `identity/application/`.
**Critérios de aceite:** login correto seta cookie; e-mail ou senha errados retornam a mesma mensagem genérica.
**Testes esperados:** teste de integração de login correto/incorreto; teste de rate limit disparando após N tentativas.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-003, AUTH-004, INF-004, INF-007.

### AUTH-006 — Leitura/validação de sessão (guard de autenticação)
**Objetivo:** guard que resolve `User` a partir do cookie em qualquer rota protegida.
**Pré-requisitos:** AUTH-005.
**Escopo incluído:** validação de expiração/revogação da sessão.
**Fora do escopo:** resolução de `SiteUser`/Role (próxima tarefa).
**Arquivos/áreas:** `identity/presentation/` (guard).
**Critérios de aceite:** sessão expirada/revogada é rejeitada com `401`.
**Testes esperados:** teste de integração com sessão expirada e com sessão revogada.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-005.

### AUTH-007 — Logout
**Objetivo:** `POST /admin/auth/logout`.
**Pré-requisitos:** AUTH-006.
**Escopo incluído:** revogação real da sessão no banco + limpeza do cookie.
**Fora do escopo:** logout de todas as sessões do usuário (fora do MVP).
**Arquivos/áreas:** `identity/presentation/`, `application/`.
**Critérios de aceite:** sessão revogada não autentica mais requisições subsequentes.
**Testes esperados:** teste de integração reutilizando o cookie após logout, esperando `401`.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-006.

### AUTH-008 — `GET /admin/auth/me`
**Objetivo:** endpoint que devolve usuário + lista de Sites com Role.
**Pré-requisitos:** AUTH-006.
**Escopo incluído:** resposta vazia de Sites é estado válido.
**Fora do escopo:** endpoints de gestão de membros.
**Arquivos/áreas:** `identity/presentation/`.
**Critérios de aceite:** usuário sem `SiteUser` recebe lista vazia, não erro.
**Testes esperados:** teste de integração com usuário sem vínculo nenhum.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-006.

### AUTH-009 — Resolução de `SiteUser` e Role (guard de autorização)
**Objetivo:** guard que, dado o `TenantContext` (INF-008) e o `User` autenticado, resolve o `SiteUser` ativo e valida a Role mínima exigida pela rota.
**Pré-requisitos:** AUTH-006, INF-008.
**Escopo incluído:** decorator de Role mínima por rota.
**Fora do escopo:** endpoints de gestão de `SiteUser` (fora do MVP).
**Arquivos/áreas:** `identity/presentation/` (guard), `tenancy/`.
**Critérios de aceite:** usuário sem `SiteUser` ativo no Site alvo é rejeitado com `403`, mesmo sendo `OWNER` em outro Site.
**Testes esperados:** teste de integração de usuário `OWNER` em Site A tentando agir no Site B.
**Riscos/observações:** este teste é o mais importante da fase — reforça o isolamento multi-tenant na camada de autorização.
**Dependências:** AUTH-006, INF-008.

### AUTH-010 — Teste de isolamento entre Sites (dedicado)
**Objetivo:** suíte de integração dedicada, cobrindo leitura e escrita cruzada.
**Pré-requisitos:** AUTH-009.
**Escopo incluído:** tentar ler/escrever entidade de um Site usando sessão/Role de outro Site, em pelo menos um recurso de cada domínio já existente até aqui.
**Fora do escopo:** recursos que ainda não existem (Catalog/Editorial vêm depois — este teste é ampliado nas fases seguintes, não fechado aqui).
**Arquivos/áreas:** testes de integração de `identity`/`tenancy`.
**Critérios de aceite:** toda tentativa cruzada falha.
**Testes esperados:** os próprios testes desta tarefa.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-009.

### AUTH-011 — Teste de usuário sem nenhum Site
**Objetivo:** confirmar que este é um estado válido em todo o sistema, não um erro.
**Pré-requisitos:** AUTH-008.
**Escopo incluído:** login bem-sucedido, `/me` retorna lista vazia, nenhuma ação administrativa é permitida.
**Fora do escopo:** atribuição automática de acesso (nunca deve acontecer).
**Arquivos/áreas:** testes de `identity`.
**Critérios de aceite:** nenhuma exceção é lançada nesse fluxo.
**Testes esperados:** o próprio teste desta tarefa.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-008.

### AUTH-013 — Comando real de bootstrap (`User + Site + SiteUser OWNER`)
**Objetivo:** comando utilizável de verdade, que recebe senha em texto puro, gera o hash via `AUTH-002` e cria os três registros atomicamente.
**Contexto:** correção da revisão — `DB-013` só provou a mecânica da transação com um `passwordHash` de fixture, antes do serviço de hash existir. Esta tarefa é a versão real, agora que `AUTH-002` já existe.
**Pré-requisitos:** DB-013, AUTH-002.
**Escopo incluído:** CLI/script que recebe e-mail, senha e nome do Site; nunca um endpoint HTTP.
**Fora do escopo:** qualquer exposição via API.
**Arquivos/áreas:** `apps/api/src/modules/identity/application/` (ou script equivalente).
**Critérios de aceite:** rodar o comando cria `User + Site + SiteUser(OWNER)` com senha real utilizável no login (`AUTH-005`); falha parcial não deixa nenhum dos três.
**Testes esperados:** teste de integração fazendo login com a senha criada pelo comando.
**Riscos/observações:** nenhum, além do já registrado em `DB-013` (nunca virar endpoint).
**Dependências:** DB-013, AUTH-002.

### AUTH-012 — Marco da Fase 5
**Objetivo:** confirmar toda a suíte de Identity passando em conjunto.
**Pré-requisitos:** AUTH-001 a AUTH-011, AUTH-013.
**Escopo incluído:** rodar a suíte completa.
**Fora do escopo:** nenhum novo código.
**Arquivos/áreas:** nenhum novo.
**Critérios de aceite:** 100% dos testes da Fase 5 passam, incluindo o bootstrap real.
**Testes esperados:** os já descritos.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-001 a AUTH-011, AUTH-013.

---

## Fase 6 — Catalog

### CAT-001 a CAT-007 — Categoria (7 casos de uso)
`CAT-001` criar · `CAT-002` listar (paginado, filtro `archived?`) · `CAT-003` detalhar · **`CAT-004` atualizar — operação interna** (correção da revisão: `CAT-004` deixa de ser controller público; o endpoint HTTP real é `REV-009`, na Fase 14, que persiste via `CAT-004` e depois coordena revalidação) · `CAT-005` arquivar · `CAT-006` desarquivar · **`CAT-007` excluir — operação INTERNA do Catalog** (correção da revisão: Catalog não pode depender de Editorial, então `CAT-007` verifica apenas relações internas do Catalog — se possui Produto — e bloqueia `409` só por isso; a verificação de Artigo vinculado é responsabilidade de `APP-006`, cross-domain, que chama `CAT-007` somente depois de confirmar que não há Artigo vinculado).
**Pré-requisitos comuns:** AUTH-012, CTR-003, INF-008.
**Escopo comum:** `domain/application/infrastructure/presentation` do módulo `catalog`, escopado por `siteId` em toda query.
**Fora do escopo comum:** Produto, Oferta (próximos blocos); verificação de Artigo (fora do Catalog, ver `APP-006`); coordenação de revalidação de `CAT-004` (fora do Catalog, ver `REV-009`).
**Arquivos/áreas:** `apps/api/src/modules/catalog/`.
**Critérios de aceite comuns:** slug único por Site; mesmo slug permitido em Sites diferentes; toda operação exige Role mínima conforme Etapa 13 (`VIEWER` lê, `EDITOR` cria/edita, `OWNER` arquiva/exclui); `CAT-004` e `CAT-007` sozinhos **não** são endpoints administrativos — não expor rota HTTP direta para eles fora da orquestração de `REV-009`/`APP-006`.
**Testes esperados:** um teste por caso de uso + teste dedicado de "mesmo slug em dois Sites diferentes não conflita" + teste de `CAT-007` bloqueando por Produto vinculado + teste garantindo que `CAT-004` não é alcançável via rota HTTP direta.
**Riscos/observações:** nenhum.
**Dependências:** AUTH-012, CTR-003, INF-008.

### CAT-008 a CAT-014 — Produto (7 casos de uso)
`CAT-008` criar · `CAT-009` listar (filtro `categoryId?`, `archived?`, sem busca textual) · `CAT-010` detalhar (inclui ofertas resumidas) · **`CAT-011` atualizar — operação interna** (endpoint HTTP real é `REV-010`) · **`CAT-012` arquivar / `CAT-013` desarquivar — operações internas** (endpoint HTTP real é `REV-011`, cobrindo os dois) · **`CAT-014` excluir — operação INTERNA do Catalog** (correção da revisão: verifica apenas se possui qualquer Oferta — relação interna ao Catalog — e bloqueia `409` só por isso; a verificação de vínculo com Artigo é responsabilidade de `APP-003`, cross-domain, que chama `CAT-014` somente depois de confirmar que não há Artigo vinculado).
**Pré-requisitos comuns:** CAT-001 a CAT-007, CTR-004.
**Demais campos:** mesmo padrão do bloco anterior, aplicado a Produto — `CAT-011`, `CAT-012`, `CAT-013` e `CAT-014` não são endpoints administrativos diretos; as rotas HTTP reais são `REV-010`, `REV-011` e `APP-003`, respectivamente.
**Dependências:** CAT-001 a CAT-007, CTR-004.

### CAT-015 a CAT-021 — Oferta (7 casos de uso)
`CAT-015` criar (valida `affiliateUrl` http(s) e `price > 0`) · `CAT-016` listar (aninhado no Produto) · `CAT-017` detalhar · **`CAT-018` atualizar — operação interna** (endpoint HTTP real é `REV-012`) · **`CAT-019` arquivar / `CAT-020` desarquivar — operações internas** (endpoint HTTP real é `REV-013`, cobrindo os dois) · **`CAT-021` excluir — operação INTERNA do Catalog** (correção da revisão: `CAT-021` **não pode verificar `AffiliateClick`**, pois isso faria Catalog depender de Tracking; `CAT-021` só executa a exclusão física quando já autorizada por quem a chama. A verificação de histórico de clique é responsabilidade de `TRK-010`, cross-domain, criado depois que Tracking existir).
**Pré-requisitos comuns:** CAT-008 a CAT-014, CTR-005.
**Dependências:** CAT-008 a CAT-014, CTR-005.

### CAT-022 — Testes de bloqueio de acesso cruzado no Catalog
**Objetivo:** estender AUTH-010 aos três recursos de Catalog.
**Pré-requisitos:** CAT-001 a CAT-021.
**Escopo incluído:** tentar ler/escrever Categoria/Produto/Oferta de outro Site.
**Critérios de aceite:** toda tentativa falha.
**Dependências:** CAT-001 a CAT-021.

### CAT-023 — Marco da Fase 6
**Objetivo:** suíte completa de Catalog passando.
**Pré-requisitos:** CAT-001 a CAT-022.
**Critérios de aceite:** 100% dos testes da Fase 6 passam.
**Dependências:** CAT-001 a CAT-022.

---

## Fase 7 — Editorial

### EDT-001 a EDT-005 — Autor (5 casos de uso)
`EDT-001` criar (`409` se `userId` já tem Author no Site) · `EDT-002` listar (sem filtro) · `EDT-003` detalhar · **`EDT-004` atualizar — operação interna** (correção da revisão: endpoint HTTP real é `REV-014`, na Fase 14, que persiste via `EDT-004` e depois coordena revalidação) · `EDT-005` excluir (`409` se referenciado por Artigo).
**Pré-requisitos:** AUTH-012, CTR-006.
**Fora do escopo:** coordenação de revalidação de `EDT-004` (fora de Editorial, ver `REV-014`).
**Dependências:** AUTH-012, CTR-006.

### EDT-006 a EDT-009 — Artigo (CRUD base, só `DRAFT`)
`EDT-006` criar (nasce `DRAFT`, sem exigir Produto) · `EDT-007` listar (filtros `status?`, `type?`, `categoryId?`) · `EDT-008` detalhar · `EDT-009` atualizar (`409` fora de `DRAFT`).
**Pré-requisitos:** CAT-023, EDT-001 a EDT-005, CTR-007.
**Dependências:** CAT-023, EDT-001 a EDT-005, CTR-007.

### EDT-010 — Vincular/desvincular/reordenar Produto no Artigo
**Objetivo:** os três casos de uso de `ArticleProduct`.
**Pré-requisitos:** EDT-009.
**Escopo incluído:** só permitido em `DRAFT`; sem exigência de mínimo enquanto não publicado.
**Critérios de aceite:** operação fora de `DRAFT` retorna `409`.
**Testes esperados:** um teste por operação + teste de bloqueio fora de `DRAFT`.
**Dependências:** EDT-009.

### EDT-011 — `CTR-008` (contrato `admin/publication`)
Ver Fase 3 — entregue aqui.

### EDT-012 a EDT-016 — Máquina de estados (5 transições)
`EDT-012` `DRAFT → PENDING_REVIEW` (endpoint real, `submit-for-review`) · `EDT-013` `PENDING_REVIEW → DRAFT` (endpoint real, `revert-to-draft`) · **`EDT-014` operação INTERNA `mark-as-published`** (correção da revisão: Editorial não expõe endpoint/caso de uso administrativo que publique diretamente — `EDT-014` só marca `status = PUBLISHED` e grava `publishedAt`, e só pode ser chamada por `APP-002` depois de todas as validações cross-domain; nenhum controller de Editorial chama `EDT-014` diretamente) · **`EDT-015` `PUBLISHED → ARCHIVED` — operação INTERNA** (correção da revisão: o único caminho HTTP de arquivamento é `POST /archive → REV-004 → EDT-015 → REV-002`; `EDT-015` deixa de ter controller próprio, só é chamável por `REV-004`) · `EDT-016` `ARCHIVED → DRAFT` (endpoint real, `restore-to-draft`, sem revalidação — Etapa 14).
**Pré-requisitos:** EDT-010, EDT-011.
**Critérios de aceite:** cada transição só parte do status de origem correto; qualquer outra transição retorna `409`; nenhuma rota HTTP de Editorial publica ou arquiva um Artigo sem passar por `APP-002`/`REV-003` e `REV-004`, respectivamente.
**Testes esperados:** um teste por transição válida + um teste por transição inválida (matriz completa do enum) + teste garantindo que `EDT-014` e `EDT-015` não são alcançáveis via rota HTTP direta.
**Dependências:** EDT-010, EDT-011.

### EDT-017 — Testes de bloqueio de acesso cruzado no Editorial
Mesmo padrão de CAT-022, aplicado a Autor/Artigo.
**Dependências:** EDT-001 a EDT-016.

### EDT-018 — Marco da Fase 7
**Critérios de aceite:** 100% dos testes da Fase 7 passam, incluindo a matriz completa de transições válidas/inválidas.
**Dependências:** EDT-001 a EDT-017.

---

## Fase 8 — Application Cross-Domain

*Correção da revisão: esta fase termina sem nenhuma dependência da Fase 14 — a coordenação de revalidação foi movida inteiramente para lá (`REV-003/004/005`), porque ela dependia de `REV-001` e criava um ciclo com o marco desta fase.*

### APP-001 — Calcular saúde do Artigo (`/health`)
**Objetivo:** read model não persistido, framing diferente por status (Etapa 14).
**Pré-requisitos:** EDT-018, CAT-023.
**Escopo incluído:** consulta cruzando Editorial + Catalog sem que nenhum dos dois dependa do outro diretamente — a lógica mora só aqui.
**Critérios de aceite:** resultado correto para artigo saudável, com produto sem oferta válida, e sem nenhum produto.
**Testes esperados:** um teste por cenário acima, em cada status.
**Dependências:** EDT-018, CAT-023.

### APP-002 — Publicar Artigo (operação interna, persistência)
**Objetivo:** caso de uso que valida e persiste a publicação — **sem controller HTTP próprio**.
**Contexto:** correção da revisão — o único caminho HTTP de publicação é `POST /publish → REV-003 → APP-002 → EDT-014 → REV-002`. Expor `APP-002` como endpoint direto permitiria publicar sem revalidar, o que não pode acontecer. `APP-002` agora só é chamável por `REV-003`.
**Pré-requisitos:** APP-001.
**Escopo incluído:** valida status `PENDING_REVIEW`, Categoria ativa, ≥1 Produto, cada Produto com Oferta válida, slug único, `metaDescription`, capa; ao final, chama a operação interna `EDT-014` (mark-as-published) para persistir a transição. Falha retorna lista de pendências.
**Fora do escopo:** qualquer rota HTTP própria; disparo de revalidação (isso é `REV-003`, que chama `APP-002` e, só depois do sucesso, aciona o adaptador de revalidação via `REV-002`).
**Critérios de aceite:** publicação só ocorre com todas as condições satisfeitas; falha lista exatamente o que falta; **nenhuma rota HTTP chama `APP-002` diretamente** — só `REV-003`.
**Testes esperados:** um teste por condição de falha isolada + um teste de sucesso completo + teste garantindo que não existe controller expondo `APP-002`.
**Dependências:** APP-001, EDT-014.

### APP-003 — Excluir Produto
**Objetivo:** caso de uso cross-domain completo, com o endpoint HTTP real `DELETE .../products/:id`.
**Contexto:** correção da revisão — não existe mais um caso de uso isolado `validate-product-deletion`; a validação e a execução vivem juntas aqui, já que não há reutilização real que justifique separá-las.
**Pré-requisitos:** APP-001, CAT-014.
**Escopo incluído:** verifica se o Produto está vinculado a algum Artigo (Editorial); se não estiver, chama a operação interna `CAT-014` (que ainda verifica Ofertas, dentro do Catalog) para executar a exclusão física.
**Fora do escopo:** arquivamento (isso agora passa pelos orquestradores de revalidação `REV-011`, na Fase 14, não é chamado diretamente).
**Critérios de aceite:** exclusão bloqueada por vínculo com Artigo retorna erro explícito, nunca arquiva silenciosamente; exclusão bloqueada por Oferta (via `CAT-014`) também retorna erro explícito.
**Testes esperados:** teste de bloqueio por Artigo, teste de bloqueio por Oferta, teste de exclusão bem-sucedida sem nenhum vínculo.
**Dependências:** APP-001, CAT-014.

### APP-004 — Registrar clique e redirecionar
**Objetivo:** caso de uso cross-domain que valida Site/Oferta/Artigo e delega ao Tracking.
**Pré-requisitos:** APP-001.
**Escopo incluído:** validação acontece aqui, não dentro do módulo `tracking` (Etapa 10 — Tracking fica "burro").
**Fora do escopo:** implementação do endpoint HTTP (Fase 9); corpo de resposta amigável do `410` (isso é `TRK-006`, já que é a API/Tracking quem responde diretamente, sem o navegador passar por uma página Next).
**Critérios de aceite:** IDs de Sites diferentes entre Oferta/Artigo são rejeitados antes de qualquer registro.
**Testes esperados:** teste de Oferta e Artigo de Sites diferentes.
**Dependências:** APP-001.

### APP-005 — Descobrir páginas públicas afetadas
**Objetivo:** dado um Produto/Oferta/Autor/Categoria alterado, calcular quais Artigos publicados são afetados.
**Pré-requisitos:** APP-001.
**Escopo incluído:** consulta pura, sem efeito colateral, sem chamar revalidação (isso é `REV-005`, que consome esta consulta a partir da Fase 14).
**Critérios de aceite:** retorna exatamente os Artigos publicados que referenciam a entidade alterada.
**Testes esperados:** teste com entidade referenciada por 0, 1 e N artigos publicados.
**Dependências:** APP-001.

### APP-006 — Excluir Categoria
**Objetivo:** caso de uso cross-domain completo, com o endpoint HTTP real `DELETE .../categories/:id`.
**Contexto:** correção da revisão — mesmo padrão de `APP-003`; Catalog sozinho (`CAT-007`) não pode verificar Artigo, então a orquestração cross-domain mora aqui.
**Pré-requisitos:** APP-001, CAT-007.
**Escopo incluído:** verifica se a Categoria está vinculada a algum Artigo (Editorial); se não estiver, chama a operação interna `CAT-007` (que verifica Produto, dentro do Catalog) para executar a exclusão física.
**Critérios de aceite:** exclusão bloqueada por Artigo ou por Produto retorna erro explícito em ambos os casos, nunca silencioso.
**Testes esperados:** teste de bloqueio por Artigo, teste de bloqueio por Produto, teste de exclusão bem-sucedida.
**Dependências:** APP-001, CAT-007.

### APP-007 — Marco da Fase 8
**Objetivo:** confirmar saúde, publicação persistida, as duas exclusões cross-domain, preparação do redirect e descoberta de páginas afetadas — tudo sem depender de revalidação.
**Critérios de aceite:** 100% dos testes de Application (`APP-001` a `APP-006`) passam.
**Dependências:** APP-001 a APP-006.

---

## Fase 9 — Tracking

### TRK-001 — `CTR-011` (contrato `tracking`)
Ver Fase 3.

### TRK-002 — Endpoint de redirect
**Objetivo:** `GET /r/:siteSlug/:offerId`.
**Pré-requisitos:** APP-004, TRK-001.
**Escopo incluído:** delega validação a APP-004, busca `affiliateUrl` real no banco (nunca aceita URL da requisição).
**Dependências:** APP-004, TRK-001.

### TRK-003 — Leitura de UTM e captura de `referer`/`user-agent`
**Objetivo:** ler `utm_source/medium/campaign` de query, `referer`/`user-agent` de header.
**Pré-requisitos:** TRK-002.
**Escopo incluído:** tratados como telemetria não confiável — nunca usados em decisão de autorização/roteamento.
**Dependências:** TRK-002.

### TRK-004 — Registro de `AffiliateClick`
**Objetivo:** persistência do clique com todos os metadados.
**Pré-requisitos:** TRK-003.
**Dependências:** TRK-003.

### TRK-005 — Resposta `302`
**Objetivo:** redirecionamento real ao `affiliateUrl`.
**Pré-requisitos:** TRK-004.
**Dependências:** TRK-004.

### TRK-006 — Resposta `410` para Oferta arquivada, com corpo amigável
**Objetivo:** resposta `410` que já inclui um corpo simples e compreensível (HTML mínimo ou mensagem clara), sem fallback de página de Produto.
**Contexto:** correção da revisão — o navegador nunca chega a uma página do `apps/fastcompre` quando `/r/...` responde; quem responde é a própria API/Tracking. Por isso o tratamento amigável do `410` precisa morar aqui, não em `WEB-010`.
**Pré-requisitos:** TRK-002.
**Escopo incluído:** corpo de resposta com uma mensagem curta explicando que a oferta não está mais disponível.
**Fora do escopo:** redirecionamento para página de Produto (não existe ainda).
**Critérios de aceite:** resposta `410` legível diretamente no navegador, sem depender de nenhuma página Next.
**Dependências:** TRK-002.

### TRK-007 — Rate limit no redirect
**Objetivo:** aplicar INF-007 nesta rota.
**Pré-requisitos:** TRK-002, INF-007.
**Dependências:** TRK-002, INF-007.

### TRK-008 — Testes de IDs de Sites diferentes
**Objetivo:** Oferta de um Site com `siteSlug` de outro na URL.
**Pré-requisitos:** TRK-002 a TRK-006.
**Critérios de aceite:** sempre rejeitado antes do redirect.
**Dependências:** TRK-002 a TRK-006.

### TRK-009 — Marco da Fase 9
**Critérios de aceite:** 100% dos testes de Tracking passam (`TRK-001` a `TRK-008`).
**Dependências:** TRK-001 a TRK-008.

### TRK-010 — Excluir Oferta (cross-domain, com verificação de clique)
**Objetivo:** único caminho HTTP real para `DELETE .../offers/:id`.
**Contexto:** correção da revisão — `CAT-021` foi reduzida a uma operação interna do Catalog (executa a exclusão só quando já autorizada, sem saber o que é `AffiliateClick`). Esta tarefa é o caso de uso cross-domain que existia faltando: verifica se a Oferta possui `AffiliateClick` (Tracking) e só então chama `CAT-021`. Só pode ser construída depois que Tracking existir de fato — por isso vem depois de `TRK-009`, não na Fase 6/8.
**Pré-requisitos:** TRK-009, CAT-021.
**Escopo incluído:** `409` quando houver `AffiliateClick` vinculado; exclusão física via `CAT-021` quando permitido.
**Fora do escopo:** arquivamento (isso é `REV-013`, sem relação com clique).
**Critérios de aceite:** exclusão bloqueada por clique retorna erro explícito; exclusão sem clique é bem-sucedida.
**Testes esperados:** teste de bloqueio por `AffiliateClick` existente; teste de exclusão sem histórico.
**Riscos/observações:** nenhum.
**Dependências:** TRK-009, CAT-021.

---

## Fase 10 — Uploads

### UPL-001 — `CTR-009` (contrato `admin/uploads`)
Ver Fase 3.

### UPL-002 — Contrato multipart e endpoint
**Objetivo:** `POST /admin/sites/:siteSlug/uploads/images`, Role `EDITOR`.
**Pré-requisitos:** AUTH-012, UPL-001.
**Dependências:** AUTH-012, UPL-001.

### UPL-003 — Definir formatos permitidos e limite de tamanho
**Objetivo:** decisão explícita, documentada antes de qualquer implementação — quais MIME types são aceitos por `purpose` (`PRODUCT`/`ARTICLE_COVER`/`AUTHOR_AVATAR`) e o tamanho máximo em cada caso.
**Contexto:** correção da revisão — a tarefa de decisão precisa existir separada da implementação, para não embutir a escolha silenciosamente dentro do código de validação.
**Pré-requisitos:** UPL-002.
**Escopo incluído:** documento/constante versionada com a decisão (ex: `jpg/png/webp`, limite de 5MB).
**Fora do escopo:** a validação em si (próximas duas tarefas).
**Critérios de aceite:** decisão registrada e referenciada por `UPL-004`/`UPL-005`.
**Dependências:** UPL-002.

### UPL-004 — Validação real de MIME
**Objetivo:** checagem por assinatura de arquivo (magic bytes), não só extensão/`Content-Type` declarado, conforme `UPL-003`.
**Pré-requisitos:** UPL-003.
**Dependências:** UPL-003.

### UPL-005 — Limite de tamanho
**Objetivo:** rejeitar arquivos acima do limite definido em `UPL-003`.
**Pré-requisitos:** UPL-003.
**Dependências:** UPL-003.

### UPL-006 — Geração de nome seguro
**Objetivo:** nome do arquivo sempre gerado pelo servidor, nunca o nome original.
**Pré-requisitos:** UPL-002.
**Dependências:** UPL-002.

### UPL-007 — Definir a porta de armazenamento
**Objetivo:** interface abstrata (`StoragePort`) para gravar/ler arquivo, sem escolher provedor concreto ainda.
**Contexto:** correção da revisão — não presumir Cloudflare R2 implicitamente; a porta é definida primeiro, o adaptador concreto é uma decisão separada e explícita.
**Pré-requisitos:** UPL-004, UPL-005, UPL-006.
**Escopo incluído:** contrato `domain`/`application` do módulo `uploads` (upload, url pública).
**Fora do escopo:** implementação concreta (próxima tarefa).
**Critérios de aceite:** interface testável com um adaptador fake em memória.
**Dependências:** UPL-004, UPL-005, UPL-006.

### UPL-008 — Adaptador de armazenamento inicial
**Objetivo:** implementação concreta da `StoragePort` — **provedor a decidir explicitamente** (ex: disco local para desenvolvimento, ou um serviço compatível com S3/R2 para produção); esta tarefa não escolhe por conta própria, aguarda decisão do usuário antes de implementar.
**Pré-requisitos:** UPL-007.
**Dependências:** UPL-007.

### UPL-009 — Resposta `{ url }`
**Objetivo:** contrato de resposta fechado, consumível pelos formulários de Produto/Artigo/Autor.
**Pré-requisitos:** UPL-008.
**Dependências:** UPL-008.

### UPL-010 — Testes de arquivo inválido
**Objetivo:** MIME incorreto, tamanho excedido, nome malicioso (path traversal).
**Pré-requisitos:** UPL-002 a UPL-009.
**Dependências:** UPL-002 a UPL-009.

### UPL-011 — Marco da Fase 10
**Critérios de aceite:** 100% dos testes de Uploads passam.
**Dependências:** UPL-001 a UPL-010.

*Nota: toda referência a `UPL-009` como marco em tarefas de outras fases (Admin) passa a apontar para `UPL-011`.*

---

## Fase 11 — API Pública

### PUB-001 — `CTR-010` (contrato `public`)
Ver Fase 3.

### PUB-002 — Listagem pública de Artigos
**Objetivo:** `GET /public/sites/:siteSlug/articles`, só `PUBLISHED`, paginado.
**Pré-requisitos:** EDT-018, PUB-001.
**Dependências:** EDT-018, PUB-001.

### PUB-003 — Detalhe público por slug
**Objetivo:** `GET /public/sites/:siteSlug/articles/:slug`, retornando `categorySlug`.
**Pré-requisitos:** PUB-002.
**Critérios de aceite:** `404` se não publicado, mesmo que o slug exista em outro status.
**Dependências:** PUB-002.

### PUB-004 — Categoria pública
**Objetivo:** `GET /public/sites/:siteSlug/categories/:slug`.
**Pré-requisitos:** PUB-002.
**Dependências:** PUB-002.

### PUB-005 — Ordenação da Home por `publishedAt DESC`
**Objetivo:** endpoint/query usado pela Home, com tiebreaker estável.
**Pré-requisitos:** PUB-002.
**Dependências:** PUB-002.

### PUB-006 — Garantia de não exposição de Draft/Review/Archived
**Objetivo:** teste dedicado, em todos os endpoints públicos.
**Pré-requisitos:** PUB-002 a PUB-005.
**Dependências:** PUB-002 a PUB-005.

### PUB-007 — Marco da Fase 11
**Critérios de aceite:** 100% dos testes da API pública passam.
**Dependências:** PUB-001 a PUB-006.

---

## Fase 12 — FastCompre Público

### WEB-001 — Cliente da API pública
**Objetivo:** wrapper de fetch server-side em `apps/fastcompre`.
**Pré-requisitos:** PUB-007.
**Dependências:** PUB-007.

### WEB-002 — Home
**Objetivo:** `app/page.tsx`, lista de artigos recentes.
**Pré-requisitos:** WEB-001.
**Dependências:** WEB-001.

### WEB-003 — Página de Categoria
**Objetivo:** `app/[categorySlug]/page.tsx`.
**Pré-requisitos:** WEB-001.
**Dependências:** WEB-001.

### WEB-004 — Página de Artigo
**Objetivo:** `app/[categorySlug]/[articleSlug]/page.tsx`.
**Pré-requisitos:** WEB-001.
**Dependências:** WEB-001.

### WEB-005 — Metadados de SEO
**Objetivo:** title/description dinâmicos por artigo (sem JSON-LD persistido — derivado na renderização, Etapa 11).
**Pré-requisitos:** WEB-004.
**Dependências:** WEB-004.

### WEB-006 — URL canônica e redirecionamento permanente
**Objetivo:** conferir `categorySlug` da URL contra o real; 301 se divergente, 404 se artigo inexistente.
**Pré-requisitos:** WEB-004.
**Dependências:** WEB-004.

### WEB-007 — Sitemap
**Objetivo:** `app/sitemap.ts` percorrendo **toda** a listagem pública paginada da API, não apenas a primeira página.
**Contexto:** correção da revisão — sitemap incompleto por parar na primeira página prejudicaria indexação de artigos mais antigos.
**Pré-requisitos:** WEB-001, PUB-002.
**Critérios de aceite:** sitemap contém todos os artigos `PUBLISHED`, mesmo com centenas de páginas de resultado.
**Dependências:** WEB-001, PUB-002.

### WEB-008 — Robots
**Objetivo:** `app/robots.ts`.
**Pré-requisitos:** WEB-001.
**Dependências:** WEB-001.

### WEB-009 — Link afiliado apontando para `/r/...`
**Objetivo:** todo link de produto na página do artigo aponta para o endpoint de redirect, nunca direto ao marketplace.
**Pré-requisitos:** WEB-004, TRK-009.
**Dependências:** WEB-004, TRK-009.

### WEB-010 — Tratamento de `404`
**Objetivo:** página de erro dedicada para artigo inexistente.
**Contexto:** correção da revisão — o tratamento de `410` saiu daqui e foi para `TRK-006`, porque o navegador nunca está numa página Next quando `/r/...` responde.
**Pré-requisitos:** WEB-004.
**Dependências:** WEB-004.

### WEB-011 — Marco da Fase 12
**Critérios de aceite:** navegação completa Home → Categoria → Artigo → redirect funcionando fim a fim contra a API real.
**Dependências:** WEB-001 a WEB-010.

---

## Fase 13 — Admin

### ADM-001 — Cliente da API com cookie
**Objetivo:** wrapper de fetch server-side em `apps/admin`, enviando credenciais.
**Pré-requisitos:** AUTH-012.
**Dependências:** AUTH-012.

### ADM-002 — Login
**Objetivo:** `app/login/page.tsx`.
**Pré-requisitos:** ADM-001.
**Dependências:** ADM-001.

### ADM-003 — Página raiz (zero/um/múltiplos Sites)
**Objetivo:** `app/page.tsx`, consumindo `/admin/auth/me`.
**Pré-requisitos:** ADM-002.
**Dependências:** ADM-002.

### ADM-004 — Layout autenticado e navegação
**Objetivo:** `app/[siteSlug]/layout.tsx`, seletor de Site disponível no layout.
**Pré-requisitos:** ADM-003.
**Dependências:** ADM-003.

### ADM-005 — Telas de Categoria (lista + form)
**Pré-requisitos:** ADM-004, CAT-023.
**Dependências:** ADM-004, CAT-023.

### ADM-006 — Telas de Produto + Ofertas embutidas
**Pré-requisitos:** ADM-004, CAT-023, UPL-011.
**Dependências:** ADM-004, CAT-023, UPL-011.

### ADM-007 — Telas de Autor
**Pré-requisitos:** ADM-004, EDT-018, UPL-011.
**Dependências:** ADM-004, EDT-018, UPL-011.

### ADM-008 — Tela de listagem de Artigos
**Pré-requisitos:** ADM-004, EDT-018.
**Dependências:** ADM-004, EDT-018.

### ADM-009 — Editor de Artigo — modo `DRAFT`
**Objetivo:** `app/[siteSlug]/articles/new` → redireciona para `[id]`; formulário editável completo.
**Pré-requisitos:** ADM-008, UPL-011.
**Dependências:** ADM-008, UPL-011.

### ADM-010 — Editor de Artigo — modo decisão (demais status)
**Objetivo:** painel de transição para `PENDING_REVIEW`/`PUBLISHED`/`ARCHIVED`, sem campos editáveis.
**Pré-requisitos:** ADM-009, APP-007.
**Dependências:** ADM-009, APP-007.

### ADM-011 — Checklist `/health` na tela de Artigo
**Objetivo:** framing diferente por status (preparação, prontidão, operacional, informativo).
**Pré-requisitos:** ADM-010.
**Dependências:** ADM-010.

### ADM-012 — Visibilidade de ações por Role
**Objetivo:** esconder botões de ação não autorizada na UI (a API continua sendo a autoridade real).
**Pré-requisitos:** ADM-005 a ADM-011.
**Dependências:** ADM-005 a ADM-011.

### ADM-013 — Marco da Fase 13
**Objetivo:** confirmar o fluxo completo na interface, incluindo a sincronização real com o site público.
**Contexto:** correção da revisão — "publicar e ver ao vivo" só é verdade se a revalidação também estiver funcionando; por isso este marco passa a depender também de `REV-017`, não só das telas do admin.
**Critérios de aceite:** fluxo completo — login → criar Produto/Oferta → criar Artigo → publicar → **página pública refletindo a mudança sem espera manual** — funcionando fim a fim na interface.
**Dependências:** ADM-001 a ADM-012, REV-017.

---

## Fase 14 — Revalidação

*Correção da revisão: esta fase agora absorve toda a coordenação que antes vivia em `APP-006` (removida da Fase 8) — é aqui, e só aqui, que a publicação/arquivamento se conecta à revalidação, evitando o ciclo `APP-006 → REV-001 → (marco da Fase 8)`. Além disso, esta fase agora é o único ponto de entrada HTTP para publicar, arquivar Artigo, e para toda alteração de Categoria/Produto/Oferta/Autor que possa afetar um Artigo publicado — as operações internas de domínio (`APP-002`, `EDT-015`, `CAT-004/011/012/013/018/019/020`, `EDT-004`) nunca são chamadas por um controller fora daqui.*

### REV-001 — `CTR-012` (contrato `internal/revalidation`) + endpoint interno
**Objetivo:** `apps/fastcompre` `/api/internal/revalidate/route.ts`, autenticado por segredo compartilhado.
**Pré-requisitos:** WEB-004.
**Dependências:** WEB-004.

### REV-002 — Adaptador cliente de revalidação (lado da API)
**Objetivo:** módulo em `apps/api` que sabe chamar `REV-001` (URL, segredo, payload `{ siteSlug, articleSlug }`), isolado como adapter.
**Contexto:** correção da revisão — este adaptador não existia como tarefa própria antes; é a peça que `REV-003/004/005/009..014` usam para efetivamente disparar a chamada HTTP.
**Pré-requisitos:** REV-001.
**Dependências:** REV-001.

### REV-003 — `POST .../articles/:id/publish` (único caminho HTTP de publicação)
**Objetivo:** controller + caso de uso HTTP-facing que orquestra `APP-002 → EDT-014 → REV-002`.
**Contexto:** correção da revisão — o fluxo passa a ser exatamente `POST /publish → REV-003 → APP-002 → EDT-014 → REV-002`. É `REV-003`, não `APP-002`, que expõe a rota HTTP.
**Pré-requisitos:** APP-002, REV-002.
**Escopo incluído:** chama `APP-002` (que por sua vez chama `EDT-014` internamente); só em caso de sucesso aciona `REV-002`. Chamada síncrona; falha na revalidação não desfaz a publicação já persistida.
**Critérios de aceite:** publicar sem revalidar é impossível — não existe caminho de código que persista `PUBLISHED` sem, em seguida, tentar revalidar.
**Testes esperados:** teste de publicação completa incluindo a chamada ao adaptador; teste de falha de revalidação sem reversão da publicação.
**Dependências:** APP-002, REV-002.

### REV-004 — `POST .../articles/:id/archive` (único caminho HTTP de arquivamento)
**Objetivo:** controller + caso de uso HTTP-facing que orquestra `EDT-015 → REV-002`.
**Contexto:** mesmo padrão de `REV-003` — `EDT-015` não tem controller próprio.
**Pré-requisitos:** EDT-015, REV-002.
**Escopo incluído:** chama `EDT-015`, e só em caso de sucesso aciona `REV-002`.
**Critérios de aceite:** arquivar sem revalidar é impossível, pelo mesmo motivo de `REV-003`.
**Dependências:** EDT-015, REV-002.

### REV-005 — Mecanismo de coordenação após alteração em dependências
**Objetivo:** função reutilizável que usa `APP-005` para descobrir páginas publicadas afetadas por uma mudança em Categoria/Produto/Oferta/Autor, e aciona `REV-002` para cada uma.
**Contexto:** este é o mecanismo comum consumido pelos seis orquestradores HTTP-facing abaixo (`REV-009` a `REV-014`) — não é um endpoint em si.
**Pré-requisitos:** APP-005, REV-002.
**Dependências:** APP-005, REV-002.

### REV-009 — `PATCH .../categories/:id` com revalidação
**Objetivo:** único caminho HTTP para atualizar Categoria.
**Contexto:** correção da revisão — `CAT-004` deixou de ser controller público; este orquestrador executa a operação interna, persiste, usa `REV-005` para achar Artigos publicados afetados, aciona `REV-002`, e loga falha sem reverter.
**Pré-requisitos:** CAT-004, REV-005.
**Dependências:** CAT-004, REV-005.

### REV-010 — `PATCH .../products/:id` com revalidação
**Objetivo:** único caminho HTTP para atualizar Produto.
**Pré-requisitos:** CAT-011, REV-005.
**Escopo incluído:** mesmo padrão de `REV-009`, aplicado a `CAT-011`.
**Dependências:** CAT-011, REV-005.

### REV-011 — `POST .../products/:id/archive` e `/unarchive` com revalidação
**Objetivo:** único caminho HTTP para arquivar/desarquivar Produto (os dois endpoints, mesmo padrão de orquestração).
**Pré-requisitos:** CAT-012, CAT-013, REV-005.
**Dependências:** CAT-012, CAT-013, REV-005.

### REV-012 — `PATCH .../offers/:id` com revalidação
**Objetivo:** único caminho HTTP para atualizar Oferta.
**Pré-requisitos:** CAT-018, REV-005.
**Dependências:** CAT-018, REV-005.

### REV-013 — `POST .../offers/:id/archive` e `/unarchive` com revalidação
**Objetivo:** único caminho HTTP para arquivar/desarquivar Oferta.
**Pré-requisitos:** CAT-019, CAT-020, REV-005.
**Dependências:** CAT-019, CAT-020, REV-005.

### REV-014 — `PATCH .../authors/:id` com revalidação
**Objetivo:** único caminho HTTP para atualizar Autor.
**Pré-requisitos:** EDT-004, REV-005.
**Dependências:** EDT-004, REV-005.

### REV-015 — Logging estruturado de falha
**Objetivo:** log capturando Site, recurso alterado, ID do recurso, Artigos afetados, erro, data e hora — sem flag persistida, fila, outbox ou retry.
**Pré-requisitos:** REV-003, REV-004, REV-009 a REV-014, INF-002.
**Dependências:** REV-003, REV-004, REV-009 a REV-014, INF-002.

### REV-016 — Garantia de não-reversão em falha
**Objetivo:** teste dedicado confirmando que falha na chamada de revalidação não desfaz a transação já persistida (publicação, arquivamento, ou qualquer uma das seis alterações de dependência).
**Pré-requisitos:** REV-015.
**Dependências:** REV-015.

### REV-017 — Marco da Fase 14
**Objetivo:** confirmar publicação/arquivamento/alteração de dependência disparando revalidação de fato, com falha isolada e logada, e nenhum caminho HTTP alternativo contornando a coordenação.
**Critérios de aceite:** 100% dos testes de revalidação (`REV-001` a `REV-016`) passam.
**Dependências:** REV-001 a REV-016.

*Nota: toda referência anterior a `REV-008` como marco em outras fases (`ADM-013`, `MVP-M01`) passa a apontar para `REV-017`.*

---


## Fase 15 — Qualidade e Entrega do MVP

### QA-001 — Testes unitários (varredura de cobertura)
**Objetivo:** garantir cobertura mínima combinada nos módulos de domínio.
**Pré-requisitos:** todas as fases anteriores.

### QA-002 — Testes de integração (varredura)
**Objetivo:** confirmar que toda a suíte descrita nas fases anteriores está de fato presente e passando junta.
**Pré-requisitos:** QA-001.

### QA-003 — Testes de isolamento multi-tenant (consolidação final)
**Objetivo:** suíte única cobrindo todos os recursos (Catalog, Editorial, Tracking, Uploads) contra acesso cruzado entre Sites.
**Pré-requisitos:** QA-002.

### QA-004 — Testes da máquina de estados (consolidação final)
**Objetivo:** matriz completa de transições válidas/inválidas revalidada de ponta a ponta.
**Pré-requisitos:** QA-002.

### QA-005 — Testes dos endpoints públicos (consolidação final)
**Pré-requisitos:** QA-002.

### QA-006 — Testes do redirect (consolidação final)
**Pré-requisitos:** QA-002.

### QA-007 — Revisão de segurança
**Objetivo:** checklist manual — cookies, CORS, CSRF, rate limit, validação de MIME, SQL injection (via Prisma, risco baixo mas revisar raw queries se existirem).
**Pré-requisitos:** QA-002.

### QA-008 — Seed/bootstrap documentado
**Objetivo:** documentar o passo a passo do comando real `AUTH-013` (que usa senha real e hash de verdade) para qualquer pessoa nova rodando o projeto.
**Contexto:** correção da revisão — `DB-013` usa apenas hash de fixture e não é o comando utilizável; a documentação deve apontar para `AUTH-013`.
**Pré-requisitos:** AUTH-013.

### QA-009 — Variáveis de ambiente documentadas
**Objetivo:** `.env.example` completo e comentado.
**Pré-requisitos:** DB-002.

### QA-010 — Docker Compose final
**Objetivo:** confirmar que sobe API + Postgres com um único comando, para onboarding.
**Pré-requisitos:** DB-003.

### QA-011 — Estender o CI com testes
**Objetivo:** ampliar o workflow já criado em `MONO-011` (build/lint/typecheck) para incluir a suíte de testes.
**Pré-requisitos:** MONO-011, QA-001 a QA-006.

### QA-012 — Checklist final do MVP
**Objetivo:** conferência manual de todo o escopo definido na Etapa 2 (funcionalidades obrigatórias) contra o que foi de fato entregue.
**Pré-requisitos:** QA-001 a QA-011.

---

## Caminho Crítico (corrigido, definitivo)

```
MONO-001..010 → MONO-011 (CI) → DB-001..013 → INF-001..009 → AUTH-001..013
  → CAT-001..023 → EDT-001..018 → APP-001..007 (sem revalidação, sem ciclo)
  → [ramo necessário: PUB-001..004 → WEB-001..004, pois REV-001 depende de WEB-004]
  → REV-001..017 (endpoint interno + adaptador + os dois caminhos HTTP de publish/archive
     + os 6 orquestradores de dependência + logging + marco)
  → ADM-001..013 (depende de REV-017 para fechar seu marco)
  → MVP-M01
```

**Correção sobre o ramo Pub/Web:** `REV-001` (o endpoint interno de revalidação) mora em `apps/fastcompre` e depende de `WEB-004` existir — então uma fatia de `PUB-001..004 → WEB-001..004` deixa de ser puramente paralela e entra no caminho necessário até a Fase 14 poder começar. O restante de `PUB-005..007`/`WEB-005..011` (SEO, canônico, sitemap, robots, tratamento de erro) continua paralelo, sem bloquear Revalidação.

## Tarefas Paralelizáveis (corrigido, definitivo)

- **Fase 3 (contratos)** não bloqueia nada por si só — cada `CTR-00X` é paralelo ao desenvolvimento da fase que a antecede diretamente, e cada schema agora é Zod + `z.infer`.
- **UPL-001..011 (Uploads)** roda em paralelo a CAT/EDT assim que `AUTH-012` está pronto. A decisão de provedor de armazenamento (`UPL-008`) é um ponto de espera explícito.
- **`TRK-001..009`** roda em paralelo a `PUB-001..004`/`WEB-001..004` — ambos dependem de `APP-004`/`APP-001` respectivamente, mas não um do outro. **`TRK-010`** só entra depois de `TRK-009` e `CAT-021`.
- **`PUB-005..007`/`WEB-005..011`** (a parte que não bloqueia Revalidação) continuam paralelos ao restante, desde que `PUB-001..004`/`WEB-001..004` já tenham sido entregues.
- **`REV-009..014`** (os seis orquestradores de dependência) podem ser construídos em paralelo entre si, uma vez que `REV-005` e os respectivos `CAT-*`/`EDT-004` internos já existam.
- **`ADM-013` é o ponto de convergência final**: só fecha depois de `REV-017`, então Admin e Revalidação deixam de ser totalmente paralelos ao final — Admin pode ser construído em paralelo, mas seu marco espera a Fase 14 completa.

## Primeiro Marco Executável

**MONO-011** — workspace com os 3 apps vazios buildando/lintando/typechecando juntos, com CI validando isso automaticamente a cada push.

## Primeiro Marco com Valor de Produto

**`MVP-M01` — Fluxo editorial afiliado fim a fim.**
**Dependências:** `ADM-013`, `WEB-011`, `TRK-009`, `TRK-010`, `UPL-011`, `REV-017`.
**Critério de aceite:** `OWNER` entra → cria Categoria → Produto → Oferta → Autor → Artigo → envia para revisão → publica (via `REV-003`, único caminho HTTP) → página pública aparece (via revalidação real) → clique no link é registrado → `302` para o marketplace.

## Definição de Pronto da Etapa 16 (corrigida, definitiva)

- Todas as fases têm tarefas quebradas em capacidades pequenas e verificáveis, nenhuma tarefa ampla do tipo "implementar módulo inteiro".
- Toda tarefa (ou bloco de tarefas agrupadas, com campos comuns declarados uma vez) tem os 11 campos obrigatórios cobertos.
- **Dependências entre tarefas formam um grafo sem ciclos** — os ciclos identificados nas duas rodadas de revisão (exclusão de Produto/Categoria/Oferta, publicação e arquivamento duplicados, revalidação na Fase 8) foram resolvidos, e existe **um único caminho HTTP** para publicar, arquivar, e para toda alteração de Categoria/Produto/Oferta/Autor que possa afetar Artigo publicado.
- Caminho crítico corrigido (incluindo a dependência real de `REV-001` em `WEB-004`), paralelizáveis corrigidos, marco executável (`MONO-011`) e marco de valor de produto (`MVP-M01`) identificados.
- Nenhuma tarefa desta lista implementa IA, histórico de preço, busca, tags, gestão de membros de Site, ou QuickDealDay.
- Decisões antes implícitas (armazenamento, formatos/limite de upload) agora são tarefas explícitas de decisão, não escolhas embutidas em tarefas de implementação.
- Backlog aprovado pelo usuário — pronto para iniciar a Etapa 17.
