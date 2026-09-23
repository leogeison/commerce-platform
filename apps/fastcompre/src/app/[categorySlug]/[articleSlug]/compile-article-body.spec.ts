import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Mesma disciplina de mock das outras specs: `jest.doMock()` + `import()`
 * dinâmico. Aqui mockamos o próprio `@mdx-js/mdx`/`react/jsx-runtime` — o
 * teste cobre só a responsabilidade do nosso wrapper (quais argumentos ele
 * passa pra `evaluate`, o que ele devolve), não a fidelidade real da
 * compilação Markdown → React nem a restrição de `format: 'md'` contra
 * JSX/imports/expressões (já validada empiricamente fora do Jest antes da
 * implementação).
 *
 * `unist-util-visit` (UXE-017) precisa de um duplo de teste FUNCIONAL aqui
 * (não um stub vazio) — mesma reimplementação mínima já estabelecida em
 * `product-block-remark-plugin.spec.ts` — porque, a partir da UXW-011, os
 * testes de `referencedProductIds` abaixo precisam do `remarkProductBlock`
 * REAL rodando de verdade contra uma árvore mdast literal (para provar o
 * coletor populado por um reconhecimento real, não simulado), não apenas
 * mockar o retorno de `evaluate()` sem examinar `remarkPlugins`.
 * `next/jest` não transforma pacotes ESM puros de `node_modules` por
 * padrão (`unist-util-visit`, "Unexpected token 'export'", já catalogado
 * na UXE-015) — por isso o mock, mesmo funcional, continua necessário. A
 * fidelidade do pipeline real com a biblioteca real é coberta à parte,
 * fora do Jest, por
 * `spikes/lexical-editorial/uxe-017-production-pipeline-proof.mjs`.
 */

interface MdastNode {
  type: string;
  children?: unknown[];
}

/** Mesma reimplementação mínima de `visit()` de `product-block-remark-plugin.spec.ts`. */
function visit(tree: unknown, type: string, visitor: (node: unknown, index: number | undefined, parent: unknown) => void) {
  function walk(node: unknown, index: number | undefined, parent: unknown) {
    if (!node || typeof node !== 'object') {
      return;
    }
    if ((node as MdastNode).type === type) {
      visitor(node, index, parent);
    }
    const children = (node as MdastNode).children;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        walk(children[i], i, node);
      }
    }
  }
  walk(tree, undefined, undefined);
}

function paragraphNode(text: string) {
  return { type: 'paragraph', children: [{ type: 'text', value: text }] };
}

const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const OTHER_UUID = '22222222-2222-4222-8222-222222222222';

describe('compileArticleBody', () => {
  afterEach(() => {
    jest.resetModules();
  });

  /**
   * `evaluate()` mockado, mas fiel ao contrato real do `unified`/`@mdx-js/mdx`
   * quanto a `remarkPlugins`: cada entrada é um "attacher" de zero
   * argumentos que devolve o transformer (`() => (tree) => void`) — mesma
   * convenção que `() => remarkProductBlock(referencedProductIds)` em
   * `compile-article-body.ts` depende. Aplica cada transformer contra
   * `mdastTree` (quando fornecida) antes de resolver, simulando o efeito
   * real de `evaluate()` rodar os remark plugins durante o parse.
   */
  function mockEvaluate(mdastTree?: { type: 'root'; children: unknown[] }) {
    const fakeDefault = () => null;
    const fakeRuntime = { jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') };
    const evaluateMock = jest.fn(async (_bodyMdx: string, options: Record<string, unknown>) => {
      const attachers = options.remarkPlugins as Array<() => (tree: unknown) => void>;
      if (mdastTree) {
        for (const attacher of attachers) {
          attacher()(mdastTree);
        }
      }
      return { default: fakeDefault };
    });

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => fakeRuntime);
    jest.doMock('unist-util-visit', () => ({ visit }));

    return { fakeDefault, fakeRuntime, evaluateMock };
  }

  it('chama evaluate() com o bodyMdx, format "md", o runtime JSX e um remarkPlugin — devolve { MDXContent, referencedProductIds } com Set vazio quando nenhum bloco é reconhecido', async () => {
    const { fakeDefault, fakeRuntime, evaluateMock } = mockEvaluate();

    const { compileArticleBody } = await import('./compile-article-body');
    const result = await compileArticleBody('# Corpo do artigo');

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [bodyArg, optionsArg] = evaluateMock.mock.calls[0];
    expect(bodyArg).toBe('# Corpo do artigo');
    expect(optionsArg.format).toBe('md');
    expect(optionsArg.jsx).toBe(fakeRuntime.jsx);
    expect(optionsArg.jsxs).toBe(fakeRuntime.jsxs);
    expect(optionsArg.Fragment).toBe(fakeRuntime.Fragment);
    expect(optionsArg.remarkPlugins).toHaveLength(1);
    expect(typeof (optionsArg.remarkPlugins as unknown[])[0]).toBe('function');

    expect(result.MDXContent).toBe(fakeDefault);
    expect(result.referencedProductIds).toEqual(new Set());
  });

  it('sem nenhum bloco no corpo, referencedProductIds continua um Set vazio', async () => {
    const tree = { type: 'root' as const, children: [paragraphNode('Parágrafo comum, sem bloco de Produto.')] };
    mockEvaluate(tree);

    const { compileArticleBody } = await import('./compile-article-body');
    const { referencedProductIds } = await compileArticleBody('Parágrafo comum, sem bloco de Produto.');

    expect(referencedProductIds).toEqual(new Set());
  });

  it('blocos válidos populam referencedProductIds com os IDs corretos', async () => {
    const tree = {
      type: 'root' as const,
      children: [
        paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`),
        paragraphNode(`:::product\nversion: 1\nproductId: ${OTHER_UUID}\n:::`),
      ],
    };
    mockEvaluate(tree);

    const { compileArticleBody } = await import('./compile-article-body');
    const { referencedProductIds } = await compileArticleBody('(bodyMdx real irrelevante — árvore já mockada)');

    expect(referencedProductIds).toEqual(new Set([VALID_UUID, OTHER_UUID]));
  });

  it('o mesmo productId referenciado duas vezes gera uma única entrada em referencedProductIds', async () => {
    const tree = {
      type: 'root' as const,
      children: [
        paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`),
        paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}\n:::`),
      ],
    };
    mockEvaluate(tree);

    const { compileArticleBody } = await import('./compile-article-body');
    const { referencedProductIds } = await compileArticleBody('(bodyMdx real irrelevante — árvore já mockada)');

    expect(referencedProductIds).toEqual(new Set([VALID_UUID]));
  });

  /**
   * Comportamento observável apenas: a rejeição fail-closed continua
   * propagando. Não se afirma nada sobre o estado interno do coletor num
   * cenário como "bloco válido seguido de bloco inválido" — o coletor pode
   * ter sido populado internamente antes do throw, mas isso é inobservável
   * daqui para fora, já que `compileArticleBody()` rejeita e não devolve
   * nada.
   */
  it('sintaxe de bloco inválida continua rejeitando com ProductBlockSyntaxError (fail-closed preservado)', async () => {
    const tree = { type: 'root' as const, children: [paragraphNode(`:::product\nversion: 1\nproductId: ${VALID_UUID}`)] };
    mockEvaluate(tree);

    const { compileArticleBody } = await import('./compile-article-body');
    const { ProductBlockSyntaxError } = await import('@commerce-platform/editorial');

    await expect(compileArticleBody('(bodyMdx real irrelevante — árvore já mockada)')).rejects.toThrow(
      ProductBlockSyntaxError,
    );
  });
});
