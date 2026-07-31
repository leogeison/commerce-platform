import { config } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Carrega `apps/api/.env` (se existir) ANTES de qualquer arquivo de teste
 * ser avaliado pelo Jest (setupFiles roda antes dos módulos de teste).
 * Mesmo mecanismo já usado em `apps/api/prisma.config.ts` para o mesmo
 * propósito (carregar `.env` fora do bootstrap do Nest) — `dotenv` já é
 * devDependency do projeto, nenhuma dependência nova.
 *
 * `dotenv` nunca sobrescreve uma variável já definida em `process.env`, e
 * `.env` não existir não é erro (dotenv simplesmente não faz nada) — por
 * isso os fallbacks fictícios abaixo continuam como estavam, servindo os
 * specs que não tocam banco (health check, CORS, logging etc.) sempre que
 * o `.env` real não estiver presente (ex.: CI) ou não definir alguma
 * variável específica.
 *
 * Com `.env` local presente (fluxo normal de desenvolvimento), os valores
 * reais entram no `process.env` antes dos `??=` abaixo, que passam a não
 * fazer nada — os testes que exigem Postgres real (`database.e2e-spec.ts`,
 * `provision-tenant.e2e-spec.ts`, `prisma-user.repository.e2e-spec.ts`)
 * passam a usar o banco local automaticamente, sem exportar nada
 * manualmente no shell.
 */
config({ path: resolve(__dirname, '../.env') });

process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET ??= 'e2e-test-session-secret-0000000';
process.env.REVALIDATION_SECRET ??= 'e2e-test-revalidation-secret-00';
process.env.ADMIN_ORIGIN ??= 'http://localhost:3001';
