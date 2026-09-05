import { afterEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Mesma disciplina de mock do spec irmão em
 * `apps/fastcompre/src/app/[categorySlug]/[articleSlug]/compile-article-body.spec.ts`:
 * `jest.doMock()` + `import()` dinâmico. O teste cobre só a
 * responsabilidade do nosso wrapper (quais argumentos ele passa pra
 * `evaluate`, o que ele devolve) — não a fidelidade real da compilação
 * Markdown → React, já coberta pelos testes de `article-preview.spec.tsx`
 * contra o `@mdx-js/mdx` real.
 *
 * `jest.doMock('@mdx-js/mdx', ...)` funciona igual aqui mesmo com o
 * `import('@mdx-js/mdx')` sendo dinâmico dentro de `compileArticleBody`
 * (em vez de estático no topo do módulo, como na FastCompre): o mock é
 * registrado antes de `compileArticleBody` ser chamado, e a resolução de
 * módulo do Jest intercepta o `import()` dinâmico do mesmo jeito que
 * intercepta um `import` estático.
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
