import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS restrito à origem exata do `apps/admin` (INF-005; Architecture.md,
 * Seção 15 — "Configuração do cookie (produção)": "a API permite somente a
 * origem exata do painel via CORS").
 *
 * `credentials: true` é obrigatório porque o admin autentica via cookie de
 * sessão (`credentials: include` no fetch do admin, INF-004) — sem isso o
 * navegador não envia nem aceita o cookie em requisições cross-origin.
 *
 * CORS de rotas públicas (mais permissivo) é tratado à parte quando existir
 * — fora do escopo desta tarefa.
 *
 * Extraído numa função própria (em vez de inline em `main.ts`) para que o
 * mesmo conjunto de opções possa ser aplicado nos testes de integração, que
 * montam a aplicação via `Test.createTestingModule` sem passar pelo
 * bootstrap real.
 *
 * `origin` é uma função, não a string fixa direto — o pacote `cors` trata
 * uma string estática de forma diferente do que se espera aqui: ele sempre
 * ecoa esse valor fixo em `Access-Control-Allow-Origin`, em toda resposta,
 * independente da origem real da requisição, em vez de refletir a origem
 * recebida só quando ela bate com a permitida (e omitir o header quando não
 * bate). A função abaixo decide explicitamente: sem header `Origin` (mesma
 * origem, chamada servidor-a-servidor, curl) deixa passar sem restringir;
 * `Origin` igual à do admin é permitida (refletida de volta); qualquer
 * outra é negada — sem `Access-Control-Allow-Origin` na resposta.
 */
export function buildCorsOptions(adminOrigin: string): CorsOptions {
  return {
    origin: (requestOrigin, callback) => {
      const isAllowed = !requestOrigin || requestOrigin === adminOrigin;
      callback(null, isAllowed);
    },
    credentials: true,
  };
}
