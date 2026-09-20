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

  /**
   * Correção de LCP (UXW-006): só a primeira imagem da listagem com
   * `coverImageUrl` pode sair de `loading="lazy"`/prioridade padrão — nunca
   * `index === 0` cru, porque `coverImageUrl` é opcional.
   */
  describe('prioridade de carregamento da imagem LCP', () => {
    function article(overrides: {
      id: string;
      title: string;
      coverImageUrl: string | null;
    }) {
      return {
        id: overrides.id,
        categorySlug: 'comparativos',
        type: 'COMPARISON' as const,
        title: overrides.title,
        slug: overrides.title.toLowerCase().replace(/\s+/g, '-'),
        metaDescription: null,
        coverImageUrl: overrides.coverImageUrl,
        publishedAt: '2026-01-01T00:00:00.000Z',
      };
    }

    function extractImgTags(html: string): string[] {
      return html.match(/<img[^>]*>/g) ?? [];
    }

    it('aplica loading="eager" e fetchpriority="high" somente na primeira imagem, mantendo as demais lazy e sem prioridade', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Primeiro artigo', coverImageUrl: 'https://example.com/1.jpg' }),
          article({ id: '2', title: 'Segundo artigo', coverImageUrl: 'https://example.com/2.jpg' }),
          article({ id: '3', title: 'Terceiro artigo', coverImageUrl: 'https://example.com/3.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 3,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(3);

      expect(imgTags[0]).toContain('src="https://example.com/1.jpg"');
      expect(imgTags[0]).toContain('loading="eager"');
      expect(imgTags[0]).toContain('fetchPriority="high"');

      for (const tag of imgTags.slice(1)) {
        expect(tag).toContain('loading="lazy"');
        expect(tag).not.toContain('fetchPriority');
      }
    });

    it('aplica a prioridade na primeira imagem REAL quando o primeiro artigo da lista não tem coverImageUrl', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Sem imagem', coverImageUrl: null }),
          article({ id: '2', title: 'Com imagem', coverImageUrl: 'https://example.com/2.jpg' }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      const imgTags = extractImgTags(html);
      expect(imgTags).toHaveLength(1);
      expect(imgTags[0]).toContain('src="https://example.com/2.jpg"');
      expect(imgTags[0]).toContain('loading="eager"');
      expect(imgTags[0]).toContain('fetchPriority="high"');
    });

    it('preserva o comportamento atual quando nenhum artigo tem coverImageUrl (nenhuma imagem, nenhum crash)', async () => {
      const html = await renderHomeWith({
        items: [
          article({ id: '1', title: 'Sem imagem 1', coverImageUrl: null }),
          article({ id: '2', title: 'Sem imagem 2', coverImageUrl: null }),
        ],
        page: 1,
        pageSize: 20,
        total: 2,
        totalPages: 1,
      });

      expect(extractImgTags(html)).toHaveLength(0);
      expect(html).toContain('Sem imagem 1');
      expect(html).toContain('Sem imagem 2');
    });
  });
});
