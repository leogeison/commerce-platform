import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen } from '@testing-library/react';
import type { ArticleAdmin } from '@commerce-platform/contracts';
import { ArticleReadOnly } from './article-read-only';

/**
 * `ArticleReadOnly` sempre dispara `fetchAllCategories`/`fetchAllAuthors`
 * ao montar, mesmo quando `categoryId`/`authorId` são `null` (o rótulo
 * "Sem categoria"/"Sem autor" já aparece de imediato, sem depender da
 * resolução). Testes que não têm nenhuma mudança de DOM para aguardar via
 * `findBy*` ainda precisam esvaziar a fila de microtasks dessas duas
 * promises dentro de `act()`, senão o `setState` de conclusão dispara já
 * fora do teste (aviso "not wrapped in act").
 */
async function flushPendingFetches() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const SITE_SLUG = 'fastcompre';
const CATEGORY_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const AUTHOR_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function paginated(items: unknown[]) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

function makeArticle(overrides: Partial<ArticleAdmin> = {}): ArticleAdmin {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'PUBLISHED',
    title: 'Melhor fone Bluetooth',
    slug: 'melhor-fone-bluetooth',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx: '',
    publishedAt: '2026-01-05T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetch(options: { categories?: () => Response; authors?: () => Response } = {}) {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.includes('/categories')) {
      return options.categories ? options.categories() : paginated([]);
    }
    if (url.includes('/authors')) {
      return options.authors ? options.authors() : paginated([]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

describe('ArticleReadOnly', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mostra título, tipo, status, meta description e corpo direto de article, sem chamada de rede para esses campos', async () => {
    mockFetch();
    render(
      <ArticleReadOnly
        siteSlug={SITE_SLUG}
        article={makeArticle({ metaDescription: 'Comparativo completo.', bodyMdx: 'Linha 1\nLinha 2' })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Publicado')).toBeInTheDocument();
    expect(screen.getByText('Comparativo completo.')).toBeInTheDocument();
    await flushPendingFetches();
  });

  it('preserva quebras de linha do bodyMdx como texto puro, sem renderizar Markdown', async () => {
    mockFetch();
    render(<ArticleReadOnly siteSlug={SITE_SLUG} article={makeArticle({ bodyMdx: '# Título\n\nParágrafo.' })} />);

    const body = screen.getByText((_, element) => element?.textContent === '# Título\n\nParágrafo.');
    expect(body.tagName).toBe('P');
    expect(screen.queryByRole('heading', { name: 'Título' })).not.toBeInTheDocument();
    await flushPendingFetches();
  });

  it('categoryId/authorId nulos: mostra "Sem categoria"/"Sem autor"', async () => {
    mockFetch();
    render(<ArticleReadOnly siteSlug={SITE_SLUG} article={makeArticle({ categoryId: null, authorId: null })} />);

    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByText('Sem autor')).toBeInTheDocument();
    await flushPendingFetches();
  });

  it('metaDescription/coverImageUrl nulos: mostra "Sem meta description"/"Sem capa"', async () => {
    mockFetch();
    render(
      <ArticleReadOnly
        siteSlug={SITE_SLUG}
        article={makeArticle({ metaDescription: null, coverImageUrl: null })}
      />,
    );

    expect(screen.getByText('Sem meta description')).toBeInTheDocument();
    expect(screen.getByText('Sem capa')).toBeInTheDocument();
    expect(screen.queryByAltText('Capa do Artigo')).not.toBeInTheDocument();
    await flushPendingFetches();
  });

  it('coverImageUrl preenchida: mostra a imagem', async () => {
    mockFetch();
    render(
      <ArticleReadOnly
        siteSlug={SITE_SLUG}
        article={makeArticle({ coverImageUrl: 'http://localhost:9000/local-dev-bucket/cover.jpg' })}
      />,
    );

    expect(screen.getByAltText('Capa do Artigo')).toHaveAttribute(
      'src',
      'http://localhost:9000/local-dev-bucket/cover.jpg',
    );
    await flushPendingFetches();
  });

  it('categoryId/authorId preenchidos: resolve o nome via fetchAllCategories/fetchAllAuthors', async () => {
    mockFetch({
      categories: () =>
        paginated([
          {
            id: CATEGORY_ID,
            siteId: '99999999-9999-4999-8999-999999999999',
            name: 'Eletrônicos',
            slug: 'eletronicos',
            archivedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ]),
      authors: () =>
        paginated([
          {
            id: AUTHOR_ID,
            siteId: '99999999-9999-4999-8999-999999999999',
            userId: null,
            name: 'Ana Reviewer',
            bio: null,
            avatarUrl: null,
          },
        ]),
    });

    render(<ArticleReadOnly siteSlug={SITE_SLUG} article={makeArticle({ categoryId: CATEGORY_ID, authorId: AUTHOR_ID })} />);

    expect(await screen.findByText('Eletrônicos')).toBeInTheDocument();
    expect(await screen.findByText('Ana Reviewer')).toBeInTheDocument();
  });

  it('falha ao resolver Categoria/Autor: mostra mensagem local, resto da página intacto', async () => {
    mockFetch({ categories: () => jsonResponse(500, {}), authors: () => jsonResponse(500, {}) });

    render(<ArticleReadOnly siteSlug={SITE_SLUG} article={makeArticle({ categoryId: CATEGORY_ID, authorId: AUTHOR_ID })} />);

    expect(await screen.findByText('Não foi possível carregar a Categoria.')).toBeInTheDocument();
    expect(await screen.findByText('Não foi possível carregar o Autor.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
  });

  it('nenhum <input>/<textarea>/<select> presente no DOM', async () => {
    mockFetch();
    const { container } = render(<ArticleReadOnly siteSlug={SITE_SLUG} article={makeArticle()} />);

    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(0);
    await flushPendingFetches();
  });
});
