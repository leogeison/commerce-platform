import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ListPublicArticlesResponse } from '@commerce-platform/contracts';

/**
 * `jest.mock()` (hoistado) não funciona sob o transform SWC do `next/jest`
 * neste projeto — confirmado: um módulo mocado antes do import ainda
 * retornava o real. `jest.doMock()` nunca é hoistado (roda no ponto exato
 * da chamada), então precisa vir antes do `import()` dinâmico do módulo
 * que o consome — mesma disciplina de ordem explícita já usada em
 * `env.spec.ts`. `jest.resetModules()` a cada teste garante que o novo
 * `doMock` valha para a próxima importação, não para uma já cacheada.
 *
 * `connection()` depende de contexto interno de requisição do Next.js, que
 * não existe rodando via Jest puro — mocado para não testar o Next em si,
 * só o comportamento desta página.
 */
describe('Home', () => {
  afterEach(() => {
    jest.resetModules();
  });

  async function renderHomeWith(result: ListPublicArticlesResponse): Promise<string> {
    jest.doMock('next/server', () => ({ connection: jest.fn(() => Promise.resolve()) }));
    jest.doMock('../lib/public-api/client', () => ({
      listPublicArticles: jest.fn(() => Promise.resolve(result)),
    }));

    const { default: Home } = await import('./page');
    return renderToStaticMarkup(await Home());
  }

  it('renderiza os artigos retornados pela API pública', async () => {
    const html = await renderHomeWith({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          categorySlug: 'comparativos',
          type: 'COMPARISON',
          title: 'Melhor fone bluetooth 2026',
          slug: 'melhor-fone-bluetooth',
          metaDescription: 'Comparativo dos melhores fones bluetooth.',
          coverImageUrl: 'https://example.com/cover.jpg',
          publishedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    });

    expect(html).toContain('Melhor fone bluetooth 2026');
    expect(html).toContain('/comparativos/melhor-fone-bluetooth');
    // `timeZone: 'UTC'` faz a formatação ser determinística entre ambientes;
    // sem isso, '2026-01-01T00:00:00.000Z' poderia virar 31 de dezembro de
    // 2025 dependendo do timezone da máquina que roda o teste.
    expect(html).toContain('01 de janeiro de 2026');
  });

  it('mostra estado vazio quando não há artigos publicados', async () => {
    const html = await renderHomeWith({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });

    expect(html).toContain('Nenhum artigo publicado ainda.');
  });
});
