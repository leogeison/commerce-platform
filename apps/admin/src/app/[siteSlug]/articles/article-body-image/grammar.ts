/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image/grammar.ts
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Gramática de linha única para a sintaxe de imagem persistida em
 * `Article.bodyMdx` — decisão fechada no desenho aprovado desta tarefa:
 *
 *   - informativa: `![ALT](<URL>)`
 *   - decorativa:  `![](<URL>)`
 *
 * Não é um parser Markdown genérico: é uma gramática própria, fechada,
 * para uma única forma de linha que este módulo controla nas duas pontas
 * (exportação e importação) — mesmo espírito do módulo irmão
 * `../product-block/grammar.ts` para a sintaxe `:::product`.
 *
 * DESTINO ENTRE `<...>` (não a forma "nua" `(url)`): decisão deliberada,
 * não estética. Na forma nua, a especificação CommonMark só aceita
 * parênteses no destino se estiverem escapados ou balanceados — um `)`
 * desbalanceado e não escapado encerraria a destination prematuramente.
 * Isso não pode depender de nenhuma suposição sobre o conteúdo de
 * `publicUrlBase`/`fileName` do `S3StorageAdapter`. A forma delimitada por
 * `<...>` do próprio CommonMark resolve isso sem gramática genérica: only
 * quebras de linha e `<`/`>` não escapados são proibidos dentro dela, e
 * nenhum dos dois pode existir sem percent-encoding em uma URL válida de
 * verdade (RFC 3986) — logo qualquer valor que já seja uma URL (a resposta
 * do upload, ou `publicUrlBase` validado por `.url()`) já satisfaz essa
 * condição por construção. A URL nunca é reescrita/transformada nesta
 * gramática — é escrita exatamente como veio da resposta do upload.
 *
 * ESCAPING DO ALT: escapar só `\` e `]` protegeria o delimitador desta
 * gramática, mas não protege o texto contra a própria interpretação
 * inline do CommonMark quando `bodyMdx` for compilado pelo pipeline
 * público (`@mdx-js/mdx`, `format: 'md'`) — ex.: `*especial*` seria
 * processado como ênfase e o `alt` final perderia os asteriscos
 * digitados. A estratégia adotada é escapar TODA a pontuação ASCII que o
 * próprio CommonMark define como escapável (spec, "Backslash escapes"):
 * isso é seguro por construção — o CommonMark garante que qualquer
 * pontuação ASCII escapada com `\` sempre reverte para o caractere
 * literal, mesmo quando aquela pontuação não teria nenhum significado
 * especial naquele ponto específico — não é necessário decidir
 * contexto a contexto.
 *
 * A importação (deste módulo, para o editor) reverte esse escaping de
 * forma genérica — "`\` sempre escapa o próximo caractere, seja ele qual
 * for" — o que já cobre tanto os dois caracteres estruturais desta
 * gramática (`\`, `]`) quanto qualquer pontuação adicional escapada pela
 * exportação (`*`, `[`, `_`, `` ` ``, etc.), sem precisar enumerar casos.
 */

// Conjunto de pontuação ASCII escapável definido pela especificação
// CommonMark ("Backslash escapes"). `\` precisa estar presente para que a
// própria barra de escape possa ser escapada; sua posição na classe de
// caracteres não é significativa (não é usada como intervalo).
const MARKDOWN_ESCAPABLE_PUNCTUATION = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

/**
 * Escapa o alt-text para uso seguro dentro de `![ALT](<URL>)` — tanto para
 * sobreviver ao delimitador `]` desta gramática quanto para sobreviver,
 * de forma literal, à interpretação inline do CommonMark real no pipeline
 * público. Idempotente numa única passada: como `\` também faz parte do
 * conjunto escapado, cada ocorrência de qualquer caractere do conjunto
 * (incluindo `\` já presente no texto original) vira `\` + o caractere
 * original, sem processamento em duas etapas.
 */
export function escapeAltForMarkdown(alt: string): string {
  return alt.replace(MARKDOWN_ESCAPABLE_PUNCTUATION, (char) => `\\${char}`);
}

/**
 * Reverte `escapeAltForMarkdown` — percorre a string e, ao encontrar `\`,
 * consome o próximo caractere literalmente (seja ele qual for) e o anexa
 * sem a barra; qualquer outro caractere é copiado como está. Genérico o
 * suficiente para reverter o escaping de qualquer pontuação ASCII, não só
 * `\`/`]` — é a inversa exata de `escapeAltForMarkdown`, sem ambiguidade.
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
 * Casa a linha inteira (`^...$`) — nenhuma outra sintaxe pode coexistir
 * na mesma linha de uma imagem desta gramática.
 *
 * Grupo 1 (alt, cru/ainda escapado): `(?:\\.|[^\\\]])*` — ou um par
 * "barra + qualquer caractere" (`\\.`, cobre qualquer pontuação escapada
 * pela exportação), ou qualquer caractere que não seja `\` nem `]` não
 * escapado. Para no primeiro `]` não escapado, que é sempre o delimitador
 * de fechamento correto por construção (a exportação sempre escapa `]`
 * literais dentro do alt).
 *
 * Grupo 2 (URL, entre `<` e `>`): `[^<>]*` — delimitadores inequívocos;
 * não depende de "o último `)` da linha" nem de nenhuma suposição sobre o
 * conteúdo da URL além do que já é garantido por ela ser uma URL válida
 * (sem `<`/`>`/quebra de linha sem percent-encoding).
 */
export const IMAGE_LINE_REGEXP = /^!\[((?:\\.|[^\\\]])*)\]\(<([^<>]*)>\)$/;

export interface ParsedImageMarkdown {
  alt: string;
  url: string;
}

/**
 * Serializa `alt`/`url` já resolvidos para a forma canônica de linha desta
 * gramática. `alt === ''` produz `![](<URL>)` (decorativa) sem nenhum
 * caminho especial — `escapeAltForMarkdown('')` já retorna `''`.
 */
export function serializeImageMarkdown(alt: string, url: string): string {
  return `![${escapeAltForMarkdown(alt)}](<${url}>)`;
}

/**
 * Importa uma linha candidata. Retorna `null` (não lança) quando a linha
 * não casa a gramática — comportamento de "esta linha não é uma imagem
 * desta sintaxe", distinto do fail-closed por lançamento usado em
 * `:::product` (lá, um bloco delimitado que COMEÇA a casar mas está mal
 * formado é um erro; aqui, uma linha que não casa de forma alguma
 * simplesmente não é este tipo de bloco — mesmo critério de qualquer
 * `ElementTransformer` padrão do próprio `@lexical/markdown`, ex.
 * `HEADING`/`QUOTE`, cujo `regExp` só casa ou não casa).
 */
export function parseImageMarkdownLine(line: string): ParsedImageMarkdown | null {
  const match = IMAGE_LINE_REGEXP.exec(line);
  if (!match) {
    return null;
  }
  const [, rawAlt, url] = match;
  return { alt: unescapeAltFromMarkdown(rawAlt ?? ''), url: url ?? '' };
}
