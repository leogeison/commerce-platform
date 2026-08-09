import 'server-only';
import { z } from 'zod';

/**
 * Configuração server-only de `apps/fastcompre` (WEB-001).
 *
 * Validada com Zod no momento em que este módulo é importado: a primeira
 * chamada que importar este módulo (direta ou indiretamente, via
 * `public-api/client`) falha imediatamente e com mensagem clara, em vez de
 * deixar `SITE_SLUG`/`API_URL` ausentes se manifestarem como um erro
 * obscuro mais adiante.
 *
 * `import 'server-only'` garante em build-time que nenhum Client Component
 * importe este módulo por engano.
 */
const envSchema = z.object({
  /**
   * `Site.slug` que este deployment representa (Architecture.md §17: é um
   * identificador público de conteúdo, nunca credencial). Fixo por
   * deployment — resolução por hostname/domínio está fora do escopo desta
   * fase.
   */
  SITE_SLUG: z.string().min(1),
  /** URL base da API (`apps/api`), sem barra final exigida. */
  API_URL: z.string().url(),
});

export const env = envSchema.parse({
  SITE_SLUG: process.env.SITE_SLUG,
  API_URL: process.env.API_URL,
});
