/**
 * Valor fixo de `NEXT_PUBLIC_API_URL` para toda a suíte, exceto
 * `env.spec.ts` (que testa a própria validação e sobrescreve `process.env`
 * por teste, com `jest.resetModules()` + import dinâmico — ver esse
 * arquivo). Executado por `setupFiles` (config do Jest), portanto antes do
 * framework de teste e de qualquer módulo do próprio arquivo de teste serem
 * carregados — momento certo para uma variável lida por um módulo
 * (`env.ts`) validado na importação. Mesmo padrão de
 * `apps/fastcompre/jest.setup.ts`.
 */
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
