'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { CircleAlert, Loader2 } from 'lucide-react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $createParagraphNode, $getNodeByKey, $isElementNode, $setSelection, type NodeKey, type RangeSelection } from 'lexical';
import { uploadImageResponseSchema } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { $createImageNode } from './article-body-image/node';
import styles from './article-form.module.css';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-body-image-flow.tsx
 *
 * UXE-010 — Upload/inserção de imagem com decisão explícita de
 * acessibilidade.
 *
 * Fluxo único, compartilhado por `ArticleBodyToolbar` e
 * `ArticleBodySlashMenu` — nenhuma das duas duplica upload/diálogo/
 * inserção; ambas só chamam `requestImage(anchor)` (exposto via `ref`)
 * depois de fazerem, cada uma, seu próprio preparo síncrono (ver doc
 * comment de `ImageInsertionAnchor` abaixo).
 *
 * Ordem aprovada (diferente de "upload primeiro"): selecionar arquivo →
 * abrir diálogo → decisão Informativa/Decorativa → confirmar → só então
 * upload → só em sucesso insere o `ImageNode`. Cancelar antes de
 * confirmar nunca dispara upload — nenhum arquivo órfão nesse caminho.
 *
 * `isImageFlowActive` (prop `onActiveChange`) é ligado no instante de
 * `requestImage` e desligado em TODOS os caminhos de saída: cancelamento
 * do picker, cancelamento do diálogo, falha de upload, falha defensiva de
 * inserção (âncora não existe mais) e sucesso — nunca deixado pendente.
 * `editor.setEditable(false/true)` é chamado diretamente aqui (não só via
 * o `disabled` reativo de `EditableSyncPlugin`) para que o
 * `contentEditable` real fique bloqueado/desbloqueado de forma síncrona e
 * determinística nos mesmos instantes — `onActiveChange` continua
 * necessário à parte porque `ArticleBodyToolbar`/`ArticleBodySlashMenu`
 * (fora deste componente) também precisam desabilitar seus próprios
 * controles durante o fluxo.
 *
 * Falha de upload observada pelo cliente pode ter resultado ambíguo no
 * storage (o servidor pode já ter persistido o arquivo antes de a
 * resposta se perder) — nenhuma limpeza/idempotência é implementada nesta
 * tarefa; a falha só impede a inserção no documento.
 */

export interface ImageInsertionAnchor {
  /**
   * `insert-after` — gatilho pela toolbar: nada foi removido do
   * documento, `blockKey` é o bloco onde a seleção estava; em sucesso, a
   * imagem é inserida como novo bloco logo depois dele.
   * `restoreSelection` é obrigatório neste modo — restaurado em
   * cancelamento, exatamente como o fluxo de Link já faz.
   *
   * `replace-empty` — gatilho pelo menu `/`: `/query` já foi removido do
   * bloco (`blockElement.clear()`) antes de `requestImage` ser chamado;
   * `blockKey` é esse bloco já vazio. Em sucesso, a imagem substitui
   * exatamente esse bloco. Em cancelamento, o caret volta para dentro
   * dele (nunca tenta restaurar a seleção anterior que apontava para o
   * texto `/query`, que não existe mais).
   */
  mode: 'insert-after' | 'replace-empty';
  blockKey: NodeKey;
  restoreSelection?: RangeSelection;
}

export interface ArticleBodyImageFlowHandle {
  requestImage: (anchor: ImageInsertionAnchor) => void;
}

interface ArticleBodyImageFlowProps {
  siteSlug: string;
  onActiveChange: (active: boolean) => void;
}

type AltMode = 'informative' | 'decorative';

type FlowState =
  | { status: 'idle' }
  | { status: 'picking'; anchor: ImageInsertionAnchor }
  | {
      status: 'deciding';
      anchor: ImageInsertionAnchor;
      file: File;
      altMode: AltMode;
      altText: string;
      validationError: string | null;
    }
  | { status: 'uploading'; anchor: ImageInsertionAnchor; file: File; altMode: AltMode; altText: string }
  | {
      status: 'error';
      anchor: ImageInsertionAnchor;
      file: File;
      altMode: AltMode;
      altText: string;
      message: string;
      canRetry: boolean;
    };

const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem. Tente novamente em instantes.';
const ANCHOR_MISSING_MESSAGE =
  'A imagem foi enviada, mas não foi possível inseri-la: o editor foi alterado durante o envio.';
const VALIDATION_ERROR_MESSAGE = 'Informe um texto alternativo para uma imagem informativa.';

/**
 * Mesmos status HTTP de negócio já convencionados desde `ArticleForm`/
 * `ProductForm`/`AuthorForm` para este mesmo endpoint de upload — cada
 * formulário já mantém sua própria cópia local deste critério (nenhuma
 * abstração compartilhada existe hoje para isso), este fluxo segue o
 * mesmo padrão.
 */
const UPLOAD_BUSINESS_ERROR_STATUS_CODES = new Set([400, 403, 404, 409, 422]);

function resolveErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError && error.statusCode !== undefined && UPLOAD_BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)) {
    return error.message;
  }
  return GENERIC_UPLOAD_ERROR_MESSAGE;
}

export const ArticleBodyImageFlow = forwardRef<ArticleBodyImageFlowHandle, ArticleBodyImageFlowProps>(
  function ArticleBodyImageFlow({ siteSlug, onActiveChange }, ref) {
    const [editor] = useLexicalComposerContext();
    const [state, setState] = useState<FlowState>({ status: 'idle' });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const firstFieldRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => ({
      requestImage(anchor: ImageInsertionAnchor) {
        editor.setEditable(false);
        onActiveChange(true);
        setState({ status: 'picking', anchor });
        fileInputRef.current?.click();
      },
    }));

    // Navegadores recentes disparam `cancel` no `<input type="file">`
    // quando o usuário fecha o seletor nativo sem escolher arquivo — sem
    // isso, cancelar o picker nativo deixaria `isImageFlowActive`
    // pendente. Ambiente/navegador sem suporte a este evento é uma
    // limitação real documentada no relatório da tarefa (não verificável
    // neste ambiente de execução).
    useEffect(() => {
      const input = fileInputRef.current;
      if (!input) {
        return;
      }
      function handleNativeCancel() {
        if (state.status === 'picking') {
          handleCancel();
        }
      }
      input.addEventListener('cancel', handleNativeCancel);
      return () => input.removeEventListener('cancel', handleNativeCancel);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state]);

    useEffect(() => {
      if (state.status === 'deciding') {
        firstFieldRef.current?.focus();
      }
    }, [state.status]);

    function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
      const file = event.target.files?.[0] ?? null;
      event.target.value = '';
      if (!file || state.status !== 'picking') {
        return;
      }
      setState({ status: 'deciding', anchor: state.anchor, file, altMode: 'informative', altText: '', validationError: null });
    }

    /**
     * Único caminho de cancelamento com restauração de seleção/caret —
     * usado a partir de `picking` (picker nativo cancelado), `deciding`
     * (diálogo cancelado) e `error` com `canRetry: true` (falha comum,
     * âncora ainda válida). Nunca chamado para a falha defensiva de
     * âncora ausente (`handleDismissError`, abaixo) — ali não há nada
     * para restaurar.
     */
    function handleCancel() {
      if (state.status === 'idle' || state.status === 'uploading') {
        return;
      }
      const { anchor } = state;
      editor.setEditable(true);
      editor.update(() => {
        if (anchor.mode === 'insert-after' && anchor.restoreSelection) {
          $setSelection(anchor.restoreSelection.clone());
          return;
        }
        const block = $getNodeByKey(anchor.blockKey);
        if (block && $isElementNode(block)) {
          block.selectStart();
        }
      });
      editor.getRootElement()?.focus();
      onActiveChange(false);
      setState({ status: 'idle' });
    }

    function handleDismissError() {
      editor.getRootElement()?.focus();
      setState({ status: 'idle' });
    }

    function handleAltModeChange(altMode: AltMode) {
      if (state.status !== 'deciding') {
        return;
      }
      setState({ ...state, altMode, validationError: null });
    }

    function handleAltTextChange(altText: string) {
      if (state.status !== 'deciding') {
        return;
      }
      setState({ ...state, altText, validationError: null });
    }

    function handleConfirm() {
      if (state.status !== 'deciding') {
        return;
      }
      if (state.altMode === 'informative' && state.altText.trim() === '') {
        setState({ ...state, validationError: VALIDATION_ERROR_MESSAGE });
        return;
      }
      const { anchor, file, altMode, altText } = state;
      setState({ status: 'uploading', anchor, file, altMode, altText });
      void upload(anchor, file, altMode, altText);
    }

    function handleRetry() {
      if (state.status !== 'error' || !state.canRetry) {
        return;
      }
      const { anchor, file, altMode, altText } = state;
      editor.setEditable(false);
      onActiveChange(true);
      setState({ status: 'uploading', anchor, file, altMode, altText });
      void upload(anchor, file, altMode, altText);
    }

    async function upload(anchor: ImageInsertionAnchor, file: File, altMode: AltMode, altText: string) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('purpose', 'ARTICLE_BODY_IMAGE');

        const { url } = await apiRequest(
          `/admin/sites/${encodeURIComponent(siteSlug)}/uploads/images`,
          uploadImageResponseSchema,
          { method: 'POST', body: formData },
        );

        const alt = altMode === 'decorative' ? '' : altText.trim();
        let inserted = false;

        editor.update(() => {
          const block = $getNodeByKey(anchor.blockKey);
          if (!block || !$isElementNode(block)) {
            return;
          }
          const imageNode = $createImageNode(url, alt);
          if (anchor.mode === 'replace-empty') {
            block.replace(imageNode);
          } else {
            block.insertAfter(imageNode);
          }

          // Bug real (validação manual): quando a imagem vira o ÚLTIMO
          // bloco de nível superior do documento, `imageNode.selectNext()`
          // (Lexical core) cai no próprio fallback documentado para "sem
          // próximo irmão" — `parent.select()` — e `parent` aqui é o
          // `RootNode`. Isso produz uma `RangeSelection` "válida" (não
          // lança), mas que não corresponde a nenhum caret de texto real
          // dentro de um bloco editável — daí não dar para continuar
          // digitando depois da imagem nesse caso específico. Quando já
          // existe um bloco depois da imagem (caso comum, já funcionava),
          // `getNextSibling()` não é `null` e `selectNext()` funciona como
          // sempre funcionou (inalterado). Só o caso "sem próximo irmão"
          // ganha um parágrafo vazio mínimo, criado e selecionado
          // explicitamente — nunca quando já existe destino editável.
          if (imageNode.getNextSibling() !== null) {
            imageNode.selectNext();
          } else {
            const trailingParagraph = $createParagraphNode();
            imageNode.insertAfter(trailingParagraph);
            trailingParagraph.select();
          }
          inserted = true;
        });

        editor.setEditable(true);
        onActiveChange(false);

        if (!inserted) {
          setState({ status: 'error', anchor, file, altMode, altText, message: ANCHOR_MISSING_MESSAGE, canRetry: false });
          return;
        }

        editor.getRootElement()?.focus();
        setState({ status: 'idle' });
      } catch (error) {
        editor.setEditable(true);
        onActiveChange(false);
        setState({ status: 'error', anchor, file, altMode, altText, message: resolveErrorMessage(error), canRetry: true });
      }
    }

    function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
      if (event.key === 'Escape') {
        if (state.status === 'deciding' || state.status === 'picking') {
          event.preventDefault();
          handleCancel();
        } else if (state.status === 'error' && state.canRetry) {
          event.preventDefault();
          handleCancel();
        }
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return;
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'),
      );
      if (focusable.length === 0) {
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    const showDialog = state.status === 'deciding' || state.status === 'uploading' || state.status === 'error';
    // `validationError` só existe na variante `'deciding'` de `FlowState`
    // (por construção: o próprio `handleConfirm` só transiciona para
    // `'uploading'` depois de validar com sucesso — nunca há erro de
    // validação pendente durante o upload). Narrowing local explícito
    // (não um campo adicionado à variante `'uploading'` só para agradar o
    // TypeScript) — o JSX abaixo cobre `'deciding' | 'uploading'` junto
    // (mesmo campo/fieldset, só `disabled` muda), então `state` ali é a
    // união das duas variantes, e `validationError` não pertence a
    // `'uploading'`. Fora dessa união, o valor é sempre `null`, o que já
    // reflete a semântica real (nenhum erro de validação existe fora de
    // `'deciding'`).
    const validationError = state.status === 'deciding' ? state.validationError : null;

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="Selecionar arquivo de imagem"
          className={styles.srOnly}
          tabIndex={-1}
          onChange={handleFileSelected}
        />

        {showDialog && (
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="article-body-image-dialog-heading"
            className={styles.imageDialog}
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="article-body-image-dialog-heading" className={styles.imageDialogHeading}>
              Inserir imagem
            </h2>

            {(state.status === 'deciding' || state.status === 'uploading') && (
              <>
                <fieldset className={styles.imageDialogField} disabled={state.status === 'uploading'}>
                  <legend>Como esta imagem deve ser tratada por leitores de tela?</legend>
                  <label>
                    <input
                      ref={firstFieldRef}
                      type="radio"
                      name="article-body-image-alt-mode"
                      checked={state.altMode === 'informative'}
                      onChange={() => handleAltModeChange('informative')}
                    />
                    Informativa (com texto alternativo)
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="article-body-image-alt-mode"
                      checked={state.altMode === 'decorative'}
                      onChange={() => handleAltModeChange('decorative')}
                    />
                    Decorativa (sem texto alternativo)
                  </label>
                </fieldset>

                <div className={styles.imageDialogField}>
                  <label htmlFor="article-body-image-alt-text">Texto alternativo</label>
                  <input
                    id="article-body-image-alt-text"
                    type="text"
                    value={state.altText}
                    disabled={state.altMode !== 'informative' || state.status === 'uploading'}
                    required={state.altMode === 'informative'}
                    aria-required={state.altMode === 'informative'}
                    aria-describedby={validationError ? 'article-body-image-alt-error' : undefined}
                    aria-invalid={validationError ? true : undefined}
                    onChange={(event) => handleAltTextChange(event.target.value)}
                  />
                  {validationError && (
                    <p id="article-body-image-alt-error" role="alert" className={styles.imageDialogValidationError}>
                      {validationError}
                    </p>
                  )}
                </div>

                {state.status === 'uploading' && (
                  <p role="status" className={styles.imageDialogLoading}>
                    <Loader2 aria-hidden="true" className={styles.imageDialogLoadingIcon} />
                    Enviando imagem...
                  </p>
                )}

                <div className={styles.imageDialogActions}>
                  <button type="button" onClick={handleConfirm} disabled={state.status === 'uploading'}>
                    Inserir imagem
                  </button>
                  <button type="button" onClick={handleCancel} disabled={state.status === 'uploading'}>
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {state.status === 'error' && (
              <>
                <p role="alert" className={styles.imageDialogError}>
                  <CircleAlert aria-hidden="true" className={styles.imageDialogErrorIcon} />
                  {state.message}
                </p>
                <div className={styles.imageDialogActions}>
                  {state.canRetry ? (
                    <>
                      <button type="button" onClick={handleRetry}>
                        Tentar novamente
                      </button>
                      <button type="button" onClick={handleCancel}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={handleDismissError}>
                      Fechar
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </>
    );
  },
);
