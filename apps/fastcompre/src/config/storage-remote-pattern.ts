/**
 * apps/fastcompre/src/config/storage-remote-pattern.ts
 *
 * UXW-013 — deriva `images.remotePatterns` (e a decisão de habilitar
 * `dangerouslyAllowLocalIP`) a partir de `STORAGE_PUBLIC_URL_BASE`, em vez
 * de qualquer host hardcoded. Extraído como módulo puro (mesma convenção já
 * usada neste app para separar lógica de arquivo de entrada do framework —
 * ver `../app/pagination-window.ts` vs. `pagination.tsx`), porque
 * `next.config.ts` fica fora de `src/` (fora do `testMatch` do Jest,
 * `<rootDir>/src/**\/*.spec.{ts,tsx}` em `jest.config.ts`) — a lógica
 * testável precisa morar dentro de `src/`, `next.config.ts` só a consome.
 *
 * `STORAGE_PUBLIC_URL_BASE` é a cópia própria deste app do mesmo valor
 * conceitual de `STORAGE_S3_PUBLIC_URL_BASE` (`apps/api`) — mesmo padrão já
 * usado por `AFFILIATE_REDIRECT_URL`/`API_URL`: cada app declara sua
 * própria variável, sem módulo de config compartilhado entre `apps/api` e
 * `apps/fastcompre` (não existe hoje, e criar um agora seria decisão
 * arquitetural fora do escopo desta tarefa — `packages/contracts` continua
 * sendo o único package compartilhado do MVP).
 *
 * REVISÃO DE SEGURANÇA #1 (pós-implementação inicial da UXW-013) — a
 * versão original decidia `dangerouslyAllowLocalIP` só pela forma do
 * hostname, sem olhar para o ambiente, e caía para o fallback de
 * desenvolvimento (`localhost:9000`) incondicionalmente quando a env
 * estava ausente/inválida — inclusive em produção. `nodeEnv` passou a ser
 * um argumento explícito (nunca lido escondido via `process.env.NODE_ENV`
 * dentro deste módulo — `next.config.ts` é quem lê e repassa).
 *
 * REVISÃO DE SEGURANÇA #2 (ajuste de modelagem sobre a #1) — a primeira
 * correção também lançava (`throw`) quando uma URL de produção VÁLIDA
 * resolvia para um hostname local/privado. Isso confundia "modo de build"
 * com "ambiente de deployment": `next build` roda com `NODE_ENV=production`
 * mesmo localmente, então um build local legítimo usando
 * `STORAGE_PUBLIC_URL_BASE=http://localhost:9000/local-dev-bucket` seria
 * rejeitado só por isso. Modelagem corrigida — em produção
 * (`nodeEnv === 'production'`):
 * - env ausente/vazia, URL inválida ou protocolo não http/https → `throw`
 *   (configuração ausente/quebrada é sempre um erro, independente de ser
 *   build local ou deployment real);
 * - QUALQUER URL válida (incluindo localhost/loopback/RFC1918) entra
 *   normalmente em `remotePatterns` — nunca lança só por o hostname ser
 *   local/privado;
 * - `dangerouslyAllowLocalIP` é **sempre `false`** em produção,
 *   incondicionalmente, para qualquer URL válida — a autorização de rede
 *   privada do Image Optimizer nunca é concedida automaticamente nesse
 *   ambiente, independente do hostname.
 * Fora de produção (`development`, `test`, ou qualquer outro valor),
 * comportamento inalterado desde a revisão #1: fallback de dev com
 * `warning` nunca fatal; `dangerouslyAllowLocalIP` habilitado só para o
 * loopback realmente usado em desenvolvimento (`isDevLoopbackHostname`,
 * faixa estreita — nunca para RFC1918 arbitrário).
 */

export interface StorageRemotePattern {
  protocol: 'http' | 'https';
  hostname: string;
  port: string;
  pathname: string;
}

export interface ResolveStorageImagesConfigResult {
  remotePatterns: [StorageRemotePattern];
  dangerouslyAllowLocalIP: boolean;
  /** Não-nulo quando a env estava ausente/inválida e o fallback de dev foi usado — `next.config.ts` loga isso. Sempre `null` em produção (esses casos lançam em vez de retornar). */
  warning: string | null;
}

/** Mesmo valor documentado como padrão de desenvolvimento local em `.env.example` (MinIO do `docker-compose.yml`). Nunca usado em produção — ver `resolveStorageImagesConfig`. */
export const DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE = 'http://localhost:9000/local-dev-bucket';

/**
 * Faixa estreita — só o loopback realmente necessário em desenvolvimento
 * hoje (`localhost:9000`, MinIO via `docker-compose.yml`, mais suas
 * variantes literais de loopback). Usada exclusivamente para decidir
 * `dangerouslyAllowLocalIP` FORA de produção — deliberadamente NÃO inclui
 * as faixas privadas RFC 1918 mais amplas (`10.x.x.x`, `172.16-31.x.x`,
 * `192.168.x.x`): não há consumidor real hoje que precise delas, e
 * habilitá-las automaticamente ampliaria sem necessidade a superfície de
 * host "confiável" pelo Image Optimizer. Em produção esta função nunca é
 * consultada — `dangerouslyAllowLocalIP` é sempre `false` lá,
 * incondicionalmente (ver revisão de segurança #2 acima).
 */
function isDevLoopbackHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function toRemotePattern(url: URL): StorageRemotePattern {
  return {
    protocol: url.protocol.slice(0, -1) as 'http' | 'https',
    hostname: url.hostname,
    port: url.port,
    // `.replace(/\/+$/, '')` normaliza tanto ausência de path (`/` →
    // `''`) quanto uma barra final já presente em `STORAGE_PUBLIC_URL_BASE`
    // — em ambos os casos o resultado é `<path>/**`, nunca `<path>//**`.
    pathname: `${url.pathname.replace(/\/+$/, '')}/**`,
  };
}

function parseHttpUrlOrNull(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return url;
}

function isProduction(nodeEnv: string | undefined): boolean {
  return nodeEnv === 'production';
}

/**
 * `rawValue` é `process.env.STORAGE_PUBLIC_URL_BASE`; `nodeEnv` é
 * `process.env.NODE_ENV` — ambos passados explicitamente pelo chamador
 * (`next.config.ts`). Este módulo não lê `process.env` diretamente, para
 * permanecer uma função pura, trivial de testar (inclusive os casos de
 * produção, sem precisar mutar `process.env.NODE_ENV` global em teste).
 *
 * Em produção (`nodeEnv === 'production'`):
 * - configuração ausente/quebrada (env ausente/vazia, URL inválida ou
 *   protocolo não http/https) sempre lança — isso NUNCA é uma diferença
 *   entre "build local" e "deployment real", é sempre um erro real de
 *   configuração;
 * - uma URL válida NUNCA lança, mesmo quando resolve para um hostname
 *   local/privado (`next build` roda com `NODE_ENV=production` mesmo
 *   localmente — tratar isso como "deployment real" derrubaria um build
 *   local legítimo usando o MinIO de dev);
 * - `dangerouslyAllowLocalIP` é sempre `false` para qualquer URL válida em
 *   produção, incondicionalmente — a proteção real não é impedir que o
 *   hostname entre em `remotePatterns`, é nunca conceder a autorização
 *   adicional de rede privada do Image Optimizer nesse ambiente.
 *
 * Fora de produção, comportamento previamente aprovado mantido: fallback
 * de dev com `warning`, nunca fatal; `dangerouslyAllowLocalIP` habilitado
 * só para o loopback de desenvolvimento (`isDevLoopbackHostname`).
 */
export function resolveStorageImagesConfig(
  rawValue: string | undefined,
  nodeEnv: string | undefined,
): ResolveStorageImagesConfigResult {
  const production = isProduction(nodeEnv);

  if (rawValue === undefined || rawValue === '') {
    if (production) {
      throw new Error(
        'STORAGE_PUBLIC_URL_BASE é obrigatória em produção (NODE_ENV=production) — configure-a antes do build/start. Nenhum fallback de desenvolvimento é usado em produção (UXW-013).',
      );
    }
    return buildDevFallbackResult(
      'STORAGE_PUBLIC_URL_BASE não configurada — usando o valor padrão de desenvolvimento local. Configure-a explicitamente em produção (UXW-013).',
    );
  }

  const url = parseHttpUrlOrNull(rawValue);
  if (url === null) {
    if (production) {
      throw new Error(
        `STORAGE_PUBLIC_URL_BASE="${rawValue}" não é uma URL http/https válida — corrija-a antes do build/start em produção. Nenhum fallback de desenvolvimento é usado em produção (UXW-013).`,
      );
    }
    return buildDevFallbackResult(
      `STORAGE_PUBLIC_URL_BASE="${rawValue}" não é uma URL http/https válida — usando o valor padrão de desenvolvimento local. Configure-a corretamente em produção (UXW-013).`,
    );
  }

  const pattern = toRemotePattern(url);

  if (production) {
    // Qualquer URL válida entra em `remotePatterns` — `NODE_ENV=production`
    // também ocorre em um `next build` local, então o hostname sozinho
    // nunca é motivo para lançar aqui (ver revisão de segurança #2 no
    // cabeçalho do arquivo). A proteção real é a linha abaixo:
    // `dangerouslyAllowLocalIP` nunca é concedido em produção, para
    // hostname nenhum.
    return { remotePatterns: [pattern], dangerouslyAllowLocalIP: false, warning: null };
  }

  return {
    remotePatterns: [pattern],
    dangerouslyAllowLocalIP: isDevLoopbackHostname(pattern.hostname),
    warning: null,
  };
}

function buildDevFallbackResult(warning: string): ResolveStorageImagesConfigResult {
  // `DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE` é uma constante própria, sempre
  // uma URL http válida — `parseHttpUrlOrNull` nunca devolve `null` aqui;
  // o `as URL` documenta essa garantia interna sem duplicar o try/catch.
  // Este helper só é chamado fora de produção (ver `resolveStorageImagesConfig`).
  const url = parseHttpUrlOrNull(DEV_FALLBACK_STORAGE_PUBLIC_URL_BASE) as URL;
  const pattern = toRemotePattern(url);
  return {
    remotePatterns: [pattern],
    // O fallback É loopback por definição (`localhost`) — habilitar aqui é
    // correto fora de produção. Produção nunca alcança este helper.
    dangerouslyAllowLocalIP: true,
    warning,
  };
}
