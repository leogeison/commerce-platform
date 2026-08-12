/**
 * `@testing-library/jest-dom/jest-globals` (não o entrypoint padrão
 * `@testing-library/jest-dom`) — os specs deste projeto importam `expect`
 * de `@jest/globals` (padrão já usado em `env.spec.ts`/`api-client.spec.ts`
 * desde ADM-001), não o global ambiente `jest`/`expect` clássico. A
 * augmentation de tipos (`toBeInTheDocument`, `toHaveTextContent`, etc.) só
 * se aplica à interface `Matchers` de `@jest/globals` através deste
 * entrypoint específico; o padrão (`@testing-library/jest-dom`) estende
 * apenas o namespace global `jest.Matchers`, que não é o que `tsc` resolve
 * aqui — sem isso, `tsc --noEmit` falha com "Property 'toBeInTheDocument'
 * does not exist" nos specs de componente.
 */
import '@testing-library/jest-dom/jest-globals';

/**
 * Valor fixo de `NEXT_PUBLIC_API_URL` para toda a suíte, exceto
 * `env.spec.ts` (que testa a própria validação e sobrescreve `process.env`
 * por teste, com `jest.resetModules()` + import dinâmico — ver esse
 * arquivo). Executado por `setupFilesAfterEnv` (ADM-002; era `setupFiles`
 * na ADM-001) — necessário para que `@testing-library/jest-dom` estenda o
 * `expect` depois que o ambiente Jest já está instalado. `process.env`
 * continua sendo aplicado antes de qualquer arquivo de teste importar
 * `./env`, mesmo com essa troca — `setupFilesAfterEnv` roda depois do
 * ambiente, mas ainda antes do arquivo de teste em si.
 */
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000';
