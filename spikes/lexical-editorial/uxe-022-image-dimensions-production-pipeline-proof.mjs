/**
 * spikes/lexical-editorial/uxe-022-image-dimensions-production-pipeline-proof.mjs
 *
 * UXE-022 — prova standalone, fora do Jest, com `@mdx-js/mdx` real e o
 * pipeline de produção real do FastCompre (não uma reimplementação/mock).
 *
 * Mesma lacuna já documentada em `uxe-017-production-pipeline-proof.mjs`/
 * `uxe-018-public-resolution-proof.mjs`: `next/jest` não transforma
 * pacotes ESM puros de `node_modules` (`@mdx-js/mdx`, `unist-util-visit`),
 * então nenhum teste Jest roda `evaluate()` de verdade — os specs Jest
 * (`image-dimensions-remark-plugin.spec.ts`, ambos apps) mockam
 * `unist-util-visit`/testam o plugin isoladamente, nunca o pipeline
 * `compileArticleBody` real ponta a ponta. Este script fecha essa lacuna
 * para a extensão de dimensões da imagem (Contract §10), importando
 * diretamente:
 *   - `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts`
 *     (produção real — por sua vez importa `remarkImageDimensions` real e,
 *     através dele, `@commerce-platform/editorial` real)
 *   - `@mdx-js/mdx` real (não mockado)
 *   - `unist-util-visit` real (não mockado)
 *
 * Execução: fora do Jest, via `node --experimental-strip-types`,
 * reutilizando sem modificação o mesmo `ts-extension-resolve-loader.mjs`
 * já aprovado na UXE-018 e usado sem alteração pela UXE-019/UXE-020
 * (necessário porque `compile-article-body.ts` importa
 * `./product-block-remark-plugin`/`./image-dimensions-remark-plugin` sem
 * extensão — resolução "bundler" do TypeScript, não nativa do Node; a
 * mesma necessidade estrutural já documentada na UXE-019). Nenhum outro
 * loader é necessário neste script.
 *
 * Comando de execução (a partir de `spikes/lexical-editorial/`):
 *   node --experimental-strip-types \
 *     --experimental-loader=./ts-extension-resolve-loader.mjs \
 *     uxe-022-image-dimensions-production-pipeline-proof.mjs
 *
 * Quatro provas (as primeiras três rodam inteiramente em Node, via
 * `renderToStaticMarkup` — sem browser; a quarta precisa de um Chromium
 * real instalado, ausente neste dispositivo no momento em que este
 * arquivo foi escrito — ver `proveAspectRatioTechniqueInRealChromium`
 * abaixo para como ela se comporta nesse caso, e o relatório desta tarefa
 * para onde essa prova específica foi de fato executada):
 *
 * 1. Não-interferência — uma imagem comum, sem a extensão de dimensões,
 *    continua compilando/renderizando exatamente como antes (Markdown
 *    restrito, sem nenhum `style`/`width`/`height`).
 * 2. Forma legada (`{width=N}`) — inalterada: só `width` (`px`) chega ao
 *    `<img>` renderizado, nunca `aspect-ratio`.
 * 3. Forma combinada (`{width=N height=M}`, Contract §10) — o pipeline
 *    real (parse real do remark, `remarkImageDimensions` real,
 *    `unist-util-visit` real) reconhece a extensão e o `<img>`
 *    renderizado carrega `aspect-ratio: N / M`, `width: 100%`,
 *    `max-width: Npx`, `height: auto` — a técnica confirmada
 *    empiricamente (prova registrada no relatório desta tarefa) como a
 *    única forma que preserva a proporção PERSISTIDA (não a intrínseca
 *    real do arquivo) ao encolher em viewports estreitos.
 * 4. A MESMA técnica (prova 3), verificada num Chromium real: a proporção
 *    height/width persistida se mantém mesmo quando o contêiner é mais
 *    estreito que `max-width` — e, como controle negativo, `width`/
 *    `height` nativos SOZINHOS (sem `aspect-ratio`) NÃO preservam essa
 *    proporção no mesmo cenário, reproduzindo o achado empírico original
 *    que motivou esta técnica.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { compileArticleBody } from '../../apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.ts';

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`✗ FALHOU: ${message}`);
  } else {
    console.log(`✓ ${message}`);
  }
}

async function renderBodyToHtml(bodyMdx) {
  const { MDXContent } = await compileArticleBody(bodyMdx);
  return renderToStaticMarkup(MDXContent({}));
}

/** Extrai o atributo `style="..."` do primeiro `<img>` do HTML renderizado, se existir. */
function extractImgStyle(html) {
  const match = html.match(/<img[^>]*\sstyle="([^"]*)"[^>]*>/);
  return match ? match[1] : null;
}

async function proveCommonImageWithoutExtensionUnchanged() {
  console.log('\n[1/4] Não-interferência — imagem comum, sem extensão de dimensões, continua compilando/renderizando sem style');

  const bodyMdx = ['Texto antes.', '', '![Uma foto qualquer](https://cdn.exemplo.com/foto.jpg)', '', 'Texto depois.'].join('\n');

  const html = await renderBodyToHtml(bodyMdx);

  assert(html.includes('<img'), 'o <img> real aparece na renderização');
  assert(html.includes('src="https://cdn.exemplo.com/foto.jpg"'), 'o src real da imagem chega inalterado');
  assert(extractImgStyle(html) === null, 'nenhum atributo style é adicionado quando não há extensão de dimensões');
  assert(html.includes('Texto antes.') && html.includes('Texto depois.'), 'o texto ao redor continua sendo renderizado normalmente');
}

async function proveLegacyWidthOnlyExtensionUnchanged() {
  console.log('\n[2/4] Forma legada {width=N} — inalterada: só o ATRIBUTO width chega ao <img> (nunca style/aspect-ratio) — comportamento legado do adapter público (`image-dimensions-remark-plugin.ts`, FastCompre): width-only grava hProperties.width como atributo HTML puro, não como style');

  const bodyMdx = '![Uma foto qualquer](https://cdn.exemplo.com/foto.jpg){width=600}';

  const html = await renderBodyToHtml(bodyMdx);
  const style = extractImgStyle(html);

  assert(/<img[^>]*\swidth="600"/.test(html), `o <img> renderizado carrega o atributo width="600" (html real: "${html}")`);
  assert(!/<img[^>]*\sheight="/.test(html), 'a forma width-only nunca produz um atributo height');
  assert(style === null, `a forma width-only nunca produz atributo style (style real: "${style}")`);
}

async function proveCombinedExtensionProducesAspectRatioStyle() {
  console.log('\n[3/4] Forma combinada {width=N height=M} (Contract §10) — <img> renderizado carrega aspect-ratio: N / M');

  const bodyMdx = '![Uma foto qualquer](https://cdn.exemplo.com/foto.jpg){width=800 height=450}';

  const html = await renderBodyToHtml(bodyMdx);
  const style = extractImgStyle(html);

  assert(style !== null, 'um atributo style é adicionado para a forma combinada');
  assert(/aspect-ratio:\s*800\s*\/\s*450/.test(style ?? ''), `style contém aspect-ratio: 800 / 450 (style real: "${style}")`);
  assert(/width:\s*100%/.test(style ?? ''), `style contém width: 100% (style real: "${style}")`);
  assert(/max-width:\s*800px/.test(style ?? ''), `style contém max-width: 800px (style real: "${style}")`);
  assert(/height:\s*auto/.test(style ?? ''), `style contém height: auto (style real: "${style}")`);
  assert(/<img[^>]*\swidth="800"/.test(html), `o <img> renderizado também carrega o atributo width="800" (html real: "${html}")`);
  assert(/<img[^>]*\sheight="450"/.test(html), `o <img> renderizado também carrega o atributo height="450" (html real: "${html}")`);

  return { html, style };
}

async function proveMalformedCombinedExtensionFallsBackToWidthOnly() {
  // Não é uma das 4 provas numeradas (é uma checagem extra de robustez,
  // mesmo espírito de `proveMalformedBlockFailsClosed` em uxe-017): um
  // eixo inválido na forma combinada não deve gravar height nenhum —
  // `parseImageDimensionsExtension` rejeita atomicamente e o parser cai
  // para a forma width-only quando ela sozinha é válida (ver
  // `grammar.ts`/`parseImageDimensionsExtension`).
  console.log('\n[extra] altura inválida na forma combinada não vaza para o <img> — nunca um aspect-ratio com eixo inválido');

  const bodyMdx = '![Uma foto qualquer](https://cdn.exemplo.com/foto.jpg){width=800 height=50}'; // height=50 < MIN_IMAGE_HEIGHT (100)

  const html = await renderBodyToHtml(bodyMdx);
  const style = extractImgStyle(html);

  assert(!/aspect-ratio/.test(style ?? ''), 'nenhum aspect-ratio é produzido quando um dos dois eixos é normativamente inválido');
}

/**
 * Prova 4 — a mesma técnica (prova 3), agora medida num Chromium real via
 * `playwright`, com controle negativo. Requer um binário Chromium
 * instalado (`PLAYWRIGHT_BROWSERS_PATH`/cache padrão do Playwright); se
 * ausente, a prova é reportada como PULADA (não como falha silenciosa —
 * `pularam` é contado e reportado separadamente do sucesso/falha) e o
 * relatório desta tarefa documenta onde ela foi de fato executada.
 */
async function proveAspectRatioTechniqueInRealChromium(combinedFormStyle) {
  console.log('\n[4/4] Mesma técnica, medida num Chromium real — proporção persistida se mantém num contêiner mais estreito que max-width; controle negativo: width/height nativos sozinhos NÃO mantêm');

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (error) {
    console.log(`  PULADA — não foi possível importar 'playwright' (${error?.message ?? error}).`);
    return 'skipped';
  }

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    console.log(`  PULADA — nenhum binário Chromium disponível neste ambiente (${error?.message ?? error}).`);
    return 'skipped';
  }

  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 600 } });

    // Persistido: width=800, height=450 (razão 1.7778). Contêiner real:
    // 300px de largura (bem mais estreito que os 800px persistidos) —
    // exatamente o cenário (viewport estreito/mobile) que motivou a
    // técnica.
    const html = `<!doctype html>
<html><body>
  <div style="width: 300px;">
    <img id="aspect-ratio-technique" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" alt="" style="${combinedFormStyle}">
  </div>
  <div style="width: 300px;">
    <img id="native-width-height-only" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7" alt="" width="800" height="450" style="max-width:100%;height:auto;">
  </div>
</body></html>`;

    await page.setContent(html);

    const aspectRatioBox = await page.locator('#aspect-ratio-technique').boundingBox();
    const nativeBox = await page.locator('#native-width-height-only').boundingBox();

    const expectedRatio = 800 / 450;
    const aspectRatioMeasuredRatio = aspectRatioBox.width / aspectRatioBox.height;
    const nativeMeasuredRatio = nativeBox.width / nativeBox.height;

    assert(
      Math.abs(aspectRatioMeasuredRatio - expectedRatio) < 0.01,
      `técnica aspect-ratio: proporção medida no Chromium real (${aspectRatioMeasuredRatio.toFixed(4)}) bate com a persistida 800/450=${expectedRatio.toFixed(4)} mesmo num contêiner de 300px`,
    );
    assert(
      Math.abs(aspectRatioBox.width - 300) < 1,
      `técnica aspect-ratio: largura renderizada real (${aspectRatioBox.width}px) é a do contêiner (300px, width:100%), nunca os 800px persistidos`,
    );

    // Controle negativo — reproduz o achado empírico original: um <img>
    // com só width/height nativos + max-width:100% (sem aspect-ratio)
    // encolhe a LARGURA para caber no contêiner, mas o navegador recalcula
    // a ALTURA pela proporção INTRÍNSECA real do arquivo decodificado
    // (aqui, o GIF 1x1 de teste, proporção 1:1) — não pela persistida
    // (800/450) — a limitação concreta que motivou a técnica de
    // aspect-ratio explícito em primeiro lugar.
    assert(
      Math.abs(nativeMeasuredRatio - expectedRatio) > 0.1,
      `controle negativo: sem aspect-ratio explícito, a proporção medida no Chromium real (${nativeMeasuredRatio.toFixed(4)}) NÃO bate com a persistida (${expectedRatio.toFixed(4)}) — confirma que width/height nativos sozinhos são insuficientes`,
    );

    return 'ran';
  } finally {
    await browser.close();
  }
}

async function main() {
  await proveCommonImageWithoutExtensionUnchanged();
  await proveLegacyWidthOnlyExtensionUnchanged();
  const { style: combinedFormStyle } = await proveCombinedExtensionProducesAspectRatioStyle();
  await proveMalformedCombinedExtensionFallsBackToWidthOnly();
  const chromiumProofStatus = await proveAspectRatioTechniqueInRealChromium(combinedFormStyle);

  console.log('\n---');
  if (failures > 0) {
    console.error(`${failures} asserção(ões) falharam.`);
    process.exit(1);
  }
  if (chromiumProofStatus === 'skipped') {
    console.log('Todas as asserções executáveis passaram — provas 1-3 (pipeline real @mdx-js/mdx + unist-util-visit + remarkImageDimensions) confirmadas. Prova 4 (Chromium real) PULADA neste ambiente — ver relatório desta tarefa para onde ela foi de fato executada.');
    return;
  }
  console.log('Todas as asserções passaram, incluindo a prova 4 num Chromium real — pipeline completo (produção + técnica CSS) confirmado.');
}

main().catch((error) => {
  console.error('Erro inesperado ao rodar a prova:', error);
  process.exit(1);
});
