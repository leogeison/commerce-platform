import type { NextConfig } from 'next';
import { resolveStorageImagesConfig } from './src/config/storage-remote-pattern';

/**
 * UXW-013 — `images.remotePatterns` derivado de `STORAGE_PUBLIC_URL_BASE`
 * (nunca hardcoded — dev e produção não necessariamente usam o mesmo
 * host, `STORAGE_PUBLIC_URL_BASE` em `.env.example`). A lógica de
 * derivação (incluindo o fallback de dev e a decisão de
 * `dangerouslyAllowLocalIP`) vive em `./src/config/storage-remote-pattern.ts`
 * — módulo puro e testado isoladamente; ver o racional completo lá,
 * incluindo a revisão de segurança que tornou esse módulo dependente
 * explicitamente de `NODE_ENV` (passado aqui, nunca lido escondido dentro
 * dele). `next.config.ts` fica fora de `src/` (fora do `testMatch` do
 * Jest deste app), então este arquivo só consome esse módulo, sem lógica
 * própria a testar.
 *
 * Em produção (`NODE_ENV=production`), `resolveStorageImagesConfig` agora
 * LANÇA (fail-fast) quando a env está ausente/inválida ou resolve para um
 * hostname local/privado — deliberado: um deploy de produção mal
 * configurado deve falhar alto (build/start), nunca seguir silenciosamente
 * com uma configuração de imagens incompatível ou insegura. Fora de
 * produção (inclusive `NODE_ENV=test`, usado por `next/jest` ao rodar esta
 * suíte), o comportamento permanece `console.warn` (nunca fatal) com
 * fallback de desenvolvimento — por isso este arquivo nunca precisa de try/
 * catch: um `throw` aqui só pode ocorrer em produção real, nunca durante
 * os testes.
 */
const storageImagesConfig = resolveStorageImagesConfig(
  process.env.STORAGE_PUBLIC_URL_BASE,
  process.env.NODE_ENV,
);

if (storageImagesConfig.warning !== null) {
  console.warn(`[next.config] ${storageImagesConfig.warning}`);
}

const nextConfig: NextConfig = {
  images: {
    remotePatterns: storageImagesConfig.remotePatterns,
    // Só presente (e só `true`) quando o host resolvido é local/privado —
    // nunca ligado por padrão, nunca ligado para um host de produção real.
    // Ver `isLocalOrPrivateHostname` em `storage-remote-pattern.ts`.
    ...(storageImagesConfig.dangerouslyAllowLocalIP ? { dangerouslyAllowLocalIP: true } : {}),
  },
};

export default nextConfig;
