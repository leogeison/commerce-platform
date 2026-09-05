'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { articleAdminSchema } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { useSyncPendingSave } from '../unsaved-changes-context';

export type ArticleBodyAutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface UseArticleBodyAutosaveOptions {
  siteSlug: string;
  /**
   * `null`/`undefined` — Artigo ainda não persistido (`/articles/new`,
   * ainda sem `article.id`). UXE-008 atua só sobre Artigo já persistido:
   * autosave usa `PATCH /admin/sites/:siteSlug/articles/:id`, que não
   * existe antes de um `id` real. Nenhuma criação implícita de rascunho
   * (`POST`) é feita por este hook — isso seria mudança de regra, fora do
   * escopo desta tarefa. Enquanto `articleId` for nulo, o hook nunca agenda
   * nem envia nenhuma requisição, `status` permanece `'idle'`, e o
   * pending-save guard nunca ativa.
   */
  articleId: string | null;
  bodyMdx: string;
  /**
   * `true` enquanto o submit manual completo (`ArticleForm.handleSubmit`)
   * estiver em voo — impede que o efeito de debounce AGENDE um novo
   * autosave nesse intervalo (a coordenação que impede CONCORRÊNCIA real
   * entre autosave e submit manual é feita à parte, via
   * `beginManualSave`/`endManualSave`/`cancelManualSave`, chamados
   * explicitamente por quem invoca este hook — ver os três abaixo).
   */
  disabled?: boolean;
  debounceMs?: number;
}

export interface UseArticleBodyAutosaveResult {
  status: ArticleBodyAutosaveStatus;
  /**
   * Chamado por `ArticleForm.handleSubmit` IMEDIATAMENTE antes de disparar
   * o submit manual completo (a chamada real a `onSubmit`, que persiste
   * `bodyMdx` junto dos demais campos). Faz duas coisas, as duas
   * síncronas ou aguardáveis de forma síncrona (sem depender de um
   * re-render do React para ter efeito, o que seria tarde demais para
   * uma decisão que precisa valer já na mesma chamada):
   *
   * 1. cancela imediatamente qualquer debounce agendado e ainda não
   *    disparado — essa edição será persistida pelo submit manual, então
   *    um autosave desse mesmo conteúdo (ou de um conteúdo mais antigo)
   *    depois seria redundante ou, pior, uma escrita antiga;
   * 2. retorna uma Promise que só resolve depois que um eventual autosave
   *    JÁ EM VOO neste exato momento terminar (sucesso ou falha) — nunca
   *    inicia um novo autosave nesse meio tempo (ver `manualSaveInProgress`
   *    abaixo). `ArticleForm` deve aguardar essa Promise antes de disparar
   *    o PATCH/POST manual, garantindo que os dois nunca fiquem em voo ao
   *    mesmo tempo e que a escrita manual — sempre com o `bodyMdx` mais
   *    recente — seja, por construção (nunca por versionamento), a última
   *    a acontecer.
   *
   * Sem `articleId` (`/articles/new`), não há nada em voo nem agendado —
   * resolve imediatamente, sem nenhum efeito.
   */
  beginManualSave: () => Promise<void>;
  /**
   * Chamado por `ArticleForm.handleSubmit` depois que o submit manual
   * completo TEVE SUCESSO, com o `bodyMdx` exatamente como foi enviado
   * (o mesmo valor usado no corpo do PATCH/POST manual). Marca esse valor
   * como confirmadamente sincronizado (equivalente ao que um autosave bem
   * sucedido faria) e limpa qualquer estado de falha/pendência anterior do
   * autosave — depois disso, o pending-save guard fica inativo e nenhum
   * autosave redundante é agendado para esse mesmo conteúdo. Também
   * libera a suspensão iniciada por `beginManualSave`.
   */
  endManualSave: (syncedBodyMdx: string) => void;
  /**
   * Chamado por `ArticleForm.handleSubmit` se o submit manual completo
   * FALHAR (upload de capa ou o próprio PATCH/POST). Só libera a
   * suspensão iniciada por `beginManualSave` — nunca mexe em
   * `status`/no valor sincronizado, porque nada foi de fato persistido.
   * O ciclo normal de debounce → autosave retoma sozinho assim que
   * `disabled` voltar a `false`, sobre o conteúdo ainda não salvo.
   */
  cancelManualSave: () => void;
}

/**
 * Debounce padrão do autosave de `bodyMdx` — agrupa edições rápidas
 * (digitação contínua) num único PATCH, disparado só depois que o usuário
 * para de editar por este intervalo. Constante única, exportada para o
 * spec deste hook poder usar o mesmo valor sem duplicar o número (mesmo
 * critério de `TOAST_AUTO_DISMISS_MS`).
 */
export const ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS = 1500;

function articlePath(siteSlug: string, id: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(id)}`;
}

/**
 * apps/admin/src/app/[siteSlug]/articles/use-article-body-autosave.ts
 *
 * UXE-008 — Autosave de `bodyMdx` (só este campo; os demais campos do
 * Artigo continuam salvos exclusivamente pelo submit manual completo,
 * `ArticleForm.handleSubmit`/`ArticleDetail.handleUpdate`).
 *
 * `PATCH { bodyMdx }` — parcial, sem tocar nenhum outro campo do Artigo.
 * `updateArticleRequestSchema` já é integralmente opcional por campo
 * (nenhuma mudança de contrato foi necessária ou feita para esta tarefa).
 *
 * --- Guard de pending-save: o que conta como "pendente" ---
 *
 * `lastSyncedRef` é o último valor CONFIRMADAMENTE persistido (por
 * autosave OU por submit manual — ver `endManualSave`). A condição
 * publicada via `useSyncPendingSave` é simplesmente:
 *
 *   articleId != null && bodyMdx !== lastSyncedRef.current
 *
 * Ou seja: existe uma edição ainda não comprovadamente persistida. Essa
 * condição já cobre, sem precisar de nenhum termo extra:
 * - a janela de debounce (o usuário editou, `bodyMdx` mudou, mas o PATCH
 *   ainda nem foi agendado disparar) — CORRIGIDO nesta revisão: antes,
 *   o guard só ativava quando `status` virava `'saving'`/`'error'`,
 *   deixando a janela de debounce completamente desprotegida (uma
 *   navegação nesse intervalo podia desmontar a tela antes do PATCH sair,
 *   perdendo a edição). Agora o guard ativa na primeira edição real que
 *   ficaria pendente de salvar, não apenas quando a requisição já saiu;
 * - o PATCH em voo (`status === 'saving'`), porque `lastSyncedRef` só
 *   avança em caso de sucesso;
 * - uma falha não resolvida (`status === 'error'`), pelo mesmo motivo:
 *   sem sucesso, `lastSyncedRef` nunca avançou;
 * - volta a `false` exatamente quando o conteúdo mais recente é
 *   comprovadamente persistido — por autosave (dentro de `runSave`) ou
 *   por submit manual (`endManualSave`), nunca antes disso.
 *
 * Isso NÃO significa mostrar diálogo a cada tecla: o diálogo do guard só
 * aparece quando uma navegação é de fato tentada (`confirmLeave()`) — o
 * publisher só afeta se ELA existiria, não dispara nada sozinho.
 *
 * --- Concorrência entre autosaves ---
 *
 * Nunca dois PATCHs de autosave simultâneos. `inFlightPromiseRef` é o
 * único portão: não-nulo enquanto uma requisição de autosave está em
 * voo; `runSave` recusa iniciar uma nova enquanto isso. Uma edição que
 * chega durante esse tempo não é perdida: fica só registrada em
 * `latestBodyRef` (sempre o valor mais recente de `bodyMdx`). Quando o
 * PATCH em voo termina (sucesso OU falha), se `latestBodyRef.current`
 * ainda for diferente do valor que acabou de ser enviado, um novo
 * salvamento começa IMEDIATAMENTE (sem esperar debounce de novo) — EXCETO
 * se um submit manual estiver em andamento (`manualSaveInProgressRef`,
 * ver abaixo), caso em que a cadeia de autosave fica suspensa até ele
 * terminar. Isso nunca caracteriza "retry automático": uma falha SEM
 * nenhuma edição nova permanece em `'error'` indefinidamente.
 *
 * --- Coordenação com o submit manual completo ---
 *
 * `manualSaveInProgressRef` é um ref simples (nunca estado do React,
 * de propósito: precisa valer imediatamente, de forma síncrona, no
 * exato momento em que `beginManualSave` é chamado — esperar um
 * re-render para "desligar" o autosave seria tarde demais). Enquanto
 * `true`, `runSave` nunca inicia uma nova tentativa (nem a partir do
 * debounce, nem encadeada após um autosave anterior terminar).
 * `beginManualSave` também cancela sincronamente qualquer debounce já
 * agendado e retorna uma Promise que só resolve depois que um autosave
 * já em voo (se houver) terminar — POR SETTLEMENT, nunca só por sucesso
 * (CORRIGIDO nesta revisão: uma falha desse autosave anterior NÃO pode
 * impedir o submit manual, que é justamente o caminho pelo qual o
 * usuário tenta se recuperar dessa falha ao clicar em Salvar; por isso
 * `beginManualSave` absorve explicitamente uma eventual rejeição do
 * autosave em voo antes de resolver) — o efeito prático é que o submit
 * manual NUNCA corre em paralelo com um PATCH de autosave: ou não havia
 * nenhum, ou `ArticleForm` espera o único que havia terminar (com
 * sucesso ou falha) antes de disparar o seu. Como o submit manual
 * sempre carrega o `bodyMdx` mais recente (o próprio estado do
 * formulário) e só é enviado depois de qualquer autosave anterior já
 * ter se resolvido, ele é, por construção, a última escrita — sem
 * precisar de `AbortController`, versionamento ou qualquer mudança de
 * contrato/backend.
 *
 * `endManualSave(bodyMdx)` (sucesso do submit manual) marca esse valor
 * como sincronizado — equivalente ao que um autosave bem-sucedido
 * faria — e limpa qualquer `status` de falha/pendência anterior, então
 * o guard já reflete "nada pendente" e nenhum autosave redundante é
 * agendado para esse mesmo conteúdo. `cancelManualSave()` (falha do
 * submit manual) só libera a suspensão, sem tocar em `lastSyncedRef`:
 * o conteúdo continua não confirmadamente salvo, e o ciclo normal de
 * autosave retoma sozinho assim que `disabled` voltar a `false`.
 *
 * Sem `AbortController`, sem versionamento, sem mudança de API pública
 * do backend/contracts: a coordenação inteira é local, por sequenciamento
 * (nunca duas requisições ao mesmo recurso em voo ao mesmo tempo), não
 * por cancelamento nem por comparação de versões.
 */
export function useArticleBodyAutosave({
  siteSlug,
  articleId,
  bodyMdx,
  disabled = false,
  debounceMs = ARTICLE_BODY_AUTOSAVE_DEBOUNCE_MS,
}: UseArticleBodyAutosaveOptions): UseArticleBodyAutosaveResult {
  const [status, setStatus] = useState<ArticleBodyAutosaveStatus>('idle');
  const lastSyncedRef = useRef(bodyMdx);
  const latestBodyRef = useRef(bodyMdx);
  const inFlightPromiseRef = useRef<Promise<void> | null>(null);
  const manualSaveInProgressRef = useRef(false);
  const unmountedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPendingSave = articleId !== null && bodyMdx !== lastSyncedRef.current;
  useSyncPendingSave(isPendingSave);

  latestBodyRef.current = bodyMdx;

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const runSave = useCallback(
    (id: string) => {
      if (inFlightPromiseRef.current || manualSaveInProgressRef.current) {
        return;
      }

      const valueToSave = latestBodyRef.current;
      setStatus('saving');

      const promise = apiRequest(articlePath(siteSlug, id), articleAdminSchema, {
        method: 'PATCH',
        body: { bodyMdx: valueToSave },
      })
        .then(() => {
          lastSyncedRef.current = valueToSave;
          inFlightPromiseRef.current = null;
          if (unmountedRef.current) {
            return;
          }
          setStatus('saved');
          if (!manualSaveInProgressRef.current && latestBodyRef.current !== valueToSave) {
            runSave(id);
          }
        })
        .catch(() => {
          inFlightPromiseRef.current = null;
          if (unmountedRef.current) {
            return;
          }
          setStatus('error');
          if (!manualSaveInProgressRef.current && latestBodyRef.current !== valueToSave) {
            runSave(id);
          }
        });

      inFlightPromiseRef.current = promise;
    },
    [siteSlug],
  );

  useEffect(() => {
    if (!articleId || disabled) {
      return;
    }
    if (bodyMdx === lastSyncedRef.current) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      runSave(articleId);
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [bodyMdx, articleId, disabled, debounceMs, runSave]);

  const beginManualSave = useCallback((): Promise<void> => {
    manualSaveInProgressRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const inFlight = inFlightPromiseRef.current;
    if (!inFlight) {
      return Promise.resolve();
    }
    // Espera por SETTLEMENT (sucesso ou falha), nunca só por sucesso: se
    // o autosave em voo rejeitar, essa rejeição não pode propagar para
    // quem chamou `beginManualSave` — senão o submit manual (o caminho
    // pelo qual o usuário tenta se recuperar dessa própria falha, ao
    // clicar em Salvar) poderia nunca chegar a ser executado. `runSave`
    // já trata sua própria falha internamente e não rejeita este
    // Promise, mas este `.catch` torna essa garantia explícita, em vez
    // de depender desse detalhe de implementação de `runSave`.
    return inFlight.catch(() => undefined);
  }, []);

  const endManualSave = useCallback((syncedBodyMdx: string): void => {
    manualSaveInProgressRef.current = false;
    lastSyncedRef.current = syncedBodyMdx;
    if (!unmountedRef.current) {
      setStatus('saved');
    }
  }, []);

  const cancelManualSave = useCallback((): void => {
    manualSaveInProgressRef.current = false;
  }, []);

  return { status, beginManualSave, endManualSave, cancelManualSave };
}
