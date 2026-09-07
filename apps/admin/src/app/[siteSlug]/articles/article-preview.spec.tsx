import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ElementType, ReactElement } from 'react';
import { ArticlePreview } from './article-preview';
import { ProductLookupProvider } from './product-lookup-context';
import type { CompiledArticleBody, CompiledBodySegment } from './compile-article-body';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-preview.spec.tsx
 *
 * UXE-009 — Preview do Artigo (base).
 * UXE-011 — Bloco Produto/Oferta: UI de inserção/edição (REESCRITO).
 *
 * `jest.mock('./compile-article-body', ...)` é ESTÁTICO — nunca
 * `jest.doMock` nem `jest.resetModules`. Ver o comentário original mais
 * abaixo (mantido) sobre por que `compileArticleBody` é obtido via
 * `jest.requireMock()`, nunca por import estático direto.
 *
 * MUDANÇA (UXE-011): antes, `compileArticleBody` resolvia para um único
 * componente MDX; agora resolve para uma LISTA de segmentos
 * (`CompiledArticleBody`, `./compile-article-body.ts`) — `'markdown'`
 * (mesmo componente MDX de sempre, um por segmento), `'product-block'`
 * (resolvido de verdade via `ProductLookupContext`, nunca MDX) e
 * `'product-block-error'` (mensagem de erro explícita, fail-closed). Os
 * helpers `markdownSegment`/`productBlockSegment`/`productBlockErrorSegment`
 * abaixo substituem o antigo `fakeCompiled` (que devolvia um componente
 * único) por construtores de segmento individuais — o teste continua sem
 * depender do parser MDX real (só mocka a fronteira de
 * `compileArticleBody`), exatamente como antes.
 *
 * O cenário antigo "exibe o bloco :::product como texto literal seguro"
 * não existe mais — era o comportamento ANTES da UXE-011 fechar essa
 * lacuna (nenhum plugin de diretiva sob `format: 'md'` fazia o bloco cair
 * como texto cru). Ele foi substituído por dois cenários novos, abaixo:
 * um confirmando que um segmento `'product-block'` nunca aparece como
 * texto (`:::product`) e é resolvido de verdade contra
 * `ProductLookupContext` real (via `ProductLookupProvider` + fetch
 * mockado), e outro confirmando que um segmento `'product-block-error'`
 * também nunca faz passthrough literal do texto original do bloco.
 */
jest.mock('./compile-article-body', () => ({
  compileArticleBody: jest.fn(),
}));

// `compileArticleBody` NÃO é obtido por `import { compileArticleBody } from
// './compile-article-body'` estático — causa raiz confirmada do bug
// reportado (`.mockResolvedValueOnce`/`.mockImplementationOnce` ausentes em
// runtime): imports ES são sempre resolvidos antes de qualquer outro
// código de nível de módulo (regra da própria linguagem, não algo que
// reordenar declarações no arquivo-fonte resolveria) — um `import` estático
// do MESMO especificador mockado por `jest.mock()`, neste projeto/setup de
// SWC do `next/jest`, capturou a função REAL antes da substituição do
// módulo surtir efeito, então a referência local nunca foi o `jest.fn()`
// do factory acima. `article-preview-error.spec.tsx` nunca sofria disso
// porque nunca importa `compileArticleBody` diretamente — só consome o
// mock indiretamente, em tempo de execução do teste, via `import()`
// dinâmico já existente dentro de `ArticlePreview` (código de produção,
// inalterado).
//
// `jest.requireMock()` busca a versão já mockada do módulo por uma chamada
// de função comum, executada em sequência normal (não uma declaração de
// import) — não sofre da regra de precedência de imports ES, não usa
// `jest.doMock`/`jest.resetModules`/import dinâmico.
const { compileArticleBody } = jest.requireMock<typeof import('./compile-article-body')>('./compile-article-body');
const compileArticleBodyMock = jest.mocked(compileArticleBody);

function markdownSegment(
  key: string,
  renderContent: (props: { components?: Record<string, unknown> }) => ReactElement,
): CompiledBodySegment {
  return {
    type: 'markdown',
    key,
    Content: renderContent as unknown as Extract<CompiledBodySegment, { type: 'markdown' }>['Content'],
  };
}

function productBlockSegment(key: string, productId: string): CompiledBodySegment {
  return { type: 'product-block', key, productId };
}

function productBlockErrorSegment(key: string, message: string): CompiledBodySegment {
  return { type: 'product-block-error', key, message };
}

function segments(...items: CompiledBodySegment[]): CompiledArticleBody {
  return items;
}

const PRODUCT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

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
          name: 'Fone Bluetooth',
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

afterEach(() => {
  jest.resetAllMocks();
});

describe('ArticlePreview', () => {
  it('abre o preview e mostra o conteúdo resolvido por compileArticleBody', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(segments(markdownSegment('segment-0', () => <p>Parágrafo de teste.</p>)));

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });
    expect(compileArticleBodyMock).toHaveBeenCalledWith('Parágrafo de teste.');
  });

  it('mostra o estado de carregamento enquanto compileArticleBody está em voo, e some quando resolve', async () => {
    let resolveCompile: (content: CompiledArticleBody) => void = () => {};
    compileArticleBodyMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCompile = resolve;
        }),
    );

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Gerando preview...')).toBeInTheDocument();
    });

    resolveCompile(segments(markdownSegment('segment-0', () => <p>Parágrafo de teste.</p>)));

    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Gerando preview...')).not.toBeInTheDocument();
  });

  it('fecha o preview ao clicar em "Fechar preview" e devolve o foco ao botão', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(segments(markdownSegment('segment-0', () => <p>Parágrafo de teste.</p>)));

    render(<ArticlePreview bodyMdx={'Parágrafo de teste.'} />);
    const toggleButton = screen.getByRole('button', { name: 'Ver preview' });
    await userEvent.click(toggleButton);
    await waitFor(() => {
      expect(screen.getByText('Parágrafo de teste.')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Fechar preview' }));

    expect(screen.queryByText('Parágrafo de teste.')).not.toBeInTheDocument();
    expect(toggleButton).toHaveFocus();
  });

  it('passa components={{ h1: "h2" }} adiante — heading nível 1 do conteúdo compilado sai como heading nível 2', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(
      segments(
        markdownSegment('segment-0', ({ components }) => {
          const Heading = (components?.h1 as ElementType) ?? 'h1';
          return <Heading>Seção do artigo</Heading>;
        }),
      ),
    );

    render(<ArticlePreview bodyMdx={'# Seção do artigo'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Seção do artigo' })).toBeInTheDocument();
    });
    // Nenhum h1 deve existir no preview — nem o do próprio painel (usa h2
    // para o rótulo "Preview"), nem o do conteúdo compilado (remapeado).
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('segmento "product-block": resolve de verdade contra ProductLookupContext — nome do Produto aparece, ":::product" nunca aparece como texto', async () => {
    mockLinkedProductFetch();
    compileArticleBodyMock.mockResolvedValueOnce(
      segments(
        markdownSegment('segment-0', () => <p>Texto antes do bloco.</p>),
        productBlockSegment('segment-1', PRODUCT_ID),
        markdownSegment('segment-2', () => <p>Texto depois do bloco.</p>),
      ),
    );

    const { container } = render(
      <ProductLookupProvider siteSlug="fastcompre" articleId="11111111-1111-4111-8111-111111111111">
        <ArticlePreview bodyMdx={'(irrelevante para este teste, ver mock acima)'} />
      </ProductLookupProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Fone Bluetooth')).toBeInTheDocument();
    });

    expect(screen.getByText('Texto antes do bloco.')).toBeInTheDocument();
    expect(screen.getByText('Texto depois do bloco.')).toBeInTheDocument();
    expect(container.textContent).not.toContain(':::product');
    expect(container.textContent).not.toContain('productId:');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('segmento "product-block" sem ProductLookupProvider (fonte indisponível): mostra mensagem explícita, nunca ":::product" cru', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(segments(productBlockSegment('segment-0', PRODUCT_ID)));

    const { container } = render(<ArticlePreview bodyMdx={'(irrelevante, ver mock acima)'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByText('Não foi possível carregar o Produto vinculado.')).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain(':::product');
  });

  it('segmento "product-block-error" (bloco malformado): mostra a mensagem de erro explícita, nunca o texto original do bloco', async () => {
    compileArticleBodyMock.mockResolvedValueOnce(
      segments(
        markdownSegment('segment-0', () => <p>Texto antes.</p>),
        productBlockErrorSegment('segment-1', 'productId não é um UUID válido (recebido "nao-e-uuid").'),
      ),
    );

    const { container } = render(<ArticlePreview bodyMdx={'(irrelevante, ver mock acima)'} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('productId não é um UUID válido');
    });
    expect(container.textContent).not.toContain(':::product');
    expect(screen.getByText('Texto antes.')).toBeInTheDocument();
  });

  it('marca o preview como desatualizado quando bodyMdx muda com o painel aberto, e "Atualizar preview" recompila', async () => {
    compileArticleBodyMock
      .mockResolvedValueOnce(segments(markdownSegment('segment-0', () => <p>Conteúdo original.</p>)))
      .mockResolvedValueOnce(segments(markdownSegment('segment-0', () => <p>Conteúdo novo.</p>)));

    const { rerender } = render(<ArticlePreview bodyMdx={'Conteúdo original.'} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));
    await waitFor(() => {
      expect(screen.getByText('Conteúdo original.')).toBeInTheDocument();
    });

    rerender(<ArticlePreview bodyMdx={'Conteúdo novo.'} />);

    expect(
      screen.getByText('O conteúdo foi alterado desde a última geração deste preview.', { exact: false }),
    ).toBeInTheDocument();
    // Sem recompilação automática: o conteúdo antigo continua visível até a
    // ação explícita.
    expect(screen.getByText('Conteúdo original.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar preview' }));

    await waitFor(() => {
      expect(screen.getByText('Conteúdo novo.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Conteúdo original.')).not.toBeInTheDocument();
    expect(
      screen.queryByText('O conteúdo foi alterado desde a última geração deste preview.', { exact: false }),
    ).not.toBeInTheDocument();
    expect(compileArticleBodyMock).toHaveBeenCalledTimes(2);
  });
});
