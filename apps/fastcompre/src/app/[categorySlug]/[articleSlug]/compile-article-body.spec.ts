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
 * `unist-util-visit` (UXE-017) também precisa de mock aqui — não porque
 * este teste use `visit()` (o `evaluate()` mockado nunca invoca
 * `remarkPlugins`), mas porque `next/jest` não transforma pacotes ESM
 * puros dentro de `node_modules` por padrão, e `./compile-article-body`
 * agora importa `./product-block-remark-plugin`, que importa
 * `unist-util-visit` (`export {...} from` — mesma classe de falha
 * ("Unexpected token 'export'") já catalogada para `@mdx-js/mdx` na
 * UXE-015). Um stub vazio é suficiente: o mock nunca é chamado neste
 * teste. A fidelidade real do plugin com `unist-util-visit` de verdade é
 * coberta por `product-block-remark-plugin.spec.ts` (mock funcional) e
 * pela prova standalone fora do Jest
 * (`spikes/lexical-editorial/uxe-017-production-pipeline-proof.mjs`).
 */
describe('compileArticleBody', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('chama evaluate() com o bodyMdx, format "md", o runtime JSX e o remarkPlugins com remarkProductBlock, devolvendo o default produzido', async () => {
    const fakeDefault = () => null;
    const fakeRuntime = { jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') };
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();
    evaluateMock.mockResolvedValue({ default: fakeDefault });

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => fakeRuntime);
    jest.doMock('unist-util-visit', () => ({ visit: jest.fn() }));

    const { compileArticleBody } = await import('./compile-article-body');
    const { remarkProductBlock } = await import('./product-block-remark-plugin');
    const result = await compileArticleBody('# Corpo do artigo');

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [bodyArg, optionsArg] = evaluateMock.mock.calls[0];
    expect(bodyArg).toBe('# Corpo do artigo');
    expect(optionsArg.format).toBe('md');
    expect(optionsArg.jsx).toBe(fakeRuntime.jsx);
    expect(optionsArg.jsxs).toBe(fakeRuntime.jsxs);
    expect(optionsArg.Fragment).toBe(fakeRuntime.Fragment);
    expect(optionsArg.remarkPlugins).toEqual([remarkProductBlock]);
    expect(result).toBe(fakeDefault);
  });
});
