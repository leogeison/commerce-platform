import { useEffect } from 'react';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnsavedChangesProvider, useUnsavedChangesGuard } from '../unsaved-changes-context';
import {
  ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
  useArticleBodyAutosave,
  type UseArticleBodyAutosaveOptions,
  type UseArticleBodyAutosaveResult,
} from './use-article-body-autosave';

const ARTICLE_ID = 'dddddddd-4444-4444-8444-444444444444';

/**
 * Harness mínimo — expõe `status` (`data-testid="status"`) e, via
 * `onReady` (chamado a cada render, sempre com o objeto mais atual),
 * `beginManualSave`/`endManualSave`/`cancelManualSave` para os testes de
 * coordenação com o submit manual. `debounceMs` é sempre passado
 * explicitamente pelos testes — curto (dezenas de ms) na maioria, para
 * não depender de fake timers combinados com Promises reais do `fetch`
 * mockado (mesmo critério documentado em `toast-context.spec.tsx`: não
 * misturar fake timers com polling/async real) — exceto nos testes que
 * verificam especificamente o comportamento dentro da janela de debounce
 * real, que usam `ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS` só para provar que a
 * asserção não depende de esperar tempo nenhum.
 */
function AutosaveHarness(
  props: UseArticleBodyAutosaveOptions & { onReady?: (api: UseArticleBodyAutosaveResult) => void },
) {
  const { onReady, ...hookProps } = props;
  const api = useArticleBodyAutosave(hookProps);
  useEffect(() => {
    onReady?.(api);
  });
  return <p data-testid="status">{api.status}</p>;
}

function ConfirmButton() {
  const { confirmLeave } = useUnsavedChangesGuard();
  return (
    <button
      type="button"
      onClick={() => {
        void confirmLeave();
      }}
    >
      Tentar sair
    </button>
  );
}

function tree(props: UseArticleBodyAutosaveOptions & { onReady?: (api: UseArticleBodyAutosaveResult) => void }) {
  return (
    <UnsavedChangesProvider>
      <AutosaveHarness {...props} />
      <ConfirmButton />
    </UnsavedChangesProvider>
  );
}

function renderHarness(
  props: UseArticleBodyAutosaveOptions & { onReady?: (api: UseArticleBodyAutosaveResult) => void },
) {
  return render(tree(props));
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

function articleAdminBody(bodyMdx: string) {
  return {
    id: ARTICLE_ID,
    siteId: '99999999-9999-4999-8999-999999999999',
    categoryId: null,
    authorId: null,
    type: 'REVIEW',
    status: 'DRAFT',
    title: 'Artigo existente',
    slug: 'artigo-existente',
    metaDescription: null,
    coverImageUrl: null,
    bodyMdx,
    publishedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * Cada chamada é registrada em `calls` (só o `bodyMdx` enviado, extraído do
 * corpo real do `PATCH`) e resolve com sucesso (200) por padrão — mesmo
 * critério de `mockFetch` em `article-form.spec.tsx`, simplificado ao que
 * este arquivo precisa (só o endpoint de `PATCH` do Artigo, nunca
 * Categorias/Autores/upload, que este hook nunca chama).
 */
function mockSuccessFetch(calls: string[]) {
  global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
    const parsed: { bodyMdx?: string } = init?.body ? JSON.parse(String(init.body)) : {};
    const bodyMdx = parsed.bodyMdx ?? '';
    calls.push(bodyMdx);
    return jsonResponse(200, articleAdminBody(bodyMdx));
  });
}

describe('useArticleBodyAutosave', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sem articleId (/articles/new): nunca agenda nem envia PATCH, status permanece idle, guard nunca bloqueia', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    const user = userEvent.setup();
    const { rerender } = renderHarness({ siteSlug: 'fastcompre', articleId: null, bodyMdx: 'A', debounceMs: 10 });

    rerender(tree({ siteSlug: 'fastcompre', articleId: null, bodyMdx: 'B', debounceMs: 10 }));

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(calls).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('CORRIGIDO: a primeira edição real que fica pendente de salvar já bloqueia a saída, mesmo ainda dentro da janela de debounce (não é preciso o PATCH ter saído)', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    const user = userEvent.setup();
    const { rerender } = renderHarness({
      siteSlug: 'fastcompre',
      articleId: ARTICLE_ID,
      bodyMdx: 'A',
      debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
    });

    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'Edição em andamento',
        debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
      }),
    );

    // Ainda dentro da janela de debounce (nenhum PATCH saiu) — mas já há
    // uma edição não comprovadamente persistida: o guard já bloqueia.
    // Isso NÃO significa mostrar diálogo sozinho — só que a TENTATIVA de
    // sair, feita agora, encontra o diálogo.
    expect(calls).toHaveLength(0);
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('debounce agrupa edições rápidas num único PATCH, com o valor mais recente', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    const { rerender } = renderHarness({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'A', debounceMs: 40 });

    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'AB', debounceMs: 40 }));
    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'ABC', debounceMs: 40 }));

    await waitFor(() => expect(calls).toHaveLength(1), { timeout: 2000 });
    expect(calls[0]).toBe('ABC');
  });

  it('salvando → salvo: status reflete o PATCH em voo e depois o sucesso; guard bloqueia durante saving e libera depois', async () => {
    const calls: string[] = [];
    // CORRIGIDO: `mockSuccessFetch` resolve o PATCH quase instantaneamente
    // (a própria `Response.text()` já é `Promise.resolve(...)`), o que faz
    // 'saving' durar só um punhado de microtasks — curto demais para o
    // `waitFor` (que faz polling com timers reais) conseguir observá-lo de
    // forma determinística; o React pode colapsar 'saving' e 'saved' no
    // mesmo flush, indo direto de 'idle' para 'saved'. Este teste controla
    // explicitamente a Promise do PATCH, mantendo-o em voo até o estado
    // 'saving' ser observado — mesmo critério já usado em "nunca dois
    // PATCHs simultâneos" e "beginManualSave aguarda um autosave em voo".
    let resolvePatch!: (value: Response) => void;
    const patchResponse = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      const parsed: { bodyMdx?: string } = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push(parsed.bodyMdx ?? '');
      return patchResponse;
    });
    const user = userEvent.setup();
    // Invariante: o bodyMdx da primeira montagem já conta como
    // sincronizado (lastSyncedRef nasce com ele) — só uma mudança
    // POSTERIOR é uma edição real que agenda debounce/autosave.
    const { rerender } = renderHarness({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: '', debounceMs: 10 });
    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'Texto', debounceMs: 10 }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saving'), { timeout: 2000 });
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    // Libera o PATCH em voo. Envolvido em `act(...)` porque a resolução
    // desta Promise dispara, de forma assíncrona (fora de qualquer
    // interação do `user-event`), o `setStatus('saved')` do `.then()` de
    // `runSave` (use-article-body-autosave.ts) — sem isso, essa atualização
    // pode acontecer antes do próximo `waitFor` montar seu próprio ciclo de
    // polling, gerando o aviso "not wrapped in act(...)".
    await act(async () => {
      resolvePatch(jsonResponse(200, articleAdminBody('Texto')));
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saved'), { timeout: 2000 });
    expect(calls).toEqual(['Texto']);

    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('salvando → falhou: status reflete a falha; guard permanece bloqueando (sem retry automático, sem nova edição)', async () => {
    global.fetch = jest.fn<typeof fetch>(async () => jsonResponse(500, { message: 'erro simulado' }));
    const user = userEvent.setup();
    // Mesma invariante: edição real via rerender, não no mount.
    const { rerender } = renderHarness({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: '', debounceMs: 10 });
    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'Texto', debounceMs: 10 }));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'), { timeout: 2000 });

    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    // Nenhum retry automático: sem nova edição, uma segunda checagem depois
    // de um tempo não vê nenhuma nova chamada nem mudança de status.
    const callsAfterFailure = (global.fetch as jest.Mock).mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsAfterFailure);
    expect(screen.getByTestId('status')).toHaveTextContent('error');
  });

  it('nunca dois PATCHs simultâneos: edição durante request em voo gera um novo save com o valor mais recente assim que o atual termina', async () => {
    const calls: string[] = [];
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    let callCount = 0;
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      const parsed: { bodyMdx?: string } = init?.body ? JSON.parse(String(init.body)) : {};
      const bodyMdx = parsed.bodyMdx ?? '';
      calls.push(bodyMdx);
      callCount += 1;
      if (callCount === 1) {
        return firstResponse;
      }
      return jsonResponse(200, articleAdminBody(bodyMdx));
    });

    // Mount com valor já sincronizado — a edição real ('A') chega por
    // rerender, não no mount.
    const { rerender } = renderHarness({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: '', debounceMs: 10 });
    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'A', debounceMs: 10 }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toBe('A');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saving'));

    // Edição chega com o primeiro PATCH ainda em voo.
    rerender(tree({ siteSlug: 'fastcompre', articleId: ARTICLE_ID, bodyMdx: 'B', debounceMs: 10 }));

    // Mesmo passando bem do tempo de debounce, nenhum segundo PATCH começa
    // enquanto o primeiro está em voo — o portão é a requisição em voo, não
    // o debounce (que já nem está mais contando: `bodyMdx` já mudou, mas o
    // gate de concorrência é quem decide aqui).
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(calls).toHaveLength(1);

    // Termina o primeiro PATCH — o valor mais recente ('B') é salvo
    // imediatamente em seguida, sem esperar um novo debounce.
    resolveFirst(jsonResponse(200, articleAdminBody('A')));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]).toBe('B');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saved'));
  });

  // --- Coordenação autosave × submit manual ---

  it('beginManualSave cancela um debounce ainda não disparado: nenhum autosave antigo é enviado depois', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    let api: UseArticleBodyAutosaveResult | undefined;
    const { rerender } = renderHarness({
      siteSlug: 'fastcompre',
      articleId: ARTICLE_ID,
      bodyMdx: '',
      debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
      onReady: (readyApi) => {
        api = readyApi;
      },
    });

    // Edição real via rerender — só ela agenda o debounce; sem isso, o
    // teste "cancela um debounce" não estaria testando nada (não haveria
    // debounce nenhum agendado no mount).
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'Edição não salva',
        debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );

    // Ainda dentro do debounce real (1500ms) — chama beginManualSave logo
    // em seguida, como `ArticleForm.handleSubmit` faria ao clicar Salvar.
    await api!.beginManualSave();

    // Espera bem além do debounce original: se o timer não tivesse sido
    // cancelado, um PATCH teria sido enviado nesse meio tempo.
    await new Promise((resolve) => setTimeout(resolve, ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS + 200));

    expect(calls).toHaveLength(0);
  });

  it('beginManualSave aguarda um autosave já em voo terminar antes de resolver, sem iniciar um novo nesse meio tempo', async () => {
    const calls: string[] = [];
    let resolveInFlight!: (value: Response) => void;
    const inFlight = new Promise<Response>((resolve) => {
      resolveInFlight = resolve;
    });
    global.fetch = jest.fn<typeof fetch>(async (_input, init) => {
      const parsed: { bodyMdx?: string } = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push(parsed.bodyMdx ?? '');
      return inFlight;
    });

    let api: UseArticleBodyAutosaveResult | undefined;
    const { rerender } = renderHarness({
      siteSlug: 'fastcompre',
      articleId: ARTICLE_ID,
      bodyMdx: '',
      debounceMs: 10,
      onReady: (readyApi) => {
        api = readyApi;
      },
    });

    // Edição real via rerender — só ela agenda o debounce/autosave.
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'A',
        debounceMs: 10,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saving'));

    // Uma edição chega antes do clique em Salvar — em produção o corpo
    // continua editável até `isSubmitting` virar `true`.
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'AB',
        debounceMs: 10,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );

    let resolved = false;
    const pending = api!.beginManualSave().then(() => {
      resolved = true;
    });

    // Ainda em voo: beginManualSave não resolveu, e nenhum segundo PATCH
    // foi enviado (nem para 'A' de novo, nem para 'AB').
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(resolved).toBe(false);
    expect(calls).toHaveLength(1);

    // Envolvido em `act(...)` pelo mesmo motivo do teste "salvando → salvo":
    // esta resolução dispara, de forma assíncrona e fora de qualquer
    // interação do `user-event`, o `setStatus('saved')` do `.then()` de
    // `runSave` (use-article-body-autosave.ts:240).
    await act(async () => {
      resolveInFlight(jsonResponse(200, articleAdminBody('A')));
    });
    await pending;

    expect(resolved).toBe(true);
    // A cadeia de autosave para 'AB' foi suspensa por `manualSaveInProgress`
    // (ativado por `beginManualSave`) — nenhum segundo PATCH foi disparado.
    expect(calls).toHaveLength(1);
  });

  it('endManualSave sincroniza o bodyMdx enviado pelo submit manual: guard libera e nenhum autosave redundante é agendado depois', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    const user = userEvent.setup();
    let api: UseArticleBodyAutosaveResult | undefined;
    const { rerender } = renderHarness({
      siteSlug: 'fastcompre',
      articleId: ARTICLE_ID,
      bodyMdx: '',
      debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
      onReady: (readyApi) => {
        api = readyApi;
      },
    });

    // Edição real (rerender), não o valor do mount — só assim o guard
    // fica de fato ativo antes de `endManualSave` liberá-lo; sem isso o
    // teste provaria "guard libera" sobre um guard que nunca esteve
    // ativo.
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'Conteúdo final',
        debounceMs: ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    await api!.beginManualSave();
    // Simula o PATCH/POST manual (feito por `onSubmit`, fora deste hook)
    // tendo persistido exatamente este valor. Envolvido em `act(...)`
    // porque `endManualSave` chama `setStatus('saved')` de forma síncrona
    // (use-article-body-autosave.ts), fora de qualquer interação do
    // `user-event` — sem isso, o aviso "not wrapped in act(...)" aparece.
    act(() => {
      api!.endManualSave('Conteúdo final');
    });

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saved'));
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Espera além do debounce original: nenhum autosave é agendado para
    // um conteúdo já marcado como sincronizado.
    await new Promise((resolve) => setTimeout(resolve, ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS + 200));
    expect(calls).toHaveLength(0);
  });

  it('cancelManualSave não marca nada como sincronizado: o ciclo normal de autosave retoma sozinho depois, e o guard continua bloqueando', async () => {
    const calls: string[] = [];
    mockSuccessFetch(calls);
    const user = userEvent.setup();
    let api: UseArticleBodyAutosaveResult | undefined;
    const { rerender } = renderHarness({
      siteSlug: 'fastcompre',
      articleId: ARTICLE_ID,
      bodyMdx: '',
      disabled: true,
      debounceMs: 10,
      onReady: (readyApi) => {
        api = readyApi;
      },
    });

    // Edição real via rerender (mesmo com `disabled: true`): o guard
    // (`isPendingSave`) não depende de `disabled` — só o AGENDAMENTO do
    // debounce depende. Sem essa edição, o guard nunca ativaria e o
    // teste não provaria nada sobre `cancelManualSave` mantê-lo ativo.
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'Não persistido',
        disabled: true,
        debounceMs: 10,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );

    await api!.beginManualSave();
    // Submit manual falhou (ex.: upload de capa ou o PATCH em si) — só
    // libera a suspensão, sem marcar nada como sincronizado.
    api!.cancelManualSave();

    // Guard continua bloqueando: nada foi persistido.
    await user.click(screen.getByRole('button', { name: 'Tentar sair' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ficar' }));

    // `disabled` volta a `false` (fim do `isSubmitting`) — o ciclo normal
    // de debounce retoma para o conteúdo ainda não salvo.
    rerender(
      tree({
        siteSlug: 'fastcompre',
        articleId: ARTICLE_ID,
        bodyMdx: 'Não persistido',
        disabled: false,
        debounceMs: 10,
        onReady: (readyApi) => {
          api = readyApi;
        },
      }),
    );

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toBe('Não persistido');
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('saved'));
  });
});
