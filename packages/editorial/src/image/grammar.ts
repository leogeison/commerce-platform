/**
 * packages/editorial/src/image/grammar.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade (gramática base, informativa/decorativa).
 * UXE-022 — Ampliação de escopo autorizada pelo Product Owner: extensão
 * `{width=N}` de persistência de largura (Editorial Serialization
 * Contract §10), depois ampliada para dimensões (`width`/`height`) numa
 * segunda rodada de decisão do PO/arquitetura, documentada abaixo.
 *
 * Fonte física única (Contract §10, GARANTIA NORMATIVA "fonte única das
 * primitivas de gramática") desta gramática — mesmo critério já aplicado
 * a `../product-block/grammar.ts` (Contract §8): o transformer Lexical
 * (`apps/admin/.../article-body-image/transformer.ts`) e os adapters
 * remark/MDX de cada pipeline (`apps/admin/.../image-dimensions-remark-plugin.ts`,
 * `apps/fastcompre/.../image-dimensions-remark-plugin.ts`) consomem só o
 * que está aqui — nenhuma segunda cópia manual desta gramática em nenhum
 * dos dois apps.
 *
 * Este módulo é deliberadamente framework-agnostic (mesmo critério do
 * módulo irmão): nenhum import de React, Lexical, `@mdx-js/mdx`/unified,
 * ou `unist-util-visit` — só validação/serialização pura de texto.
 *
 * Sintaxe v2 normativa (Contract §10, decisão fechada de dimensões):
 *
 *   ![alt](<url>)
 *   ![alt](<url>){width=N}
 *   ![alt](<url>){width=N height=M}
 *
 * - a base `![alt](<url>)` é a mesma gramática de linha única da UXE-010
 *   (informativa/decorativa) — nada muda aqui;
 * - só existem TRÊS formas válidas de extensão: ausente, só `width`, ou
 *   `width`+`height` juntos, NESSA ORDEM FIXA (`width` sempre antes de
 *   `height`, um único espaço entre os dois). Decisão fechada
 *   explicitamente pelo PO: `{height=M}` isolado NUNCA é uma forma
 *   válida (ao contrário do que uma evolução "simétrica" sugeriria) — só
 *   existe altura quando largura também existe, refletindo que o modelo
 *   de interação (ver `ImageNode.setDimensions`, `node.ts`) sempre
 *   captura e persiste os dois juntos a partir do primeiro resize, nunca
 *   altura isoladamente. `{height=M width=N}` (ordem invertida) também
 *   não é reconhecida — mesma disciplina de "forma exata ou rejeição
 *   inteira" já usada em toda esta gramática, nunca um parser de
 *   atributos tolerante a ordem.
 * - Por isso `IMAGE_BASE_REGEXP`, ao contrário do antigo
 *   `IMAGE_LINE_REGEXP` da UXE-010 (âncora completa `^...$`), NÃO
 *   âncora o fim da linha: âncora só o início (`^`), casando apenas a
 *   forma `![alt](<url>)` e deixando qualquer conteúdo restante da linha
 *   (a posição onde a extensão pode ou não existir) de fora do match —
 *   é essa a evidência mdast real do Contract §10 (a imagem é sempre
 *   reconhecida, independentemente do que a segue) refletida nesta
 *   gramática: o reconhecimento da base nunca depende do que vem depois.
 * - A extensão só é consumida quando casa **exatamente** uma das duas
 *   formas regex (`IMAGE_WIDTH_EXTENSION_REGEXP` ou
 *   `IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP`) contra o TRECHO INTEIRO
 *   restante da linha (âncoradas nos dois lados, `^...$`) — nunca um
 *   prefixo/parcial: qualquer caractere/espaço além do exigido já é
 *   "lixo à direita" e rejeita a extensão inteira (decisão fechada no
 *   desenho, categoria "trailing garbage").
 * - **Atomicidade da extensão combinada** (decisão fechada explicitamente
 *   nesta rodada): dentro de `{width=N height=M}`, se QUALQUER um dos
 *   dois valores estiver fora da faixa normativa (100–1200), a extensão
 *   INTEIRA é rejeitada — nunca aplica só o eixo válido. Ex.:
 *   `{width=600 height=99999}` não vira "width=600, sem height" — vira
 *   "nenhuma extensão reconhecida", o sufixo inteiro permanece texto
 *   literal, e a imagem base continua reconhecida normalmente (mesma
 *   semântica de sempre: rejeição de extensão nunca desfaz a imagem).
 *   Mesma lógica de "tudo ou nada" já normativa para um único valor fora
 *   de faixa — só estendida para os dois valores em conjunto.
 * - Comportamento de rejeição (de qualquer forma inválida, incluindo
 *   `{height=M}` isolado, ordem invertida, ou um valor fora de faixa
 *   dentro da forma combinada) nunca lança, nunca clampa:
 *   `parseImageDimensionsExtension` só retorna `null`, e o texto
 *   restante permanece exatamente como foi escrito, responsabilidade de
 *   cada consumidor (nunca deste módulo) preservá-lo sem descartar nem
 *   incorporar à imagem.
 * - Faixa normativa `100 <= N <= 1200` para AMBOS os eixos
 *   (`isValidImageWidth`/`isValidImageHeight`) — única validação
 *   normativa (parsing/import) — nunca clampa. `clampImageWidth`/
 *   `clampImageHeight` são helpers estritamente de INTERAÇÃO DE UI
 *   (pointer/teclado das zonas/sliders de resize), nunca usados para
 *   reinterpretar persistência textual inválida — a distinção exigida
 *   explicitamente no desenho aprovado.
 * - `width`/`height` são os únicos atributos de dimensão suportados.
 *   Nenhuma outra unidade (`px`, `%`, `rem`) é reconhecida.
 */

// ---------------------------------------------------------------------
// Gramática base (informativa/decorativa) — UXE-010, inalterada em
// regras, só de origem (antes local a `apps/admin`).
// ---------------------------------------------------------------------

// Conjunto de pontuação ASCII escapável definido pela especificação
// CommonMark ("Backslash escapes"). `\` precisa estar presente para que a
// própria barra de escape possa ser escapada; sua posição na classe de
// caracteres não é significativa (não é usada como intervalo).
const MARKDOWN_ESCAPABLE_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

/**
 * Escapa o alt-text para uso seguro dentro de `![ALT](<URL>)` — tanto para
 * sobreviver ao delimitador `]` desta gramática quanto para sobreviver,
 * de forma literal, à interpretação inline do CommonMark real no pipeline
 * público. Idempotente numa única passada.
 */
export function escapeAltForMarkdown(alt: string): string {
  return alt.replace(MARKDOWN_ESCAPABLE_PUNCTUATION, (char) => `\\${char}`);
}

/**
 * Reverte `escapeAltForMarkdown` — percorre a string e, ao encontrar `\`,
 * consome o próximo caractere literalmente (seja ele qual for) e o anexa
 * sem a barra; qualquer outro caractere é copiado como está.
 */
export function unescapeAltFromMarkdown(raw: string): string {
  let result = '';
  for (let index = 0; index < raw.length; index++) {
    const char = raw[index];
    if (char === '\\' && index + 1 < raw.length) {
      index++;
      result += raw[index];
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Casa o PREFIXO `![alt](<url>)` de uma linha — âncora só o início (`^`),
 * deliberadamente sem `$` (ver racional no cabeçalho do arquivo). Grupo 1
 * (alt, cru/ainda escapado), Grupo 2 (URL, entre `<` e `>`) — mesmas
 * regras da UXE-010, inalteradas.
 */
export const IMAGE_BASE_REGEXP = /^!\[((?:\\.|[^\\\]])*)\]\(<([^<>]*)>\)/;

export interface ParsedImageBase {
  alt: string;
  url: string;
  /** Tamanho, em caracteres, do trecho da linha que casou a base (para o chamador saber onde termina a imagem e começa o restante da linha). */
  matchedLength: number;
}

/**
 * Importa o PREFIXO de imagem de uma linha candidata. Retorna `null`
 * (nunca lança) quando a linha não começa com a gramática de base — não
 * afirma nada sobre o restante da linha, que é responsabilidade exclusiva
 * de `parseImageDimensionsExtension` interpretar.
 */
export function parseImageBase(line: string): ParsedImageBase | null {
  const match = IMAGE_BASE_REGEXP.exec(line);
  if (!match) {
    return null;
  }
  const [full, rawAlt, url] = match;
  return { alt: unescapeAltFromMarkdown(rawAlt ?? ''), url: url ?? '', matchedLength: full.length };
}

// ---------------------------------------------------------------------
// Extensão de dimensões — UXE-022, Contract §10.
// ---------------------------------------------------------------------

/** Faixa normativa (Contract §10) — mínimo e máximo de `width`, em CSS px. */
export const MIN_IMAGE_WIDTH = 100;
export const MAX_IMAGE_WIDTH = 1200;

/** Faixa normativa (Contract §10) — mínimo e máximo de `height`, em CSS px. Mesma faixa de `width` nesta versão, decisão fechada do PO. */
export const MIN_IMAGE_HEIGHT = 100;
export const MAX_IMAGE_HEIGHT = 1200;

/**
 * Casa `{width=N}` (forma só-largura, legada/compatível) contra o TRECHO
 * INTEIRO informado (âncora nos dois lados) — `N`: inteiro decimal
 * positivo, sem zero à esquerda (grupo `(0|[1-9]\d*)`: só "0" sozinho ou
 * um dígito não-zero seguido de quaisquer dígitos — "0600" nunca casa),
 * sem sinal, sem casas decimais, sem unidade. "0" sozinho casa a forma
 * sintática mas é rejeitado depois por `isValidImageWidth` (fora da
 * faixa 100–1200) — nunca um caso especial aqui.
 */
export const IMAGE_WIDTH_EXTENSION_REGEXP = /^\{width=(0|[1-9]\d*)\}$/;

/**
 * Casa `{width=N height=M}` (forma combinada, nova) contra o TRECHO
 * INTEIRO informado — mesmas regras de `N`/`M` de `IMAGE_WIDTH_EXTENSION_REGEXP`
 * (sem zero à esquerda, sem sinal, sem decimais, sem unidade), ORDEM FIXA
 * (`width` sempre antes de `height`), exatamente um espaço entre os dois
 * pares `chave=valor`. `{height=M width=N}` (ordem invertida) NUNCA casa
 * este regex — decisão fechada do PO: gramática determinística, nunca um
 * parser de atributos tolerante a ordem.
 */
export const IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP = /^\{width=(0|[1-9]\d*) height=(0|[1-9]\d*)\}$/;

/**
 * Validação normativa de `width` — a ÚNICA usada durante parsing/import.
 * Nunca clampa: um valor fora da faixa é simplesmente inválido.
 */
export function isValidImageWidth(width: number): boolean {
  return Number.isInteger(width) && width >= MIN_IMAGE_WIDTH && width <= MAX_IMAGE_WIDTH;
}

/**
 * Validação normativa de `height` — mesma forma de `isValidImageWidth`,
 * função própria (não um alias) para permitir evolução independente da
 * faixa de cada eixo no futuro, ainda que hoje as duas faixas coincidam
 * (100–1200, decisão fechada do PO para esta versão).
 */
export function isValidImageHeight(height: number): boolean {
  return Number.isInteger(height) && height >= MIN_IMAGE_HEIGHT && height <= MAX_IMAGE_HEIGHT;
}

export interface ParsedImageDimensions {
  width: number;
  /** Presente só quando a forma combinada foi reconhecida — nunca presente sozinho (não existe "height isolado" como resultado válido). */
  height?: number;
}

/**
 * Importa a extensão de dimensões a partir do TRECHO INTEIRO restante da
 * linha após a base da imagem (nunca um prefixo — ver racional no
 * cabeçalho do arquivo). Retorna `null` (nunca lança, nunca clampa) para
 * qualquer desvio das duas formas exatas — ausência, `{height=M}`
 * isolado, ordem invertida, qualquer valor fora da faixa (incluindo só
 * UM dos dois eixos da forma combinada — rejeição é sempre atômica,
 * nunca parcial), sintaxe inválida, ou qualquer caractere/espaço além do
 * exigido. Quem chama é responsável por preservar o trecho original,
 * literal, quando o retorno é `null` — este módulo não decide onde esse
 * texto deve viver na estrutura de dados de cada consumidor (Contract
 * §10, LIMITAÇÃO CONHECIDA / RESPONSABILIDADE FUTURA).
 *
 * Substituiu `parseImageWidthExtension` (nome antigo, retorno
 * `number | null`) nesta rodada — o formato de retorno mudou de forma
 * incompatível (agora um objeto com `height` opcional), então o nome
 * mudou junto: um call site que ainda esperasse `number | null` teria
 * ficado silenciosamente incorreto sem o rename forçar a atualização.
 */
export function parseImageDimensionsExtension(text: string): ParsedImageDimensions | null {
  const combined = IMAGE_WIDTH_HEIGHT_EXTENSION_REGEXP.exec(text);
  if (combined) {
    const width = Number(combined[1]);
    const height = Number(combined[2]);
    // Atomicidade: só aceita a forma combinada quando OS DOIS valores
    // são válidos — nunca cai de volta para "só width" quando height é
    // inválido (ver racional no cabeçalho do arquivo).
    return isValidImageWidth(width) && isValidImageHeight(height) ? { width, height } : null;
  }
  const widthOnly = IMAGE_WIDTH_EXTENSION_REGEXP.exec(text);
  if (widthOnly) {
    const width = Number(widthOnly[1]);
    return isValidImageWidth(width) ? { width } : null;
  }
  return null;
}

/**
 * Helper de INTERAÇÃO DE UI (pointer/teclado das zonas/sliders de
 * resize) — nunca usado para reinterpretar persistência textual
 * (`parseImageDimensionsExtension` nunca clampa; este helper nunca valida
 * texto persistido). Restringe `desiredWidth` a um inteiro dentro de
 * `[MIN_IMAGE_WIDTH, min(MAX_IMAGE_WIDTH, naturalWidth)]` quando
 * `naturalWidth` é conhecido (nunca faz upscale além da resolução
 * intrínseca real da imagem); quando `naturalWidth` é desconhecido
 * (`undefined`) ou não-positivo, usa só `[MIN_IMAGE_WIDTH,
 * MAX_IMAGE_WIDTH]`. Defensivo contra `naturalWidth < MIN_IMAGE_WIDTH`
 * (nunca produz um limite superior menor que o inferior) — ainda que,
 * por decisão de desenho, nenhuma zona/slider de resize seja oferecido
 * nesse caso, este helper puro não deve depender dessa decisão de UI
 * para permanecer correto isoladamente.
 */
export function clampImageWidth(desiredWidth: number, naturalWidth?: number): number {
  const upperBound =
    typeof naturalWidth === 'number' && Number.isFinite(naturalWidth) && naturalWidth > 0
      ? Math.min(MAX_IMAGE_WIDTH, Math.floor(naturalWidth))
      : MAX_IMAGE_WIDTH;
  const safeUpperBound = Math.max(MIN_IMAGE_WIDTH, upperBound);
  return Math.min(safeUpperBound, Math.max(MIN_IMAGE_WIDTH, Math.round(desiredWidth)));
}

/**
 * Mesma forma de `clampImageWidth`, para o eixo `height` — função
 * própria (não um alias parametrizado) pela mesma razão de
 * `isValidImageHeight`: evolução independente futura das faixas/regras
 * de cada eixo, sem acoplar as duas funções por um parâmetro extra.
 */
export function clampImageHeight(desiredHeight: number, naturalHeight?: number): number {
  const upperBound =
    typeof naturalHeight === 'number' && Number.isFinite(naturalHeight) && naturalHeight > 0
      ? Math.min(MAX_IMAGE_HEIGHT, Math.floor(naturalHeight))
      : MAX_IMAGE_HEIGHT;
  const safeUpperBound = Math.max(MIN_IMAGE_HEIGHT, upperBound);
  return Math.min(safeUpperBound, Math.max(MIN_IMAGE_HEIGHT, Math.round(desiredHeight)));
}

/**
 * Serializa `alt`/`url`/`width`/`height` (já resolvidos/validados pelo
 * chamador — nunca revalidado aqui, mesmo critério de
 * `serializeProductBlock` em `../product-block/grammar.ts`) para a forma
 * canônica de linha. `width === undefined` produz a forma base, sem
 * nenhuma extensão. `height === undefined` (com `width` presente) produz
 * exatamente a forma legada `{width=N}` — nenhuma imagem que só tinha
 * `width` precisa de migração. `height` só é serializado junto de
 * `width` — não existe forma de produzir `{height=M}` isolado por este
 * serializer, refletindo que nenhum estado real do `ImageNode` pode
 * chegar a essa combinação (`setDimensions` sempre grava os dois juntos;
 * ver `node.ts`).
 */
export function serializeImageMarkdown(alt: string, url: string, width?: number, height?: number): string {
  const base = `![${escapeAltForMarkdown(alt)}](<${url}>)`;
  if (width === undefined) {
    return base;
  }
  if (height === undefined) {
    return `${base}{width=${width}}`;
  }
  return `${base}{width=${width} height=${height}}`;
}

// ---------------------------------------------------------------------
// Corpus normativo de equivalência (Contract §10, GARANTIA NORMATIVA
// "equivalência obrigatória entre consumidores") — um único corpus,
// consumido pela suíte deste package e pelas suítes de integração de
// `apps/admin` (transformer Lexical, adapter remark do Preview) e
// `apps/fastcompre` (adapter remark), para provar mesma aceitação, mesma
// rejeição e mesmas `width`/`height` extraídos para o mesmo conjunto de
// entradas — nunca pela mesma implementação física de integração
// (Contract §10).
// ---------------------------------------------------------------------

export interface ImageDimensionsEquivalenceCase {
  /** Rótulo legível do cenário, usado como nome de teste em cada consumidor. */
  readonly label: string;
  /** Trecho exatamente como aparece na linha, imediatamente após `![alt](<url>)` — pode ser `''` (sem extensão). */
  readonly suffix: string;
  /** `width` esperado quando a extensão É consumida; `null` quando não é (imagem permanece sem width/height, suffix permanece texto literal). */
  readonly expectedWidth: number | null;
  /** `height` esperado quando a forma combinada É consumida; `null` em todos os outros casos (incluindo quando só `width` foi reconhecido). */
  readonly expectedHeight: number | null;
}

export const IMAGE_DIMENSIONS_EQUIVALENCE_CORPUS: readonly ImageDimensionsEquivalenceCase[] = [
  // --- Casos herdados da UXE-022 (só largura) — inalterados em significado. ---
  { label: 'ausência de extensão (compatibilidade legada)', suffix: '', expectedWidth: null, expectedHeight: null },
  { label: 'largura válida no limite inferior (100)', suffix: '{width=100}', expectedWidth: 100, expectedHeight: null },
  { label: 'largura válida no limite superior (1200)', suffix: '{width=1200}', expectedWidth: 1200, expectedHeight: null },
  { label: 'largura válida intermediária (600)', suffix: '{width=600}', expectedWidth: 600, expectedHeight: null },
  { label: 'abaixo do mínimo normativo (50)', suffix: '{width=50}', expectedWidth: null, expectedHeight: null },
  { label: 'acima do máximo normativo (1201)', suffix: '{width=1201}', expectedWidth: null, expectedHeight: null },
  { label: 'zero', suffix: '{width=0}', expectedWidth: null, expectedHeight: null },
  { label: 'negativo', suffix: '{width=-100}', expectedWidth: null, expectedHeight: null },
  { label: 'decimal', suffix: '{width=100.5}', expectedWidth: null, expectedHeight: null },
  { label: 'não numérico', suffix: '{width=abc}', expectedWidth: null, expectedHeight: null },
  { label: 'com unidade px', suffix: '{width=600px}', expectedWidth: null, expectedHeight: null },
  { label: 'com unidade %', suffix: '{width=50%}', expectedWidth: null, expectedHeight: null },
  {
    label: 'atributo desconhecido ({height=600} isolado) — decisão fechada do PO: NUNCA reconhecido, mesmo com a extensão de dimensões existindo',
    suffix: '{height=600}',
    expectedWidth: null,
    expectedHeight: null,
  },
  { label: 'zero à esquerda', suffix: '{width=0600}', expectedWidth: null, expectedHeight: null },
  { label: 'lixo à direita (espaço extra)', suffix: '{width=600} ', expectedWidth: null, expectedHeight: null },

  // --- Casos novos — forma combinada width+height. ---
  {
    label: 'combinada válida, ambos no limite inferior (100/100)',
    suffix: '{width=100 height=100}',
    expectedWidth: 100,
    expectedHeight: 100,
  },
  {
    label: 'combinada válida, ambos no limite superior (1200/1200)',
    suffix: '{width=1200 height=1200}',
    expectedWidth: 1200,
    expectedHeight: 1200,
  },
  {
    label: 'combinada válida, valores intermediários distintos (600/300) — retângulo não-quadrado, não-proporcional à toa',
    suffix: '{width=600 height=300}',
    expectedWidth: 600,
    expectedHeight: 300,
  },
  {
    label: 'combinada com height abaixo do mínimo — extensão INTEIRA rejeitada (atomicidade), width não aplicado parcialmente',
    suffix: '{width=600 height=50}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada com height acima do máximo — extensão inteira rejeitada',
    suffix: '{width=600 height=1201}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada com width abaixo do mínimo — extensão inteira rejeitada, height válido não aplicado sozinho',
    suffix: '{width=50 height=600}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada com width acima do máximo — extensão inteira rejeitada',
    suffix: '{width=1201 height=600}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada com os dois eixos fora de faixa — extensão inteira rejeitada',
    suffix: '{width=99999 height=99999}',
    expectedWidth: null,
    expectedHeight: null,
  },
  { label: 'combinada, height decimal — rejeitada', suffix: '{width=600 height=300.5}', expectedWidth: null, expectedHeight: null },
  { label: 'combinada, height não numérico — rejeitada', suffix: '{width=600 height=abc}', expectedWidth: null, expectedHeight: null },
  { label: 'combinada, height com unidade — rejeitada', suffix: '{width=600 height=300px}', expectedWidth: null, expectedHeight: null },
  { label: 'combinada, zero à esquerda em height — rejeitada', suffix: '{width=600 height=0300}', expectedWidth: null, expectedHeight: null },
  {
    label: 'ordem invertida (height antes de width) — decisão fechada do PO: NUNCA reconhecida, mesmo com os dois valores válidos',
    suffix: '{height=300 width=600}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada sem o espaço obrigatório entre width e height — rejeitada',
    suffix: '{width=600height=300}',
    expectedWidth: null,
    expectedHeight: null,
  },
  {
    label: 'combinada com espaço duplo entre width e height — rejeitada (forma exata, não tolerante a espaçamento extra)',
    suffix: '{width=600  height=300}',
    expectedWidth: null,
    expectedHeight: null,
  },
  { label: 'combinada com lixo à direita — rejeitada', suffix: '{width=600 height=300} ', expectedWidth: null, expectedHeight: null },
];
