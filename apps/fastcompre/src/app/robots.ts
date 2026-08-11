import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

/**
 * Robots (WEB-008) — regras de rastreamento públicas do FastCompre.
 *
 * Nenhuma rota de `apps/fastcompre` é privada (Home, Categoria, Artigo,
 * sitemap.xml e o próprio robots.txt são todos públicos), então libera tudo
 * sem `Disallow`. Diferente de Home/sitemap, esta rota não faz nenhum
 * `fetch()` — só lê `env.SITE_URL`, já disponível e validado em build-time —
 * então não precisa de `connection()`/`fetchCache` e pode ser estática.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', env.SITE_URL).toString(),
  };
}
