/**
 * Valores fixos de `SITE_SLUG`/`API_URL` para toda a suíte, exceto
 * `env.spec.ts` (que testa a própria validação e sobrescreve `process.env`
 * por teste, com `jest.resetModules()` + import dinâmico — ver esse
 * arquivo). Executado por `setupFiles` (config do Jest), portanto antes do
 * framework de teste e de qualquer módulo do próprio arquivo de teste serem
 * carregados — momento certo para variáveis lidas por um módulo (`env.ts`)
 * validado na importação.
 */
process.env.SITE_SLUG = 'test-site';
process.env.API_URL = 'http://localhost:3000';
process.env.SITE_URL = 'http://localhost:3001';
process.env.AFFILIATE_REDIRECT_URL = 'http://localhost:3000';
process.env.REVALIDATION_SECRET = 'test-revalidation-secret-value';
