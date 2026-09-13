/**
 * spikes/lexical-editorial/ts-extension-resolve-loader.mjs
 *
 * Loader ESM (`--experimental-loader`) exclusivo desta prova standalone
 * (UXE-018), sem nenhum efeito sobre Jest/Next.js/produção.
 *
 * Motivo: `node --experimental-strip-types` só remove anotações de tipo —
 * não resolve especificadores relativos sem extensão (`./foo`), que são
 * válidos sob a resolução "bundler" do TypeScript/Next.js (usada em todo o
 * código de produção deste monorepo, ver `tsconfig.base.json`), mas não
 * sob a resolução nativa de módulos ESM do Node, que exige a extensão
 * explícita. `compile-article-body.ts` importa `./product-block-remark-
 * plugin` sem extensão — por isso este loader tenta, só como fallback,
 * resolver adicionando `.ts` quando a resolução padrão falha. Nenhum
 * arquivo de produção é alterado para acomodar isso.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND' || !specifier.startsWith('.')) {
      throw error;
    }
    const candidateUrl = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(fileURLToPath(candidateUrl))) {
      return nextResolve(pathToFileURL(fileURLToPath(candidateUrl)).href, context);
    }
    throw error;
  }
}
