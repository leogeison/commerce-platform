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

/**
 * Schema reutilizado por toda variável que representa uma origem pública
 * absoluta (`protocol://host[:port]`, sem path/query/hash) consumida via
 * `new URL(path, origem)`. Extraído depois que `SITE_URL` (WEB-007) e
 * `AFFILIATE_REDIRECT_URL` (WEB-009) passaram a compartilhar exatamente a
 * mesma semântica e validação — antes disso, uma única ocorrência não
 * justificava a extração. Restrito a este arquivo (não é um utilitário
 * genérico em outro módulo): `new URL('/algo', origem)` descarta qualquer
 * path presente em `origem` silenciosamente, então um valor como
 * `https://fastcompre.com.br/base` faria `/base` desaparecer sem aviso — o
 * `.refine()` rejeita isso na validação, em vez de deixar acontecer sem
 * ninguém perceber.
 */
function originUrlSchema(message: string) {
  return z.string().url().refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.pathname === '/' && url.search === '' && url.hash === '';
      } catch {
        return false;
      }
    },
    { message },
  );
}

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
   * URLs absolutas (ex.: `sitemap.xml`).
   */
  SITE_URL: originUrlSchema(
    'SITE_URL deve ser só a origem (protocol://host[:port]), sem path/query/hash.',
  ),
  /**
   * Origem pública do endpoint de redirect de afiliado, `GET
   * /r/:siteSlug/:offerId` (WEB-009) — separada de `API_URL` de propósito:
   * `API_URL` é a origem server-side usada pelo cliente HTTP do FastCompre
   * (WEB-001), nunca renderizada para o navegador; `AFFILIATE_REDIRECT_URL`
   * é montada em `<a href>` na página do Artigo, então precisa ser
   * browser-facing/publicamente acessível — pode divergir de `API_URL` em
   * produção, mesmo sendo igual a ela em desenvolvimento.
   */
  AFFILIATE_REDIRECT_URL: originUrlSchema(
    'AFFILIATE_REDIRECT_URL deve ser só a origem (protocol://host[:port]), sem path/query/hash.',
  ),
});

export const env = envSchema.parse({
  SITE_SLUG: process.env.SITE_SLUG,
  API_URL: process.env.API_URL,
  SITE_URL: process.env.SITE_URL,
  AFFILIATE_REDIRECT_URL: process.env.AFFILIATE_REDIRECT_URL,
});
