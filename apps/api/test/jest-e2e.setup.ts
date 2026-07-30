/**
 * Define variáveis de ambiente de teste ANTES de qualquer arquivo de teste
 * ser carregado pelo Jest (setupFiles roda antes da avaliação dos módulos
 * de teste). Necessário porque `AppConfigModule` valida `process.env` de
 * forma síncrona no momento em que `config.module.ts` é importado — não é
 * lazy, não espera o bootstrap do Nest.
 *
 * Valores fictícios, isolados de qualquer `.env` local e nunca usados para
 * uma conexão real (Prisma ainda não existe nesta fase do backlog).
 */
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET ??= 'e2e-test-session-secret-0000000';
process.env.REVALIDATION_SECRET ??= 'e2e-test-revalidation-secret-00';
process.env.ADMIN_ORIGIN ??= 'http://localhost:3001';
