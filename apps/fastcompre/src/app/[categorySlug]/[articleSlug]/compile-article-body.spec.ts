import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Mesma disciplina de mock das outras specs: `jest.doMock()` + `import()`
 * dinâmico. Aqui mockamos o próprio `@mdx-js/mdx`/`react/jsx-runtime` — o
 * teste cobre só a responsabilidade do nosso wrapper (quais argumentos ele
 * passa pra `evaluate`, o que ele devolve), não a fidelidade real da
 * compilação Markdown → React nem a restrição de `format: 'md'` contra
 * JSX/imports/expressões (já validada empiricamente fora do Jest antes da
 * implementação).
 */
describe('compileArticleBody', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('chama evaluate() com o bodyMdx, format "md" e o runtime JSX, devolvendo o default produzido', async () => {
    const fakeDefault = () => null;
    const fakeRuntime = { jsx: jest.fn(), jsxs: jest.fn(), Fragment: Symbol('fragment') };
    const evaluateMock =
      jest.fn<(bodyMdx: string, options: Record<string, unknown>) => Promise<{ default: unknown }>>();
    evaluateMock.mockResolvedValue({ default: fakeDefault });

    jest.doMock('@mdx-js/mdx', () => ({ evaluate: evaluateMock }));
    jest.doMock('react/jsx-runtime', () => fakeRuntime);

    const { compileArticleBody } = await import('./compile-article-body');
    const result = await compileArticleBody('# Corpo do artigo');

    expect(evaluateMock).toHaveBeenCalledTimes(1);
    const [bodyArg, optionsArg] = evaluateMock.mock.calls[0];
    expect(bodyArg).toBe('# Corpo do artigo');
    expect(optionsArg.format).toBe('md');
    expect(optionsArg.jsx).toBe(fakeRuntime.jsx);
    expect(optionsArg.jsxs).toBe(fakeRuntime.jsxs);
    expect(optionsArg.Fragment).toBe(fakeRuntime.Fragment);
    expect(result).toBe(fakeDefault);
  });
});
