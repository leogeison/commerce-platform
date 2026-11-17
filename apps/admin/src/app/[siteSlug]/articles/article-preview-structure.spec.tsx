/**
 * apps/admin/src/app/[siteSlug]/articles/article-preview-structure.spec.tsx
 *
 * UXE-009A — Fidelidade visual do Preview do Artigo: guarda de regressão da
 * ESTRUTURA da camada do Preview, premissa dos seletores do CSS da
 * UXE-009A (`article-form.module.css`, bloco `.previewContent …`).
 *
 * O que este spec prova (independente de aparência):
 * - cada segmento compilado (Markdown e bloco de Produto/Oferta) é
 *   renderizado como filho DIRETO de `.previewContent`, sem nenhum wrapper
 *   — os seletores `.previewContent > …` (primeiro filho, bloco de Produto)
 *   dependem disso;
 * - `ProductBlockPreview` (resolvido, carregando) e o erro de bloco
 *   malformado também são filhos diretos;
 * - o Preview continua repassando `components={{ h1: 'h2' }}` — H1 do corpo
 *   sai como `<h2>` — e os elementos semânticos chegam intactos ao DOM.
 *
 * `compileArticleBody` é mockado aqui, como em `article-preview.spec.tsx`:
 * o Jest deste app não carrega o ESM real de `@mdx-js/mdx` (limitação de
 * tooling já registrada em `compile-article-body.spec.ts`; resolver exigiria
 * mudar `next.config.ts`, fora do escopo). A estrutura produzida pelo MDX
 * REAL é verificada em navegador real, contra o build de produção, em
 * `e2e-a11y/article-preview.a11y.spec.ts`; a aparência (estilos
 * calculados), em `e2e-a11y/article-preview-presentation.spec.ts`. O jsdom
 * não aplica CSS Modules (`next/jest` os troca por um proxy que devolve o
 * nome da classe — o que permite localizar `.previewContent` aqui).
 */

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ElementType, type ReactElement } from 'react';
import { ArticlePreview } from './article-preview';
import { ProductLookupProvider } from './product-lookup-context';
import type { CompiledArticleBody, CompiledBodySegment } from './compile-article-body';

jest.mock('./compile-article-body', () => ({
  compileArticleBody: jest.fn(),
}));

// Mesmo motivo documentado em `article-preview.spec.tsx`: `jest.requireMock()`
// em vez de import estático do especificador mockado.
const { compileArticleBody } = jest.requireMock<typeof import('./compile-article-body')>('./compile-article-body');
const compileArticleBodyMock = jest.mocked(compileArticleBody);

const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PRODUCT_NAME = 'Fone Bluetooth';

function mockLinkedProductFetch(): void {
  global.fetch = jest.fn<typeof fetch>(async (input) => {
    const url = String(input);
    const ok = (body: unknown) => ({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }) as Response;
    if (url.endsWith('/products')) {
      return ok({ productIds: [PRODUCT_ID] });
    }
    return ok({
      items: [
        {
          id: PRODUCT_ID,
          siteId: '22222222-2222-4222-8222-222222222222',
          categoryId: null,
          name: PRODUCT_NAME,
          slug: 'fone-bluetooth',
          description: null,
          imageUrl: null,
          archivedAt: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 100,
      total: 1,
      totalPages: 1,
    });
  });
}

/**
 * Segmento de Markdown cujo `Content` devolve um FRAGMENTO (como o MDX real
 * faz), com a mesma forma que `@mdx-js/mdx` produz para conteúdo do editor,
 * e que honra `components.h1` exatamente como o MDX real.
 */
function firstMarkdownSegment(): CompiledBodySegment {
  const Content = ({ components }: { components?: Record<string, unknown> }): ReactElement => {
    const H1 = (components?.h1 as ElementType | undefined) ?? 'h1';
    return (
      <>
        {createElement(H1, null, 'Título do corpo')}
        <p>
          Parágrafo com <a href="https://exemplo.com/a">link</a>.
        </p>
        <h3>Subseção</h3>
        <ul>
          <li>item um</li>
          <li>item dois</li>
        </ul>
        <blockquote>
          <p>citação</p>
        </blockquote>
      </>
    );
  };
  return {
    type: 'markdown',
    key: 'md-1',
    Content: Content as unknown as Extract<CompiledBodySegment, { type: 'markdown' }>['Content'],
  };
}

function secondMarkdownSegment(): CompiledBodySegment {
  const Content = (): ReactElement => (
    <>
      <p>
        <img src="https://cdn.exemplo.com/foto.png" alt="Foto do produto" />
      </p>
      <p>Último parágrafo.</p>
    </>
  );
  return {
    type: 'markdown',
    key: 'md-2',
    Content: Content as unknown as Extract<CompiledBodySegment, { type: 'markdown' }>['Content'],
  };
}

async function openPreview(compiled: CompiledArticleBody): Promise<{ region: HTMLElement; content: HTMLElement }> {
  const user = userEvent.setup();
  compileArticleBodyMock.mockResolvedValueOnce(compiled);
  render(
    <ProductLookupProvider siteSlug="fastcompre" articleId="11111111-1111-4111-8111-111111111111">
      <ArticlePreview bodyMdx="conteúdo qualquer" />
    </ProductLookupProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Ver preview' }));
  const region = await screen.findByRole('region', { name: 'Preview' });
  await within(region).findByText('Último parágrafo.');
  const content = region.querySelector('.previewContent');
  if (!(content instanceof HTMLElement)) {
    throw new Error('`.previewContent` não encontrado no Preview.');
  }
  return { region, content };
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('ArticlePreview — estrutura da camada do Preview (UXE-009A)', () => {
  it('segmentos e blocos de Produto são filhos DIRETOS de .previewContent, na ordem, sem wrapper', async () => {
    mockLinkedProductFetch();
    const { content } = await openPreview([
      firstMarkdownSegment(),
      { type: 'product-block', key: 'pb-1', productId: PRODUCT_ID },
      { type: 'product-block-error', key: 'pbe-1', message: 'Bloco de Produto inválido.' },
      secondMarkdownSegment(),
    ]);
    await within(content).findByText(PRODUCT_NAME);

    expect(Array.from(content.children).map((child) => child.tagName.toLowerCase())).toEqual([
      'h2', // H1 do corpo remapeado por components={{ h1: 'h2' }}
      'p',
      'h3',
      'ul',
      'blockquote',
      'div', // ProductBlockPreview (resolvido)
      'p', // erro de bloco malformado
      'p', // imagem dentro de parágrafo
      'p',
    ]);

    const productBlock = content.querySelector(`[data-product-id="${PRODUCT_ID}"]`);
    expect(productBlock?.parentElement).toBe(content);
    expect(productBlock).toHaveTextContent(PRODUCT_NAME);
    const malformedBlockError = within(content).getByRole('alert');
    expect(malformedBlockError).toHaveTextContent('Bloco de Produto inválido.');
    expect(malformedBlockError.parentElement).toBe(content);
  });

  it('elementos semânticos chegam intactos: heading nível 2 para o H1, lista com itens, citação, link e imagem dentro de parágrafo', async () => {
    mockLinkedProductFetch();
    const { content } = await openPreview([firstMarkdownSegment(), secondMarkdownSegment()]);

    expect(within(content).getByRole('heading', { level: 2, name: 'Título do corpo' })).toBeInTheDocument();
    expect(within(content).getByRole('heading', { level: 3, name: 'Subseção' })).toBeInTheDocument();
    expect(within(within(content).getByRole('list')).getAllByRole('listitem')).toHaveLength(2);
    expect(content.querySelector(':scope > blockquote > p')).toHaveTextContent('citação');
    expect(within(content).getByRole('link', { name: 'link' })).toHaveAttribute('href', 'https://exemplo.com/a');
    const image = within(content).getByRole('img', { name: 'Foto do produto' });
    expect(image.parentElement?.tagName).toBe('P');
    expect(image.parentElement?.parentElement).toBe(content);
  });

  it('ProductBlockPreview em carregamento também é filho direto de .previewContent', async () => {
    // Fonte compartilhada nunca resolve: o bloco permanece no estado de carregamento.
    global.fetch = jest.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    const { content } = await openPreview([
      { type: 'product-block', key: 'pb-1', productId: PRODUCT_ID },
      secondMarkdownSegment(),
    ]);

    const loading = within(content).getByRole('status');
    expect(loading.parentElement).toBe(content);
    expect(content.firstElementChild).toBe(loading);
  });
});
