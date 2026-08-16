# syntax=docker/dockerfile:1
#
# Imagem "local-runtime" da API (QA-010) — bootstrap via `docker compose up
# --build`, para onboarding. NÃO substitui `pnpm dev:api` (hot-reload,
# fluxo de desenvolvimento do dia a dia, ver scripts/dev-api.mjs), que
# continua o único jeito documentado de desenvolver localmente.
#
# ---- build ----
# node:22-bookworm-slim (glibc), não Alpine: `argon2` (dependency real de
# apps/api, não dev) compila um binário nativo na instalação (allowBuilds:
# argon2 em pnpm-workspace.yaml) — glibc é o alvo mais confiável para esse
# binário, e o estágio `runtime` abaixo reaproveita a MESMA imagem base
# para garantir compatibilidade binária entre build e execução.
FROM node:22-bookworm-slim AS build
WORKDIR /repo

# Toolchain de build nativo, exigido pela compilação do argon2 na
# instalação (python3/make/g++ — node-gyp).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

# Contexto completo do monorepo (filtrado por .dockerignore, que exclui
# node_modules/dist/.next/.env/etc. de todos os workspaces) — necessário
# porque `pnpm install --frozen-lockfile` na raiz valida o lockfile contra
# TODOS os workspaces declarados (apps/*, packages/*), não só apps/api.
COPY . .

RUN pnpm install --frozen-lockfile

# DATABASE_URL fictícia: prisma.config.ts usa env('DATABASE_URL') (helper
# de prisma/config), que lança erro se a variável estiver ausente — mas
# `prisma generate` nunca abre conexão real com o banco (mesmo valor de
# conveniência já usado em .github/workflows/ci.yml, passo "Generate
# Prisma Client").
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    pnpm --filter api exec prisma generate

RUN pnpm --filter @commerce-platform/contracts build
RUN pnpm --filter api build

# Deploy prod-only e autocontido de apps/api (`pnpm --filter ... deploy`):
# resolve @commerce-platform/contracts (workspace:*) para dentro do
# próprio node_modules do pacote gerado (via o content-addressable store
# do pnpm), em vez de depender de um symlink relativo para fora da imagem
# final — dispensa preservar a árvore de diretórios do monorepo inteiro no
# estágio de runtime.
#
# `pnpm prune --prod` foi avaliado e descartado (QA-010): neste workspace,
# ele remove os symlinks locais de apps/api/node_modules (inclusive o de
# @commerce-platform/contracts) mesmo com os pacotes ainda presentes no
# store da raiz, quebrando a resolução de módulos em runtime (`Cannot find
# module '@nestjs/core'`, reproduzido e confirmado antes de implementar).
#
# `--legacy` é obrigatório aqui: a partir do pnpm v10, `pnpm deploy` só
# funciona sem essa flag se o workspace tiver "inject-workspace-packages"
# habilitado (não é o caso deste monorepo, e não estamos habilitando só
# para isso) — sem `--legacy`, falha com ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE
# (reproduzido com pnpm 11.17.0, a versão de packageManager do projeto).
# Com `--legacy`, volta ao mesmo comportamento (symlink para dentro do
# content-addressable store) já validado de ponta a ponta: `node
# dist/main.js` a partir do diretório gerado sobe a aplicação Nest
# completa, com todas as rotas mapeadas.
RUN pnpm --filter api deploy --prod --legacy /out/api

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Diretório autocontido gerado pelo `pnpm deploy` no estágio anterior —
# já inclui dist/, node_modules/ (só dependências de produção) e
# package.json. Sem CLI do Prisma, sem prisma/ (migrations), sem
# devDependencies: migrations rodam no serviço `migrate` (compose), que
# usa o estágio `build` acima, não este.
COPY --from=build /out/api ./

EXPOSE 3000
CMD ["node", "dist/main.js"]
