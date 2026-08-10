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
  /**
   * Origem pública absoluta deste deployment (WEB-007) — usada para montar
   * URLs absolutas (ex.: `sitemap.xml`). Restrita a `protocol://host[:port]`,
   * sem path/query/hash: `new URL('/algo', SITE_URL)` descarta qualquer path
   * presente em `SITE_URL` silenciosamente, então um valor como
   * `https://fastcompre.com.br/base` faria `/base` desaparecer sem aviso —
   * o `.refine()` abaixo rejeita isso na validação, em vez de deixar
   * acontecer sem ninguém perceber.
   */
  SITE_URL: z.string().url().refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.pathname === '/' && url.search === '' && url.hash === '';
      } catch {
        return false;
      }
    },
    { message: 'SITE_URL deve ser só a origem (protocol://host[:port]), sem path/query/hash.' },
  ),
});

export const env = envSchema.parse({
  SITE_SLUG: process.env.SITE_SLUG,
  API_URL: process.env.API_URL,
  SITE_URL: process.env.SITE_URL,
});
