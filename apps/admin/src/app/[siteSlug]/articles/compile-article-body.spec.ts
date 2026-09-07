import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * apps/admin/src/app/[siteSlug]/articles/compile-article-body.spec.ts
 *
 * UXE-009 (compilação original) + UXE-011 (segmentação, reescrito).
 *
 * Antes da UXE-011, este spec cobria uma única chamada a `evaluate()` para
 * o `bodyMdx` inteiro. A UXE-011 introduziu a segmentação
 * (`splitBodyIntoSegments`, testada isoladamente em
 * `split-body-into-segments.spec.ts`): `compileArticleBody` agora chama
 * `evaluate()` uma vez POR SEGMENTO de Markdown comum, e nunca chama
 * `evaluate()` para segmentos de bloco de Produto (`'product-block'`/
 * `'product-block-error'`) — esses só carregam `productId`/`message`, sem
 * compilação nenhuma.
 *
 * Correção pós-revisão (ainda UXE-011, antes do commit): quando o
 * documento tem PELO MENOS DOIS segmentos de Markdown (ou seja, pelo menos
 * um bloco separando-os), `compileArticleBody` agora faz UMA chamada extra
 * a `evaluate()` ANTES das chamadas de compilação por segmento — só para
 * descobrir `definition`s de referência (`[label]: url`) que atravessam um
 * bloco, via a opção `remarkPlugins` (nenhum novo `Content` sai dessa
 * chamada extra; ela existe só para capturar a árvore mdast). Com no
 * máximo um segmento de Markdown, essa chamada extra não acontece — não há
 * como uma definição/uso atravessar um bloco quando existe só um segmento
 * de Markdown no documento inteiro.
 *
 * Este spec mocka `@mdx-js/mdx` (mesma disciplina de sempre:
 * `jest.doMock()` + `import()` dinâmico) — nunca roda o parser Markdown
 * real (limitação de tooling já existente no projeto: o Jest deste app não
 * carrega o ESM real de `@mdx-js/mdx` sem `transpilePackages` em
 * `next.config.ts`, mudança fora do escopo desta tarefa). O describe
 * `'compileArticleBody'` original cobre só a responsabilidade de wrapper —
 * quantas vezes e com que argumentos `evaluate()` é chamado, e como o
 * array de `CompiledBodySegment` é montado — com um mock "burro" que nunca
 * invoca de fato os `remarkPlugins` passados; por isso, nesses testes, a
 * árvore capturada pela chamada extra de descoberta fica sempre vazia,
 * nenhuma tabela de definitions é anexada, e o texto enviado a cada
 * `evaluate()` de compilação permanece idêntico ao `segment.markdown`
 * original.
 *
 * O describe `'compileArticleBody — resolução de reference definitions
 * atravessando ProductBlock'`, abaixo, cobre a lógica nova em si (a
 * projeção, a tabela canônica, a remoção local, e principalmente as
 * strings efetivamente entregues a cada `evaluate()` de compilação — a
 * prova mais direta de que a correção funciona). Ele usa um mock de
 * `evaluate()` mais esperto: quando chamado com `remarkPlugins` (a chamada
 * de descoberta), reconhece no texto REALMENTE recebido (a projeção que
 * `compileArticleBody`, código de produção real, de fato constrói) linhas
 * no formato simples `[label]: url` e invoca os `remarkPlugins` recebidos
 * com uma árvore mínima contendo nós `definition` na mesma forma que
 * `@mdx-js/mdx`/remark produzem (`identifier` + `position.start/end.offset`
 * — sempre calculados a partir do texto recebido, nunca hardcoded). Isso
 * NÃO reimplementa a gramática de link reference definitions (não trata
 * título, indentação, definição multilinha) — só o suficiente para
 * exercitar de verdade a lógica de produção (`buildDefinitionDiscoveryProjection`/
 * `discoverCanonicalDefinitions`/`removeLocalDefinitions`, todas reais,
 * nunca mockadas) contra posições calculadas a partir do texto real que
 * elas produzem, sem depender do parser remark de verdade.
 */
describe('compileArticleBody', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('corpo só de Markdown (um único segmento de Markdown): chama evaluate() exatamente uma vez, com format "md" e o runtime JSX, e devolve um único segmento "markdown"', async () => {
    const fakeDefault = () => null;
    const fakeRuntime = { jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') };
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();
    evaluateMock.mockResolvedValue({ default: fakeDefault });

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => fakeRuntime);

    const { compileArticleBody } = await import('./compile-article-body');
    const result = await compileArticleBody('# Corpo do artigo');

    // Um único segmento de Markdown: nunca pode haver uma definition/uso
    // atravessando um bloco, então a chamada extra de descoberta não
    // acontece — continua exatamente 1 chamada, como antes da correção.
    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [bodyArg, optionsArg] = evaluateMock.mock.calls[0];
    expect(bodyArg).toBe('# Corpo do artigo');
    expect(optionsArg.format).toBe('md');
    expect(optionsArg.jsx).toBe(fakeRuntime.jsx);
    expect(optionsArg.jsxs).toBe(fakeRuntime.jsxs);
    expect(optionsArg.Fragment).toBe(fakeRuntime.Fragment);

    expect(result).toEqual([{ type: 'markdown', key: 'segment-0', Content: fakeDefault }]);
  });

  it('bloco de Produto válido, sozinho: NUNCA chama evaluate() — devolve um único segmento "product-block" só com o productId', async () => {
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const productId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const result = await compileArticleBody(`:::product\nversion: 1\nproductId: ${productId}\n:::`);

    // Zero segmentos de Markdown: nem a compilação normal nem a descoberta
    // de definitions (que só roda com 2+ segmentos de Markdown) chamam
    // evaluate() aqui.
    expect(evaluateMock).not.toHaveBeenCalled();
    expect(result).toEqual([{ type: 'product-block', key: 'segment-0', productId }]);
  });

  it('bloco de Produto inválido: NUNCA chama evaluate() — devolve um único segmento "product-block-error" com a mensagem de `parseProductBlockBody`, nunca texto literal', async () => {
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const result = await compileArticleBody(':::product\nversion: 2\nproductId: nao-e-uuid\n:::');

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'product-block-error', key: 'segment-0' });
  });

  it('Markdown + bloco + Markdown (dois segmentos de Markdown): chama evaluate() exatamente três vezes — uma de descoberta de definitions, mais uma por segmento de Markdown — preservando a ordem dos segmentos e chaves únicas e estáveis por posição', async () => {
    const fakeContentBefore = () => null;
    const fakeContentAfter = () => null;
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();
    evaluateMock.mockImplementation(async (bodyMdx) => ({
      default: bodyMdx.includes('Antes') ? fakeContentBefore : fakeContentAfter,
    }));

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const productId = 'aaaaaaaa-1111-4111-8111-111111111111';
    const body = ['Antes do bloco.', '', ':::product', 'version: 1', `productId: ${productId}`, ':::', '', 'Depois do bloco.'].join(
      '\n',
    );
    const result = await compileArticleBody(body);

    // 2 segmentos de Markdown → 1 chamada de descoberta + 2 de compilação.
    expect(evaluateMock).toHaveBeenCalledTimes(3);
    expect(result).toEqual([
      { type: 'markdown', key: 'segment-0', Content: fakeContentBefore },
      { type: 'product-block', key: 'segment-1', productId },
      { type: 'markdown', key: 'segment-2', Content: fakeContentAfter },
    ]);
  });

  it('corpo vazio: nenhum segmento, nenhuma chamada a evaluate()', async () => {
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const result = await compileArticleBody('');

    expect(evaluateMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});

/**
 * apps/admin/src/app/[siteSlug]/articles/compile-article-body.spec.ts
 * (continuação — ver o comentário do topo do arquivo para o racional
 * completo desta segunda parte do spec.)
 */
interface FakeDefinitionNode {
  type: 'definition';
  identifier: string;
  position: { start: { offset: number }; end: { offset: number } };
}

function normalizeIdentifier(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Reconhecedor mínimo, só para estes testes — ver o racional completo no
 * comentário do topo do arquivo. Os offsets vêm sempre de `match.index`
 * sobre o texto `text` efetivamente recebido (nunca hardcoded), então os
 * testes continuam corretos mesmo que o texto exato da projeção mude.
 */
function findFakeDefinitions(text: string): FakeDefinitionNode[] {
  const nodes: FakeDefinitionNode[] = [];
  // `[ \t]*$` (nunca `\s*$`) na cauda: `\s` inclui `\n`, então `\s*$` é
  // guloso o bastante para atravessar as linhas em branco que a projeção
  // usa para apagar um bloco — engolindo linhas em branco seguintes no
  // "match" e inflando `end`. Bug já pego e corrigido durante a auditoria
  // desta tarefa (só neste reconhecedor de teste — nunca existiu no
  // código de produção, que nunca faz esse tipo de correspondência).
  const pattern = /^\[([^\]]+)\]:\s*(\S+)[ \t]*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    nodes.push({
      type: 'definition',
      identifier: normalizeIdentifier(match[1]!),
      position: { start: { offset: match.index }, end: { offset: match.index + match[0].length } },
    });
  }
  return nodes;
}

function createDiscoveryAwareEvaluateMock() {
  const evaluateMock = jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();
  evaluateMock.mockImplementation(async (text, options) => {
    const remarkPlugins = options.remarkPlugins as Array<() => (tree: unknown) => void> | undefined;
    if (remarkPlugins) {
      const tree = { type: 'root', children: findFakeDefinitions(text) };
      for (const attach of remarkPlugins) {
        attach()(tree);
      }
    }
    return { default: () => null };
  });
  return evaluateMock;
}

const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_BLOCK = [':::product', 'version: 1', `productId: ${PRODUCT_ID}`, ':::'].join('\n');

describe('compileArticleBody — resolução de reference definitions atravessando ProductBlock', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('reference link: uso ANTES / definição DEPOIS do ProductBlock — a tabela canônica chega ao segmento de uso, e a definição original some só do seu próprio segmento', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    const body = ['Veja [este produto][produto].', '', PRODUCT_BLOCK, '', '[produto]: https://example.com', ''].join('\n');
    const segments = splitBodyIntoSegments(body);
    const usageSegment = segments[0];
    const definitionSegment = segments[2];
    if (usageSegment?.type !== 'markdown' || definitionSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmentos esperados não são markdown');
    }

    await compileArticleBody(body);

    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    expect(compileCalls).toHaveLength(2);
    const [usageCallArg] = compileCalls[0]!;
    const [definitionCallArg] = compileCalls[1]!;

    expect(usageCallArg).toBe(`${usageSegment.markdown}\n\n[produto]: https://example.com\n`);
    expect(definitionCallArg).toBe(
      `${definitionSegment.markdown.replace('[produto]: https://example.com', '')}\n\n[produto]: https://example.com\n`,
    );
  });

  it('reference link: definição ANTES / uso DEPOIS do ProductBlock — mesma garantia, na ordem inversa', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    const body = ['[produto]: https://example.com', '', PRODUCT_BLOCK, '', 'Veja [este produto][produto].', ''].join('\n');
    const segments = splitBodyIntoSegments(body);
    const definitionSegment = segments[0];
    const usageSegment = segments[2];
    if (usageSegment?.type !== 'markdown' || definitionSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmentos esperados não são markdown');
    }

    await compileArticleBody(body);

    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    expect(compileCalls).toHaveLength(2);
    const [definitionCallArg] = compileCalls[0]!;
    const [usageCallArg] = compileCalls[1]!;

    expect(definitionCallArg).toBe(
      `${definitionSegment.markdown.replace('[produto]: https://example.com', '')}\n\n[produto]: https://example.com\n`,
    );
    expect(usageCallArg).toBe(`${usageSegment.markdown}\n\n[produto]: https://example.com\n`);
  });

  it('imageReference: `![alt][label]` recebe a mesma garantia de `[texto][label]`', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    const body = ['![Foto do produto][foto]', '', PRODUCT_BLOCK, '', '[foto]: https://example.com/foto.png', ''].join('\n');
    const segments = splitBodyIntoSegments(body);
    const usageSegment = segments[0];
    const definitionSegment = segments[2];
    if (usageSegment?.type !== 'markdown' || definitionSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmentos esperados não são markdown');
    }

    await compileArticleBody(body);

    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    const [usageCallArg] = compileCalls[0]!;
    const [definitionCallArg] = compileCalls[1]!;

    expect(usageCallArg).toBe(`${usageSegment.markdown}\n\n[foto]: https://example.com/foto.png\n`);
    expect(definitionCallArg).toBe(
      `${definitionSegment.markdown.replace('[foto]: https://example.com/foto.png', '')}\n\n[foto]: https://example.com/foto.png\n`,
    );
  });

  it('label duplicado atravessando o bloco: a primeira definição global vence — a segunda (redundante) nunca entra na tabela canônica', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    const body = [
      '[produto]: https://example.com/primeira',
      '',
      PRODUCT_BLOCK,
      '',
      'Veja [este produto][produto].',
      '',
      '[produto]: https://example.com/segunda',
      '',
    ].join('\n');
    const segments = splitBodyIntoSegments(body);
    const firstDefinitionSegment = segments[0];
    const usageAndRedundantDefinitionSegment = segments[2];
    if (firstDefinitionSegment?.type !== 'markdown' || usageAndRedundantDefinitionSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmentos esperados não são markdown');
    }

    await compileArticleBody(body);

    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    const [firstSegmentCallArg] = compileCalls[0]!;
    const [secondSegmentCallArg] = compileCalls[1]!;

    // A vencedora (primeira, por ordem de documento) é "primeira" — nos
    // DOIS segmentos, nunca "segunda", mesmo no segmento onde "segunda" foi
    // originalmente escrita.
    expect(firstSegmentCallArg).toBe(
      `${firstDefinitionSegment.markdown.replace('[produto]: https://example.com/primeira', '')}\n\n[produto]: https://example.com/primeira\n`,
    );
    expect(secondSegmentCallArg).toBe(
      `${usageAndRedundantDefinitionSegment.markdown.replace('[produto]: https://example.com/segunda', '')}\n\n[produto]: https://example.com/primeira\n`,
    );
    expect(secondSegmentCallArg).not.toContain('https://example.com/segunda');
  });

  it('fail-closed: `[x]: URL` DENTRO do corpo de um ProductBlock inválido nunca entra na tabela canônica global — a projeção apaga o conteúdo do bloco antes de qualquer descoberta', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    // Bloco INVÁLIDO (corpo de 2 linhas, mas a 2a não é `productId:`) com
    // uma linha `[x]: url` dentro dele — e um uso de `[x]` fora do bloco,
    // num segmento de Markdown diferente.
    const body = ['Veja [teste][x].', '', ':::product', 'version: 1', '[x]: https://example.com', ':::', '', 'Depois do bloco.'].join(
      '\n',
    );
    const segments = splitBodyIntoSegments(body);
    const usageSegment = segments[0];
    expect(segments[1]).toMatchObject({ type: 'product-block-error' });
    if (usageSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmento de uso não é markdown');
    }

    await compileArticleBody(body);

    // A chamada de descoberta nunca viu a URL do bloco: a projeção já a
    // apagou antes de qualquer parse Markdown.
    const discoveryCall = evaluateMock.mock.calls.find(([, options]) => Boolean(options.remarkPlugins));
    expect(discoveryCall).toBeDefined();
    const [projectionText] = discoveryCall!;
    expect(projectionText).not.toContain('https://example.com');
    expect(projectionText).not.toContain('[x]:');

    // Sem nenhuma definition real de "x" em lugar nenhum: o segmento de uso
    // chega ao evaluate() de compilação exatamente como estava — nunca
    // resolvido, nunca com uma tabela contendo a URL do bloco.
    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    const [usageCallArg] = compileCalls[0]!;
    expect(usageCallArg).toBe(usageSegment.markdown);
    expect(usageCallArg).not.toContain('https://example.com');
  });

  it('documento sem ProductBlock (um único segmento de Markdown): mantém o caminho anterior — nenhuma chamada de descoberta, texto enviado ao evaluate() sem nenhuma alteração', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');

    const body = ['Veja [este produto][produto] e a imagem ![Foto][foto].', '', '[produto]: https://example.com', '[foto]: https://example.com/foto.png', ''].join(
      '\n',
    );

    await compileArticleBody(body);

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [bodyArg, optionsArg] = evaluateMock.mock.calls[0]!;
    expect(optionsArg.remarkPlugins).toBeUndefined();
    expect(bodyArg).toBe(body);
  });

  it('auditoria de offsets: definição legítima bem DEPOIS de um ProductBlock cujo texto original é mais longo que sua substituição em branco na projeção continua resolvendo corretamente', async () => {
    const evaluateMock = createDiscoveryAwareEvaluateMock();
    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => ({ jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { splitBodyIntoSegments } = await import('./split-body-into-segments');

    // O texto-fonte do bloco (opener + "version: 1" + "productId: <uuid>" +
    // closer, ~80 caracteres) é bem mais longo, em número de caracteres,
    // que sua substituição em branco na projeção (3 quebras de linha, "\n\n\n"
    // — `lineCount` 4 preserva só a CONTAGEM DE LINHAS, nunca a contagem de
    // caracteres). Isso prova que os offsets usados para localizar
    // `[link]: url` na projeção, e para mapeá-los de volta ao texto de CADA
    // segmento, nunca dependem de a projeção ter o mesmo comprimento em
    // caracteres do documento original — ver o racional completo no
    // relatório desta tarefa.
    const body = ['texto', '', PRODUCT_BLOCK, '', 'depois [link][x]', '', '[x]: https://example.com', ''].join('\n');
    const segments = splitBodyIntoSegments(body);
    const usageSegment = segments[0];
    const definitionSegment = segments[2];
    if (usageSegment?.type !== 'markdown' || definitionSegment?.type !== 'markdown') {
      throw new Error('fixture do teste mudou de forma — segmentos esperados não são markdown');
    }
    expect(PRODUCT_BLOCK.length).toBeGreaterThan('\n'.repeat(3).length);

    await compileArticleBody(body);

    const compileCalls = evaluateMock.mock.calls.filter(([, options]) => !options.remarkPlugins);
    const [usageCallArg] = compileCalls[0]!;
    const [definitionCallArg] = compileCalls[1]!;

    expect(usageCallArg).toBe(`${usageSegment.markdown}\n\n[x]: https://example.com\n`);
    expect(definitionCallArg).toBe(
      `${definitionSegment.markdown.replace('[x]: https://example.com', '')}\n\n[x]: https://example.com\n`,
    );
  });
});
