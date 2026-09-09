import type { ContextType } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { $createParagraphNode, $getRoot, getNearestEditorFromDOMNode } from 'lexical';
import type { Role } from '@commerce-platform/contracts';
import { ArticleDetail } from './article-detail';
import { PageModalProvider } from '../../page-modal-context';
import { SiteRoleProvider } from '../../site-role-context';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';

/**
 * Helper de teste ESTRITO A ESTA ÁREA (Artigos) — mesma estratégia já
 * aprovada em `article-form.spec.tsx` para o cenário equivalente de
 * inserção (ver o racional completo lá): `jsdom`/
 * `@testing-library/user-event` não simula de forma confiável a edição
 * de um editor Lexical real através de `user.clear()` — a mesma causa
 * raiz já comprovada por diagnóstico (falha na simulação de
 * teclado/seleção do `jsdom` para este editor, não um bug de produção).
 * Em vez disso, este helper obtém a instância REAL do `LexicalEditor` via
 * API pública (`getNearestEditorFromDOMNode`) e apaga o conteúdo a nível
 * de modelo, via APIs públicas do Lexical: `$getRoot().clear()` remove
 * todos os filhos, e `root.append($createParagraphNode())` restaura o
 * único parágrafo vazio que o próprio Lexical sempre mantém como estado
 * normalizado de "documento vazio" (o mesmo formato observado ao
 * importar `bodyMdx: ''`) — sem isso, um `root` sem nenhum filho é um
 * estado que o Lexical não produz sozinho. Isso deixa o `OnChangePlugin`
 * + `ChangeTrackerPlugin` reais (nenhum mockado) propagarem a mudança
 * normalmente para `ArticleBodyEditor.onChange` → `ArticleForm.setBodyMdx`,
 * exatamente como propagariam para uma edição real do usuário.
 */
function clearRealLexicalEditor(editorRoot: HTMLElement): void {
  const editor = getNearestEditorFromDOMNode(editorRoot);
  if (!editor) {
    throw new Error('clearRealLexicalEditor: nenhuma instância de LexicalEditor encontrada a partir do DOM.');
  }
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      root.append($createParagraphNode());
    },
    { discrete: true },
  );
}

const mockReplace = jest.fn();
const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

/**
 * `role` default `'OWNER'` preserva o comportamento dos testes já
 * existentes antes da ADM-012 (composição editável em DRAFT, os 5 botões
 * de transição por status) — os testes específicos de `VIEWER`/`EDITOR`
 * passam a Role explicitamente.
 *
 * UXE-008 — mesmo critério de `create-article.spec.tsx`: em produção,
 * `ArticleDetail` (via `ArticleForm`) só é montado dentro do subtree de
 * `/:siteSlug/*`, que `SiteLayout` (`app/[siteSlug]/layout.tsx`) sempre
 * envolve com `UnsavedChangesProvider` ao redor de `AuthenticatedShell`
 * — nunca o próprio `ArticleDetail`. Este helper reproduz essa mesma
 * hierarquia real, não uma adaptação só para o teste passar.
 *
 * UXE-013 (ajuste pós-revisão) — `AuthenticatedShell` é quem monta
 * `<PageModalProvider>` em produção (ver `authenticated-shell.tsx`),
 * nunca `ArticleDetail`/`SiteLayout` diretamente; mas como este helper já
 * reproduz a hierarquia real "de fora para dentro" a partir de
 * `UnsavedChangesProvider` (sem montar a shell inteira, chrome/roteamento
 * não fazem parte do que estes testes exercitam), `PageModalProvider`
 * precisa ser adicionado aqui pelo MESMO motivo: `ArticleContextPanel`
 * (via `ArticleDetail`) chama `usePageModal()` incondicionalmente, e essa
 * chamada é hoje um erro de programação fora de um Provider (ver
 * `page-modal-context.tsx`) — nunca deve virar opcional/no-op só para o
 * teste passar. `setPageModalOpen` é um `jest.fn()` novo por render,
 * suficiente porque nenhum teste desta suíte precisa inspecionar
 * chamadas a ele (isso já é coberto em `article-context-panel.spec.tsx`)
 * — só a fiação real com `.content` (ver os dois testes de integração
 * "UXE-013" abaixo).
 */
function renderDetail(role: Role = 'OWNER') {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <UnsavedChangesProvider>
        <SiteRoleProvider value={role}>
          <PageModalProvider setPageModalOpen={jest.fn()}>
            <ArticleDetail siteSlug="fastcompre" id="11111111-1111-4111-8111-111111111111" />
          </PageModalProvider>
        </SiteRoleProvider>
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>,
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function emptyPaginated() {
  return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0, totalPages: 0 });
}

function catalogResponse(items: unknown[]) {
  return jsonResponse(200, { items, page: 1, pageSize: 100, total: items.length, totalPages: 1 });
}

const TRANSITION_PATH_PATTERN = /\/(submit-for-review|revert-to-draft|publish|archive|restore-to-draft)$/;

const draftArticle = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  authorId: null,
  type: 'REVIEW',
  status: 'DRAFT',
  title: 'Melhor fone Bluetooth',
  slug: 'melhor-fone-bluetooth',
  metaDescription: null,
  coverImageUrl: null,
  bodyMdx: '# Conteúdo original',
  publishedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function healthyResponse() {
  return {
    categoryActive: true,
    hasAtLeastOneProduct: true,
    allProductsHaveValidOffer: true,
    invalidProducts: [],
    slugUnique: true,
    metaDescriptionFilled: true,
    coverImagePresent: true,
    healthy: true,
  };
}

const PRODUCT_A = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  name: 'Fone Bluetooth',
  slug: 'fone-bluetooth',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PRODUCT_B = {
  id: 'bbbbbbbb-2222-4222-8222-222222222222',
  siteId: '22222222-2222-4222-8222-222222222222',
  categoryId: null,
  name: 'Caixa de Som',
  slug: 'caixa-de-som',
  description: null,
  imageUrl: null,
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/**
 * Roteador de fetch cobrindo todos os efeitos independentes compostos por
 * `ArticleDetail`: detalhe do Artigo (`getArticleCallCount` conta só
 * este), `/health` (`getHealthCallCount` conta só este — ADM-011),
 * Categorias/Autores (`ArticleForm` em DRAFT, `ArticleReadOnly` fora de
 * DRAFT), Produtos vinculados (`GET/POST/DELETE/PATCH reorder :id/products`)
 * e catálogo completo do Site (`GET /products?page=...`, usado tanto por
 * `ArticleProductsSection`/`ArticleProductsReadOnly` quanto por
 * `ArticleHealthChecklist` para resolver nomes de `invalidProducts`) e as
 * 5 rotas de transição (`ArticleTransitionPanel`).
 *
 * `productIds`/`catalogItems` controlam o estado inicial dos Produtos
 * vinculados/catálogo; `link`/`unlink`/`reorder` sobrescrevem a resposta de
 * cada mutação quando o teste precisa simular sucesso com dados concretos
 * ou falha.
 */
function mockFetch(options: {
  article: () => Response;
  patch?: () => Response;
  transition?: () => Response;
  health?: () => Response;
  productIds?: string[];
  catalogItems?: unknown[];
  link?: () => Response;
  unlink?: () => Response;
  reorder?: () => Response;
}) {
  let getArticleCallCount = 0;
  let getHealthCallCount = 0;
  let getProductsCallCount = 0;

  const fetchMock = jest.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    const method = init?.method;

    if (method === 'POST' && TRANSITION_PATH_PATTERN.test(url)) {
      return options.transition ? options.transition() : jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' });
    }
    if (url.endsWith('/health')) {
      getHealthCallCount += 1;
      return options.health ? options.health() : jsonResponse(200, healthyResponse());
    }
    if (method === 'POST' && url.endsWith('/products')) {
      return options.link ? options.link() : jsonResponse(200, { productIds: options.productIds ?? [] });
    }
    if (method === 'DELETE' && url.includes('/products/')) {
      return options.unlink ? options.unlink() : jsonResponse(200, { productIds: [] });
    }
    if (method === 'PATCH' && url.endsWith('/products/reorder')) {
      return options.reorder ? options.reorder() : jsonResponse(200, { productIds: options.productIds ?? [] });
    }
    if (method === 'PATCH' && !url.includes('/products')) {
      return options.patch ? options.patch() : jsonResponse(200, draftArticle);
    }
    if (url.includes('/categories')) {
      return emptyPaginated();
    }
    if (url.includes('/authors')) {
      return emptyPaginated();
    }
    if (url.endsWith('/products')) {
      // UXE-014 — GET .../articles/:id/products (vínculos): na composição
      // DRAFT editável, esta é a busca de `ProductLookupProvider` (que
      // agora também envolve `ArticleContextPanel`, ver `article-detail.tsx`);
      // na composição read-only, é a busca própria e independente de
      // `ArticleProductsReadOnly` — `ProductLookupProvider` nunca é montado
      // lá (decisão conservadora da UXE-014). `getProductsCallCount` conta
      // as duas indistintamente, de propósito: o que os testes abaixo
      // verificam é que o TOTAL não dobra por causa do painel, nunca qual
      // dos dois disparou.
      getProductsCallCount += 1;
      return jsonResponse(200, { productIds: options.productIds ?? [] });
    }
    if (url.includes('/products')) {
      return catalogResponse(options.catalogItems ?? []);
    }

    getArticleCallCount += 1;
    return options.article();
  });

  global.fetch = fetchMock;

  return {
    getArticleCallCount: () => getArticleCallCount,
    getHealthCallCount: () => getHealthCallCount,
    getProductsCallCount: () => getProductsCallCount,
  };
}

describe('ArticleDetail', () => {
  afterEach(() => {
    mockReplace.mockClear();
    jest.restoreAllMocks();
  });

  it('estado inicial: mostra "Carregando..."', () => {
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise(() => {}));
    renderDetail();

    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('404: mostra a mensagem vinda da API', async () => {
    mockFetch({
      article: () =>
        jsonResponse(404, { statusCode: 404, code: 'NOT_FOUND', error: 'Not Found', message: 'Artigo não encontrado.' }),
    });
    renderDetail();

    expect(await screen.findByText('Artigo não encontrado.')).toBeInTheDocument();
  });

  it('DRAFT: renderiza ArticleForm preenchido, a seção de Produtos vinculados e "Enviar para revisão"', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail();

    expect(await screen.findByLabelText('Título')).toHaveValue('Melhor fone Bluetooth');
    expect(screen.getByLabelText('Slug')).toHaveValue('melhor-fone-bluetooth');
    expect(screen.getByLabelText('Corpo (Markdown)')).toHaveTextContent('Conteúdo original');
    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument();
  });

  // --- UXE-012: painel lateral contextual (ArticleContextPanel) ---
  //
  // Nas composições NÃO-DRAFT, o rótulo de status (`STATUS_LABELS`) passa
  // a aparecer DUAS vezes no DOM depois desta tarefa: uma no resumo
  // (`<dl>`) de `ArticleReadOnly` (já existia antes) e outra no badge
  // sempre visível de `ArticleContextPanel` (novo nesta tarefa) — os dois
  // com propósito diferente, não uma duplicação acidental. Os testes
  // abaixo que já verificavam esse rótulo foram ajustados de
  // `getByText`/`findByText` (que exigem exatamente 1 ocorrência) para
  // `getAllByText`/`findAllByText` com `toHaveLength(2)`, refletindo esse
  // comportamento aprovado. Na composição DRAFT editável não há
  // duplicação (`ArticleForm` nunca mostrou rótulo de status) — nenhum
  // teste dela precisou mudar por causa disso.

  it('UXE-012: ArticleContextPanel (região "Status do Artigo") presente na composição DRAFT editável', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail();

    await screen.findByLabelText('Título');
    expect(screen.getByRole('complementary', { name: 'Status do Artigo' })).toBeInTheDocument();
  });

  it('UXE-012: ArticleContextPanel (região "Status do Artigo") presente na composição read-only', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }) });
    renderDetail();

    await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' });
    expect(screen.getByRole('complementary', { name: 'Status do Artigo' })).toBeInTheDocument();
  });

  // --- UXE-013 (ajuste pós-revisão): integração real do backgroundContentRef ---
  //
  // `article-context-panel.spec.tsx` já cobre exaustivamente o mecanismo
  // de inertização em si (dado UM ref qualquer); os dois testes abaixo
  // cobrem só a FIAÇÃO real entre `ArticleDetail` (dono do `.content`) e
  // `ArticleContextPanel` — a costura que quebraria silenciosamente se o
  // `ref` fosse esquecido ou anexado ao elemento errado, sem duplicar a
  // cobertura interna do drawer (Escape/backdrop/focus trap/scroll lock
  // não são reexercitados aqui).

  it('UXE-013: abrir o drawer mobile na composição DRAFT editável real deixa o .content (ArticleForm) inert; fechar remove', async () => {
    const user = userEvent.setup();
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    const { container } = renderDetail();

    await screen.findByLabelText('Título');
    const content = container.querySelector('[class*="content"]');
    expect(content).not.toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Status e ações do Artigo' }));
    expect(content).toHaveAttribute('inert');

    await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
    expect(content).not.toHaveAttribute('inert');
  });

  it('UXE-013: abrir o drawer mobile na composição read-only real deixa o .content (ArticleReadOnly) inert; fechar remove', async () => {
    const user = userEvent.setup();
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }) });
    const { container } = renderDetail();

    await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' });
    const content = container.querySelector('[class*="content"]');
    expect(content).not.toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Status e ações do Artigo' }));
    expect(content).toHaveAttribute('inert');

    await user.click(await screen.findByRole('button', { name: 'Fechar Status e ações do Artigo' }));
    expect(content).not.toHaveAttribute('inert');
  });

  // --- UXE-014: ArticleProductsSection dentro do painel (integração real) ---
  //
  // `article-context-panel.spec.tsx` já cobre a composição do painel em
  // isolamento (presença/ausência/ordem/focus trap); os testes abaixo
  // cobrem só a FIAÇÃO real entre `ArticleDetail` e o painel: o gating
  // (`canManageProducts`) recebendo o `isDraft && canEdit` real já
  // calculado por este componente, e a fronteira ampliada de
  // `ProductLookupProvider` (decisão conservadora da UXE-014) não
  // introduzindo nenhuma busca nova na composição read-only.

  it('UXE-014: composição DRAFT editável real — Produtos vinculados aparece dentro do painel "Status do Artigo", com controles funcionais', async () => {
    const user = userEvent.setup();
    mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [],
      catalogItems: [PRODUCT_A],
      link: () => jsonResponse(200, { productIds: [PRODUCT_A.id] }),
    });
    renderDetail();

    await screen.findByLabelText('Título');
    const panel = screen.getByRole('complementary', { name: 'Status do Artigo' });
    const productsHeading = screen.getByRole('heading', { name: 'Produtos vinculados' });
    expect(panel).toContainElement(productsHeading);

    await user.selectOptions(screen.getByLabelText('Adicionar Produto'), PRODUCT_A.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(screen.getByText('Fone Bluetooth')).toBeInTheDocument());
  });

  it('UXE-014: composição read-only real — nenhuma busca extra de vínculos por causa do painel (ProductLookupProvider não é montado nesta composição)', async () => {
    const fetchState = mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }) });
    renderDetail();

    await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' });
    await screen.findByText('Nenhum Produto vinculado.');

    // CORREÇÃO (pós-revisão): `ArticleProductsReadOnly` (dentro de
    // `.content`, intocado por esta tarefa) TAMBÉM renderiza um heading
    // "Produtos vinculados" — `queryByRole` global para esse heading é
    // ambíguo por natureza (ele é esperado, só que numa superfície
    // diferente da que este teste quer excluir). A invariante real é
    // dupla, verificada por escopo/semântica em vez de posição: (1) esse
    // heading continua existindo exatamente 1 vez no total, vindo de
    // `ArticleProductsReadOnly` (comportamento preexistente, inalterado);
    // (2) o painel "Status do Artigo" (`ArticleContextPanel`, localizado
    // por role/nome acessível) especificamente NÃO o contém — ou seja,
    // `ArticleProductsSection` (gerenciável) continua fora do painel
    // nesta composição.
    expect(screen.getAllByRole('heading', { name: 'Produtos vinculados' })).toHaveLength(1);
    const panel = screen.getByRole('complementary', { name: 'Status do Artigo' });
    expect(within(panel).queryByRole('heading', { name: 'Produtos vinculados' })).not.toBeInTheDocument();

    // "Adicionar Produto" é um controle exclusivo de `ArticleProductsSection`
    // (gerenciável) — `ArticleProductsReadOnly` nunca o renderiza, então
    // sua ausência global continua sendo uma verificação inequívoca, sem
    // precisar de escopo.
    expect(screen.queryByLabelText('Adicionar Produto')).not.toBeInTheDocument();

    // Só `ArticleProductsReadOnly` busca `.../products` nesta composição
    // (comportamento já existente, inalterado). Se `ProductLookupProvider`
    // fosse indevidamente montado aqui, o mesmo endpoint seria chamado uma
    // segunda vez.
    expect(fetchState.getProductsCallCount()).toBe(1);
  });

  it('status !== DRAFT (PUBLISHED): composição somente leitura + Produtos somente leitura + botão "Arquivar", sem ArticleForm', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }) });
    renderDetail();

    expect(await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
    // UXE-012: "Publicado" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(screen.getAllByText('Publicado')).toHaveLength(2);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument();
  });

  it('status !== DRAFT (PENDING_REVIEW): botões "Publicar" e "Voltar para rascunho"', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' }) });
    renderDetail();

    // UXE-012: "Em revisão" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(await screen.findAllByText('Em revisão')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar para rascunho' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('status !== DRAFT (ARCHIVED): botão "Restaurar para rascunho"', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'ARCHIVED' }) });
    renderDetail();

    // UXE-012: "Arquivado" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(await screen.findAllByText('Arquivado')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Restaurar para rascunho' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
  });

  it('DRAFT → PENDING_REVIEW: "Enviar para revisão" troca a composição usando o ArticleAdmin da resposta, sem novo GET /:id', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Enviar para revisão' }));

    expect(await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
    // UXE-013 (ajuste pós-revisão): desde a UXE-013, o indicador externo de
    // `ArticleContextPanel` deixou de repetir o rótulo de status isolado —
    // seu texto agora é composto (rótulo + resumo de saúde, ex.: "Em
    // revisão · Sem pendências"), então não há mais duas ocorrências
    // EXATAS de "Em revisão" no DOM (a antiga contagem `toHaveLength(2)`
    // ficaria presa em 1).
    //
    // CORREÇÃO (pós-revisão): DRAFT → PENDING_REVIEW troca de branch
    // (`isDraft` muda de `true` para `false`), então `ArticleContextPanel`
    // REMONTA como uma instância nova — seu `healthSummary` local volta a
    // nascer em `{status:'loading'}`, e enquanto o novo `GET :id/health`
    // dessa instância não resolve, `summaryText()` mostra só o rótulo
    // isolado ("Em revisão"), sem o sufixo de saúde. Isso cria uma
    // corrida real (não uma regra de produção): entre o instante em que
    // `ArticleReadOnly` aparece e o instante em que essa nova instância
    // termina de buscar `/health`, existem MOMENTANEAMENTE duas
    // ocorrências exatas de "Em revisão" — o texto isolado de
    // `ArticleReadOnly` e o texto isolado (ainda não composto) do
    // indicador externo. `getByText` sozinho, logo após o `findByRole` do
    // heading, cai nessa janela. A correção é esperar o indicador externo
    // assentar no seu texto composto final ANTES de afirmar as duas
    // invariantes — cada uma continua verificada pela sua própria
    // superfície, nenhuma contagem global.
    const externalIndicator = screen.getByRole('button', { name: 'Status e ações do Artigo' }).parentElement;
    await waitFor(() => expect(externalIndicator).toHaveTextContent('Em revisão · Sem pendências'));

    // (1) `ArticleReadOnly` continua exibindo o rótulo isolado — `getByText`
    // exato já é inequívoco agora que o indicador externo assentou no
    // texto composto (só sobra essa ocorrência).
    expect(screen.getByText('Em revisão')).toBeInTheDocument();
    // (2) o indicador externo — localizado pelo seu trigger correspondente
    // ("Status e ações do Artigo", por papel/nome acessível), não por
    // posição — continua perceptibilizando o mesmo status, verificado por
    // conteúdo (substring), nunca por contagem de strings idênticas.
    expect(externalIndicator).toHaveTextContent('Em revisão');
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(fetchState.getArticleCallCount()).toBe(1);
  });

  it('PATCH sempre envia bodyMdx, inclusive string vazia (apagar o corpo é uma edição válida)', async () => {
    const user = userEvent.setup();
    let capturedPatchBody: unknown;
    global.fetch = jest.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (init?.method === 'PATCH' && !url.includes('/products')) {
        capturedPatchBody = JSON.parse(String(init.body));
        return jsonResponse(200, { ...draftArticle, bodyMdx: '' });
      }
      if (url.includes('/categories') || url.includes('/authors')) {
        return emptyPaginated();
      }
      if (url.endsWith('/products')) {
        return jsonResponse(200, { productIds: [] });
      }
      if (url.includes('/products')) {
        return emptyPaginated();
      }
      return jsonResponse(200, draftArticle);
    });

    renderDetail();

    const bodyField = await screen.findByLabelText('Corpo (Markdown)');
    // Ver o racional completo em `clearRealLexicalEditor`: apagar o corpo
    // via `user.clear()` não é confiável no jsdom para o editor Lexical
    // real, então a limpeza é feita a nível de modelo, via API pública do
    // Lexical, com o OnChangePlugin/ChangeTrackerPlugin reais propagando
    // a mudança normalmente.
    act(() => {
      clearRealLexicalEditor(bodyField);
    });
    await waitFor(() => expect(bodyField.textContent).toBe(''));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(capturedPatchBody).toBeDefined());
    expect(capturedPatchBody).toMatchObject({ bodyMdx: '' });
    expect(capturedPatchBody).not.toHaveProperty('status');
    expect(capturedPatchBody).not.toHaveProperty('publishedAt');
  });

  it('PATCH: erro de negócio (409, fora de DRAFT) mostra a mensagem da API, permanece na página', async () => {
    const user = userEvent.setup();
    mockFetch({
      article: () => jsonResponse(200, draftArticle),
      patch: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Somente Artigos em DRAFT podem ser editados.',
        }),
    });
    renderDetail();

    await screen.findByLabelText('Título');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Somente Artigos em DRAFT podem ser editados.')).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  // --- ADM-011: healthRevision aciona novo GET :id/health nos pontos exatos aprovados ---

  it('healthRevision: PATCH bem-sucedido do ArticleForm em DRAFT causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      patch: () => jsonResponse(200, draftArticle),
    });
    renderDetail();

    await screen.findByLabelText('Título');
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(2));
  });

  it('healthRevision: PATCH com falha (409) NÃO causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      patch: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Somente Artigos em DRAFT podem ser editados.',
        }),
    });
    renderDetail();

    await screen.findByLabelText('Título');
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Somente Artigos em DRAFT podem ser editados.')).toBeInTheDocument();
    expect(fetchState.getHealthCallCount()).toBe(1);
  });

  it('healthRevision: vincular Produto com sucesso causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [],
      catalogItems: [PRODUCT_A],
      link: () => jsonResponse(200, { productIds: [PRODUCT_A.id] }),
    });
    renderDetail();

    await screen.findByText('Adicionar Produto');
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.selectOptions(screen.getByLabelText('Adicionar Produto'), PRODUCT_A.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(2));
  });

  it('healthRevision: vincular Produto com falha NÃO causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [],
      catalogItems: [PRODUCT_A],
      link: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Produto já vinculado a este Artigo.',
        }),
    });
    renderDetail();

    await screen.findByText('Adicionar Produto');
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.selectOptions(screen.getByLabelText('Adicionar Produto'), PRODUCT_A.id);
    await user.click(screen.getByRole('button', { name: 'Vincular' }));

    expect(await screen.findByText('Produto já vinculado a este Artigo.')).toBeInTheDocument();
    expect(fetchState.getHealthCallCount()).toBe(1);
  });

  it('healthRevision: desvincular Produto com sucesso causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [PRODUCT_A.id],
      catalogItems: [PRODUCT_A],
      unlink: () => jsonResponse(200, { productIds: [] }),
    });
    renderDetail();

    await screen.findByText(PRODUCT_A.name);
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Remover' }));

    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(2));
  });

  it('healthRevision: desvincular Produto com falha NÃO causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [PRODUCT_A.id],
      catalogItems: [PRODUCT_A],
      unlink: () =>
        jsonResponse(409, {
          statusCode: 409,
          code: 'CONFLICT',
          error: 'Conflict',
          message: 'Não foi possível remover o Produto.',
        }),
    });
    renderDetail();

    await screen.findByText(PRODUCT_A.name);
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(await screen.findByText('Não foi possível remover o Produto.')).toBeInTheDocument();
    expect(fetchState.getHealthCallCount()).toBe(1);
  });

  it('healthRevision: reordenar Produtos NÃO causa novo GET :id/health (ordem não é condição de /health)', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, draftArticle),
      productIds: [PRODUCT_A.id, PRODUCT_B.id],
      catalogItems: [PRODUCT_A, PRODUCT_B],
      reorder: () => jsonResponse(200, { productIds: [PRODUCT_B.id, PRODUCT_A.id] }),
    });
    renderDetail();

    await screen.findByText(PRODUCT_A.name);
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: `Mover ${PRODUCT_A.name} para baixo` }));

    // CORREÇÃO (pós-revisão): `ArticleProductsSection` agora vive dentro
    // do mesmo `<aside>` que `ArticleHealthChecklist`, cujo próprio
    // checklist (6 condições) também é uma `<ul>` de `<li>` —
    // `getAllByRole('listitem')` GLOBAL passou a misturar as duas listas
    // (a do checklist vem primeiro no DOM, então `[0]` deixou de ser um
    // Produto). Escopo explícito à `<section>` de `ArticleProductsSection`
    // — localizada pelo seu próprio heading, por role/nome acessível, não
    // por posição — preserva exatamente a mesma verificação de ordem de
    // antes, sem depender de índice global nem enfraquecer a asserção.
    const productsSection = screen.getByRole('heading', { name: 'Produtos vinculados' }).closest('section');
    await waitFor(() =>
      expect(within(productsSection!).getAllByRole('listitem')[0]).toHaveTextContent(PRODUCT_B.name),
    );
    expect(fetchState.getHealthCallCount()).toBe(1);
  });

  it('healthRevision: transição de status que não desmonta o checklist (PENDING_REVIEW → PUBLISHED) ainda assim causa novo GET :id/health', async () => {
    const user = userEvent.setup();
    const fetchState = mockFetch({
      article: () => jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' }),
      transition: () => jsonResponse(200, { ...draftArticle, status: 'PUBLISHED' }),
    });
    renderDetail();

    await screen.findByRole('button', { name: 'Publicar' });
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Publicar' }));

    // UXE-013 (ajuste pós-revisão): ver nota equivalente no teste "DRAFT →
    // PENDING_REVIEW" acima — o indicador externo de `ArticleContextPanel`
    // agora combina o rótulo de status com o resumo de saúde, então não há
    // mais duas ocorrências EXATAS de "Publicado". `ArticleReadOnly`
    // continua exibindo o rótulo isolado (invariante 1); o indicador
    // externo — localizado pelo trigger correspondente ("Status e ações
    // do Artigo", por papel/nome acessível) — continua perceptibilizando o
    // mesmo status dentro do seu texto composto, verificado por conteúdo,
    // nunca por contagem de strings idênticas (invariante 2).
    expect(await screen.findByText('Publicado')).toBeInTheDocument();
    const externalIndicator = screen.getByRole('button', { name: 'Status e ações do Artigo' }).parentElement;
    expect(externalIndicator).toHaveTextContent('Publicado');
    await waitFor(() => expect(fetchState.getHealthCallCount()).toBe(2));
  });

  // --- ADM-012: composição por Role × status ---

  it('VIEWER em DRAFT: composição read-only (ArticleReadOnly/ArticleProductsReadOnly), nunca ArticleForm/ArticleProductsSection', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail('VIEWER');

    expect(await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' })).toBeInTheDocument();
    // UXE-012: "Rascunho" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(screen.getAllByText('Rascunho')).toHaveLength(2);
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.queryByText('Adicionar Produto')).not.toBeInTheDocument();
    expect(await screen.findByText('Nenhum Produto vinculado.')).toBeInTheDocument();
  });

  it('VIEWER em DRAFT: ArticleTransitionPanel não mostra nenhum botão (submit-for-review exige EDITOR)', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail('VIEWER');

    await screen.findByRole('heading', { name: 'Melhor fone Bluetooth' });
    expect(screen.queryByRole('button', { name: 'Enviar para revisão' })).not.toBeInTheDocument();
    // UXE-013: o único botão presente é o trigger mobile "Status e ações
    // do Artigo" de `ArticleContextPanel` — chrome de UI, sempre montado,
    // nunca uma ação de transição — por isso é excluído explicitamente em
    // vez de esperar zero botões no total.
    expect(
      screen.queryAllByRole('button').filter((button) => button.textContent !== 'Status e ações do Artigo'),
    ).toHaveLength(0);
  });

  it('EDITOR em DRAFT: composição editável, igual ao comportamento já existente (Role suficiente)', async () => {
    mockFetch({ article: () => jsonResponse(200, draftArticle) });
    renderDetail('EDITOR');

    expect(await screen.findByLabelText('Título')).toHaveValue('Melhor fone Bluetooth');
    expect(screen.getByRole('button', { name: 'Enviar para revisão' })).toBeInTheDocument();
  });

  it('EDITOR em PENDING_REVIEW: composição read-only (status manda), mas TransitionPanel mostra as ações que EDITOR autoriza', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' }) });
    renderDetail('EDITOR');

    // UXE-012: "Em revisão" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(await screen.findAllByText('Em revisão')).toHaveLength(2);
    expect(screen.queryByLabelText('Título')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar para rascunho' })).toBeInTheDocument();
  });

  it('VIEWER em PENDING_REVIEW: composição read-only, TransitionPanel sem nenhum botão', async () => {
    mockFetch({ article: () => jsonResponse(200, { ...draftArticle, status: 'PENDING_REVIEW' }) });
    renderDetail('VIEWER');

    // UXE-012: "Em revisão" aparece no resumo de `ArticleReadOnly` e no
    // badge de `ArticleContextPanel` — ver nota acima.
    expect(await screen.findAllByText('Em revisão')).toHaveLength(2);
    // UXE-013: ver nota equivalente no teste "VIEWER em DRAFT" acima — o
    // trigger mobile de `ArticleContextPanel` é chrome de UI sempre
    // montada, não uma ação de transição.
    expect(
      screen.queryAllByRole('button').filter((button) => button.textContent !== 'Status e ações do Artigo'),
    ).toHaveLength(0);
  });
});
