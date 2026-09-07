/**
 * apps/admin/src/app/[siteSlug]/articles/compile-article-body.ts
 *
 * UXE-009 — Preview do Artigo (compilação original, MDX único).
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (SEGMENTAÇÃO,
 * decisão fechada nesta tarefa; CORREÇÃO de reference definitions
 * atravessando um bloco, decisão fechada nesta mesma tarefa após
 * investigação pré-commit).
 *
 * Antes desta tarefa, `bodyMdx` inteiro ia direto para
 * `evaluate(bodyMdx, { format: 'md' })` — sob `format: 'md'`, um bloco
 * `:::product` já existente era tratado como texto literal seguro (nenhum
 * plugin de diretiva carregado). Essa era exatamente a limitação que a
 * UXE-011 precisa fechar: o bloco de Produto agora precisa ser resolvido e
 * renderizado de verdade no preview Admin, nunca como texto cru.
 *
 * `bodyMdx` é dividido em segmentos ANTES de qualquer chamada a
 * `evaluate()` (`splitBodyIntoSegments`, `./split-body-into-segments.ts`)
 * — só os segmentos de Markdown comum passam por `evaluate(..., { format:
 * 'md' })`, exatamente como antes (comportamento de segurança normativo do
 * Editorial Serialization Contract §1 inalterado: nenhuma extensão reabre
 * `format: 'md'` para conteúdo comum). Segmentos de bloco de Produto
 * (`'product-block'`/`'product-block-error'`) NUNCA passam pelo
 * compilador MDX — são resolvidos e renderizados diretamente por React em
 * `ArticlePreview` (via `ProductBlockPreview`), fora da string MDX. Ver o
 * racional completo (por que injetar um marcador JSX na string MDX antes
 * de compilar nunca funcionaria sob `format: 'md'`) em
 * `split-body-into-segments.ts`.
 *
 * CORREÇÃO — reference definitions atravessando um bloco (`[texto][label]`
 * / `![alt][label]` / `[label]: url`): compilar cada segmento de Markdown
 * separadamente, isoladamente, quebra a semântica de documento único do
 * CommonMark quando o uso e a definição do mesmo label caem em segmentos
 * diferentes — comprovado empiricamente antes desta correção (micromark só
 * reconhece `[texto][label]` como link/imagem de referência se encontrar
 * `[label]: url` na MESMA string sendo parseada; ao contrário de um erro de
 * renderização, o parser sequer chega a tokenizar a sintaxe como
 * link/imagem — ela já começa como texto literal, e nenhuma manipulação
 * de árvore mdast depois do parse consegue reverter isso).
 *
 * A correção em 3 passos, cada um só usando `@mdx-js/mdx` (já dependência
 * direta do Admin — nenhuma dependência nova, nem `mdast-util-from-markdown`
 * nem `unist-util-visit`; a opção `remarkPlugins` de `evaluate()` já é
 * suportada e documentada, usada aqui apenas para CAPTURAR a árvore mdast
 * que o próprio `@mdx-js/mdx` produz por baixo — o `Content` resultante
 * dessa chamada específica nunca é usado):
 *
 * 1. `splitBodyIntoSegments()` roda primeiro, sobre o `bodyMdx` ORIGINAL,
 *    intocado — exatamente como antes desta correção. O parser do bloco de
 *    Produto (`parseProductBlockBody`) nunca vê nada além do `bodyMdx`
 *    original.
 * 2. Só depois se constrói uma PROJEÇÃO do documento inteiro, usada
 *    exclusivamente para descobrir `definition`s globais: os segmentos de
 *    Markdown entram verbatim, na mesma ordem; cada segmento de bloco
 *    (`'product-block'` OU `'product-block-error'` — válido ou inválido,
 *    nunca faz diferença aqui) é substituído por linhas em branco de MESMA
 *    contagem (`segment.lineCount`, ver `split-body-into-segments.ts`).
 *    Isso é o que garante fail-closed: para o parser Markdown, `:::product`
 *    não tem semântica nenhuma, então uma linha `[x]: url` DENTRO do corpo
 *    de um bloco (mesmo inválido) pareceria uma `definition` legítima do
 *    documento inteiro se lida do `bodyMdx` cru — a projeção elimina esse
 *    vazamento apagando o conteúdo do bloco ANTES de qualquer parse
 *    Markdown, nunca o `bodyMdx` que alimenta o parser do bloco.
 * 3. As `definition`s globais são obtidas rodando `evaluate()` só sobre
 *    essa projeção (nunca sobre o `bodyMdx` cru), com um `remarkPlugins`
 *    que só captura a árvore. `node.identifier` (já normalizado pelo
 *    próprio parser, mesma regra do CommonMark) mais
 *    `position.start.offset` (ordem de documento) implementam a semântica
 *    de documento único: quando o mesmo label tem mais de uma definição, a
 *    primeira, em ordem de documento, vence — igual ao CommonMark de um
 *    documento inteiro, independente de qual segmento contém o quê. As
 *    definitions ORIGINAIS de cada segmento de Markdown são removidas do
 *    seu próprio texto (nunca do `bodyMdx` usado pelo parser do bloco) e
 *    substituídas, em TODO segmento de Markdown, por uma única tabela
 *    canônica (texto-fonte verbatim das vencedoras) anexada antes do
 *    `evaluate(..., { format: 'md' })` de compilação — é durante ESSE
 *    parse, com a definition presente na mesma string, que
 *    `linkReference`/`imageReference` voltam a ser reconhecidos undefined.
 *
 * Otimização deliberada: os passos 2 e 3 só rodam quando há PELO MENOS DOIS
 * segmentos de Markdown no documento (ou seja, pelo menos um bloco
 * separando-os) — com no máximo um segmento de Markdown, uso e definição,
 * se existirem, já estão sempre na mesma string, e o `evaluate()` de sempre
 * já resolve corretamente sem nenhuma projeção extra. Isso preserva
 * exatamente o número de chamadas a `evaluate()` de antes desta correção
 * (e o comportamento fail-closed de bloco sozinho: zero chamadas) nos casos
 * em que a correção não pode fazer diferença.
 *
 * `@mdx-js/mdx` continua importado dinamicamente (não no topo do módulo)
 * pelo mesmo motivo de sempre: o preview é sob demanda (UXE-009) — carregar
 * a biblioteca só quando o usuário efetivamente abre/atualiza o preview
 * evita incluí-la no carregamento inicial do editor de Artigo. Os tipos
 * usados abaixo (`EvaluateModule`/`Evaluate`/`EvaluateResult`/
 * `MDXContentComponent`) são só de tipo (`typeof import(...)`, apagado na
 * compilação) — não reintroduzem um import estático em tempo de execução.
 * O nó `definition` do mdast é tratado por checagem de forma manual
 * (`isRecord`/`collectDefinitions` abaixo), nunca por um tipo importado de
 * `@types/mdast`/`mdast-util-*` — nenhum desses pacotes é dependência
 * direta do Admin, e esta correção não introduz nenhuma dependência nova
 * (nem só de tipos) para isso.
 */

import * as runtime from 'react/jsx-runtime';
import { splitBodyIntoSegments, type BodySegment } from './split-body-into-segments';

type EvaluateModule = typeof import('@mdx-js/mdx');
type Evaluate = EvaluateModule['evaluate'];
type EvaluateResult = Awaited<ReturnType<Evaluate>>;
type MDXContentComponent = EvaluateResult['default'];

export type CompiledBodySegment =
  | { type: 'markdown'; key: string; Content: MDXContentComponent }
  | { type: 'product-block'; key: string; productId: string }
  | { type: 'product-block-error'; key: string; message: string };

interface DiscoveredDefinition {
  identifier: string;
  start: number;
  end: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Percorre a árvore mdast (tipada como `unknown` — nunca importamos um
 * tipo de árvore mdast, ver racional no topo do arquivo) coletando todo nó
 * `definition`. Checagem de forma manual, defensiva: uma árvore ausente ou
 * com forma inesperada resulta em nenhuma `definition` encontrada, nunca
 * em exceção — mesma postura fail-closed do resto do módulo.
 */
function collectDefinitions(node: unknown, out: DiscoveredDefinition[]): void {
  if (!isRecord(node)) {
    return;
  }

  if (
    node.type === 'definition' &&
    typeof node.identifier === 'string' &&
    isRecord(node.position) &&
    isRecord(node.position.start) &&
    isRecord(node.position.end) &&
    typeof node.position.start.offset === 'number' &&
    typeof node.position.end.offset === 'number'
  ) {
    out.push({ identifier: node.identifier, start: node.position.start.offset, end: node.position.end.offset });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      collectDefinitions(child, out);
    }
  }
}

interface MarkdownSegmentRange {
  segmentIndex: number;
  start: number;
  end: number;
}

/**
 * Projeção do documento inteiro só para descoberta de `definition`s
 * globais — nunca para nenhum outro fim, e nunca realimenta o parser do
 * bloco de Produto. Ver o racional completo (por que nunca ler do
 * `bodyMdx` cru) no comentário do topo do arquivo.
 */
function buildDefinitionDiscoveryProjection(segments: BodySegment[]): {
  projection: string;
  markdownRanges: MarkdownSegmentRange[];
} {
  const parts: string[] = [];
  const markdownRanges: MarkdownSegmentRange[] = [];
  let offset = 0;

  segments.forEach((segment, segmentIndex) => {
    const text = segment.type === 'markdown' ? segment.markdown : '\n'.repeat(segment.lineCount - 1);
    if (segment.type === 'markdown') {
      markdownRanges.push({ segmentIndex, start: offset, end: offset + text.length });
    }
    parts.push(text);
    offset += text.length + 1; // +1 pelo separador '\n' que o join abaixo insere entre as partes.
  });

  return { projection: parts.join('\n'), markdownRanges };
}

interface CanonicalDefinitions {
  /** Texto-fonte verbatim (só das vencedoras), anexado a todo segmento de Markdown antes de compilar. */
  tableText: string;
  /** Por índice de segmento de Markdown: intervalos locais `[start, end)`, no texto ORIGINAL desse segmento, das suas próprias definitions a remover antes de anexar `tableText`. */
  localRangesBySegmentIndex: Map<number, Array<{ start: number; end: number }>>;
}

async function discoverCanonicalDefinitions(evaluate: Evaluate, segments: BodySegment[]): Promise<CanonicalDefinitions> {
  const { projection, markdownRanges } = buildDefinitionDiscoveryProjection(segments);

  let capturedTree: unknown = null;
  await evaluate(projection, {
    ...runtime,
    format: 'md',
    remarkPlugins: [
      () => (tree: unknown) => {
        capturedTree = tree;
      },
    ],
  });

  const definitions: DiscoveredDefinition[] = [];
  collectDefinitions(capturedTree, definitions);
  // Ordem de documento — base da regra "primeira definição global vence",
  // igual ao CommonMark de um documento único.
  definitions.sort((a, b) => a.start - b.start);

  const winners = new Map<string, DiscoveredDefinition>();
  for (const definition of definitions) {
    if (!winners.has(definition.identifier)) {
      winners.set(definition.identifier, definition);
    }
  }
  const tableText = [...winners.values()].map((definition) => projection.slice(definition.start, definition.end)).join('\n');

  const localRangesBySegmentIndex = new Map<number, Array<{ start: number; end: number }>>();
  for (const definition of definitions) {
    const range = markdownRanges.find((candidate) => definition.start >= candidate.start && definition.start < candidate.end);
    if (!range) {
      // Nunca deveria acontecer: toda `definition` capturada na projeção só
      // pode estar dentro de um trecho de Markdown — blocos são só espaço
      // em branco na projeção, nunca produzem `definition`.
      continue;
    }
    const existing = localRangesBySegmentIndex.get(range.segmentIndex) ?? [];
    existing.push({ start: definition.start - range.start, end: definition.end - range.start });
    localRangesBySegmentIndex.set(range.segmentIndex, existing);
  }

  return { tableText, localRangesBySegmentIndex };
}

function removeLocalDefinitions(markdown: string, ranges: Array<{ start: number; end: number }> | undefined): string {
  if (!ranges || ranges.length === 0) {
    return markdown;
  }
  let result = markdown;
  // Remove do fim para o início — offsets anteriores continuam válidos.
  for (const { start, end } of [...ranges].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, start) + result.slice(end);
  }
  return result;
}

export async function compileArticleBody(bodyMdx: string): Promise<CompiledBodySegment[]> {
  const { evaluate } = await import('@mdx-js/mdx');
  const segments = splitBodyIntoSegments(bodyMdx);

  const markdownSegmentCount = segments.filter((segment) => segment.type === 'markdown').length;
  const canonicalDefinitions =
    markdownSegmentCount >= 2 ? await discoverCanonicalDefinitions(evaluate, segments) : null;

  const compiled: CompiledBodySegment[] = [];

  for (const [index, segment] of segments.entries()) {
    const key = `segment-${index}`;

    if (segment.type === 'markdown') {
      let markdownForEvaluate = segment.markdown;
      if (canonicalDefinitions) {
        const withoutLocalDefinitions = removeLocalDefinitions(
          segment.markdown,
          canonicalDefinitions.localRangesBySegmentIndex.get(index),
        );
        markdownForEvaluate = canonicalDefinitions.tableText
          ? `${withoutLocalDefinitions}\n\n${canonicalDefinitions.tableText}\n`
          : withoutLocalDefinitions;
      }

      const { default: Content } = await evaluate(markdownForEvaluate, {
        ...runtime,
        format: 'md',
      });
      compiled.push({ type: 'markdown', key, Content });
      continue;
    }

    if (segment.type === 'product-block') {
      compiled.push({ type: 'product-block', key, productId: segment.productId });
      continue;
    }

    compiled.push({ type: 'product-block-error', key, message: segment.message });
  }

  return compiled;
}

export type CompiledArticleBody = Awaited<ReturnType<typeof compileArticleBody>>;
