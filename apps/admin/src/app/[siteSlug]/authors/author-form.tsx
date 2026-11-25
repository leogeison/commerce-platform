'use client';

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button, Text } from '@commerce-platform/ui';
import { updateAuthorRequestSchema, uploadImageResponseSchema } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { adminZodErrorMap } from '../../../lib/validation-messages';
import { useSyncFormDirty } from '../unsaved-changes-context';
import { AuthorAvatar } from './author-avatar';
import { AvatarCropDialog } from './avatar-crop-dialog';
import { AVATAR_FILE_ACCEPT, validateAvatarFile, type PixelArea } from './crop-avatar-image';

/**
 * UXA-015 — schema client-side de `AuthorForm`, composto de
 * `updateAuthorRequestSchema` (`packages/contracts`) via `.unwrap()`, mesmo
 * critério já usado em `ProductForm` (UXA-013): `updateAuthorRequestSchema`
 * já carrega as constraints canônicas certas por campo (`.min(1)` em
 * `name`, nulável em `bio`/`avatarUrl`) — nenhuma retipagem manual.
 *
 * `userId` fica de fora do schema: nunca existiu nesta UI (vínculo
 * Author↔User é decisão explicitamente fora desta tarefa, ADM-007, não
 * revisitada aqui).
 *
 * `bio` usa `z.preprocess` para traduzir o `''` nativo do `<textarea>`
 * vazio para `null` — mesmo padrão de `categoryId`/`description` em
 * `ProductForm`. `avatarUrl` não usa `z.preprocess`: nunca é preenchido por
 * um controle nativo — é escrito exclusivamente via `setValue('avatarUrl',
 * ..., { shouldDirty: true })`, sempre como string real ou `null`
 * explícito, nunca `''` (mesmo critério de `imageUrl` em `ProductForm`).
 *
 * `adminZodErrorMap` já mapeia `name`→"nome" com resolver de `too_small`
 * (usado por Categoria/Produto) — `name` de Autor tem a mesma constraint
 * (`min(1)`), então nenhuma extensão de `validation-messages.ts` é
 * necessária. `bio` não tem `.min()` e `avatarUrl` nunca é digitado, então
 * nenhum dos dois aciona `too_small` na prática.
 */
const authorFormValuesSchema = z.object({
  name: updateAuthorRequestSchema.shape.name.unwrap(),
  bio: z.preprocess((value) => (value === '' ? null : value), updateAuthorRequestSchema.shape.bio.unwrap()),
  avatarUrl: updateAuthorRequestSchema.shape.avatarUrl.unwrap(),
});

type AuthorFormInput = z.input<typeof authorFormValuesSchema>;
export type AuthorFormValues = z.output<typeof authorFormValuesSchema>;

interface AuthorFormProps {
  siteSlug: string;
  initialValues: AuthorFormValues;
  submitLabel: string;
  onSubmit: (values: AuthorFormValues) => Promise<void>;
  onSuccess?: () => void;
}

const GENERIC_SUBMIT_ERROR_MESSAGE = 'Não foi possível salvar o Autor. Tente novamente em instantes.';
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem. Tente novamente em instantes.';

/**
 * `403`/`404`/`409`/`422` são as respostas de negócio estruturadas e
 * seguras já convencionadas desde a ADM-005. `400` entra só no conjunto do
 * upload pelo mesmo motivo já documentado em `ProductForm`:
 * `UploadImageController` sempre devolve, para esse status, uma das três
 * mensagens fixas e seguras já conhecidas.
 */
const SUBMIT_BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);
const UPLOAD_BUSINESS_ERROR_STATUS_CODES = new Set([400, 403, 404, 409, 422]);

function resolveErrorMessage(error: unknown, generic: string, businessStatusCodes: Set<number>): string {
  if (error instanceof AdminApiError && error.statusCode !== undefined && businessStatusCodes.has(error.statusCode)) {
    return error.message;
  }
  return generic;
}

/**
 * Converte `AuthorFormValues` (saída validada, `bio` nulável) para o
 * formato de entrada que o `<textarea>` nativo precisa (`''` para "sem
 * bio", nunca `null`) — usado tanto para `defaultValues` quanto para o
 * `reset()` pós-salvamento, sempre o inverso exato do `z.preprocess` do
 * schema. `avatarUrl` passa direto — nunca vai a um controle nativo.
 */
function toFormInput(values: AuthorFormValues): AuthorFormInput {
  return {
    name: values.name,
    bio: values.bio ?? '',
    avatarUrl: values.avatarUrl,
  };
}

/**
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`) Autor
 * (ADM-007) — específico de Autor, sem abstração genérica entre entidades
 * (mesmo critério de `CategoryForm`/`ProductForm`).
 *
 * UXA-015 — migração completa para os padrões já provados em Categoria e
 * Produto: `react-hook-form` + `zodResolver(authorFormValuesSchema, {
 * error: adminZodErrorMap })`, `useSyncFormDirty(isDirty)` (API inalterada
 * — Autor nunca tem dois formulários montados ao mesmo tempo, usa o mesmo
 * publisher único que Categoria já usa), `onSuccess` chamado só depois de
 * `reset()` (toast fica por conta de quem chama — `CreateAuthor`/
 * `AuthorDetail`), `shouldFocusError: true`. `isSaving` (estado próprio,
 * não `formState.isSubmitting`) pela mesma razão documentada em
 * `CategoryForm`/`ProductForm`.
 *
 * Upload de avatar — semântica idêntica ao upload de imagem do
 * `ProductForm` (UXA-013), com `purpose: 'AUTHOR_AVATAR'`: selecionar/
 * trocar arquivo nunca envia nada pela rede, só guarda o `File` localmente
 * e mostra um preview local via `URL.createObjectURL`. O upload real
 * acontece uma única vez, dentro do próprio `onValid`, antes do
 * POST/PATCH do Autor. `setValue('avatarUrl', ..., { shouldDirty: true })`
 * nos três pontos onde o valor final muda de verdade (seleção, remoção,
 * upload concluído) — mesma ordem exata do `ProductForm`.
 *
 * `useWatch({ control, name: 'name' })` alimenta o fallback de iniciais do
 * `AuthorAvatar` em tempo real, conforme o admin digita — mesma técnica
 * (não `watch()`, que não é memoizável e desativaria o React Compiler para
 * o componente inteiro) já documentada em `ProductForm` para `imageUrl`.
 * `useWatch({ control, name: 'avatarUrl' })` é a fonte do "valor
 * confirmado atual" do avatar, mesmo papel que `imageUrl` tem lá.
 *
 * `reset(toFormInput({ ...data, avatarUrl: finalAvatarUrl }))` só roda
 * depois que a persistência é bem-sucedida — estabelece o novo baseline e
 * zera `formState.isDirty`. Em erro (upload ou submissão), nenhum
 * `reset()` roda.
 *
 * UXP-003 — cropper de avatar. Selecionar um arquivo não altera mais o
 * formulário diretamente: valida tipo (JPEG/PNG/WebP) e tamanho (5 MiB,
 * mesmo limite da API) e abre `AvatarCropDialog` sobre o arquivo original.
 * - Cancelar/Escape: nenhuma alteração no formulário (nem `isDirty`).
 * - Aplicar recorte: o `File` quadrado gerado no navegador passa a ser o
 *   `selectedFile` (preview local + `setValue('avatarUrl', ..., {
 *   shouldDirty: true })`), exatamente o ponto onde antes entrava o
 *   arquivo selecionado. O upload `AUTHOR_AVATAR` em `onValid` e a
 *   persistência do Autor seguem idênticos, enviando só o arquivo recortado.
 * - "Ajustar recorte": enquanto houver um recorte ainda não salvo, reabre o
 *   cropper sobre o arquivo ORIGINAL, mantido só em memória
 *   (`originalFile`); descartado ao salvar com sucesso, ao remover o avatar
 *   ou ao desmontar. Recortar novamente um avatar já persistido fica fora
 *   de escopo. Junto do original fica, também só em memória, a área do
 *   último recorte aplicado (`lastCropArea`), repassada ao cropper para
 *   retomar o enquadramento. Cancelar um ajuste — ou selecionar outra
 *   imagem e cancelar — não mexe em nenhum dos dois: só "Aplicar recorte"
 *   os substitui.
 * - Resultados tardios: o cropper descarta gerações canceladas, e
 *   `handleCropApplied` ainda confere que o resultado pertence à imagem
 *   aberta AGORA (`cropSource.url`) — um diálogo antigo nunca sobrescreve
 *   um recorte mais recente nem altera o formulário depois de fechado.
 * Nenhuma coordenada de recorte é persistida — `avatarUrl` continua sendo
 * só a URL da imagem final.
 */
export function AuthorForm({ siteSlug, initialValues, submitLabel, onSubmit, onSuccess }: AuthorFormProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // UXP-003 — arquivo original do recorte ainda não salvo ("Ajustar
  // recorte") e imagem atualmente aberta no cropper (`null` = fechado).
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [lastCropArea, setLastCropArea] = useState<PixelArea | null>(null);
  const [cropSource, setCropSource] = useState<{
    file: File;
    url: string;
    initialArea: PixelArea | null;
  } | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cropReturnFocusRef = useRef<HTMLElement | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<AuthorFormInput, unknown, AuthorFormValues>({
    resolver: zodResolver(authorFormValuesSchema, { error: adminZodErrorMap }),
    defaultValues: toFormInput(initialValues),
    shouldFocusError: true,
  });

  useSyncFormDirty(isDirty);

  /**
   * Único dono do ciclo de vida do blob local: revoga a URL anterior
   * sempre que `previewUrl` muda e também no desmonte — sem `setState` no
   * corpo do efeito, só na função de cleanup (mesma estrutura de
   * `ProductForm`/`OfferSection`).
   */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  /** Mesmo padrão acima, para a URL local da imagem original aberta no cropper. */
  useEffect(() => {
    return () => {
      if (cropSource) {
        URL.revokeObjectURL(cropSource.url);
      }
    };
  }, [cropSource]);

  function openCropper(file: File, returnFocusTarget: HTMLElement | null, initialArea: PixelArea | null) {
    cropReturnFocusRef.current = returnFocusTarget;
    setCropSource({ file, url: URL.createObjectURL(file), initialArea });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reseta o valor do input imediatamente: sem isso, selecionar o MESMO
    // arquivo de novo não dispararia um novo evento `change`.
    event.target.value = '';

    if (!file || isSaving) {
      return;
    }

    // Antecipação client-side da política de upload (a API continua sendo a
    // autoridade): arquivo inválido nunca abre o cropper nem altera o form.
    const validationError = validateAvatarFile(file);
    setAvatarError(validationError);
    if (validationError) {
      return;
    }

    // Imagem nova: começa centralizada (a área salva é do original anterior).
    openCropper(file, fileInputRef.current, null);
  }

  function handleCropApplied(sourceUrl: string, croppedFile: File, croppedArea: PixelArea) {
    if (!cropSource || cropSource.url !== sourceUrl) {
      return; // resultado de um cropper que não é mais o aberto
    }
    const objectUrl = URL.createObjectURL(croppedFile);
    setOriginalFile(cropSource.file);
    setLastCropArea(croppedArea);
    setCropSource(null);
    setSelectedFile(croppedFile);
    setPreviewUrl(objectUrl);
    setValue('avatarUrl', objectUrl, { shouldDirty: true });
  }

  function handleCropCancelled() {
    setCropSource(null);
  }

  function handleAdjustCrop(event: MouseEvent<HTMLButtonElement>) {
    if (!originalFile || isSaving) {
      return;
    }
    // O próprio botão recebe o foco de volta ao fechar o cropper (ele
    // continua montado enquanto o recorte não for salvo).
    openCropper(originalFile, event.currentTarget, lastCropArea);
  }

  function handleRemoveAvatar() {
    if (isSaving) {
      return;
    }
    setSelectedFile(null);
    setOriginalFile(null);
    setLastCropArea(null);
    setAvatarError(null);
    setPreviewUrl(null);
    setValue('avatarUrl', null, { shouldDirty: true });
  }

  async function onValid(data: AuthorFormValues) {
    setFormError(null);
    setIsSaving(true);

    let finalAvatarUrl = data.avatarUrl;

    if (selectedFile) {
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('purpose', 'AUTHOR_AVATAR');

        const { url } = await apiRequest(
          `/admin/sites/${encodeURIComponent(siteSlug)}/uploads/images`,
          uploadImageResponseSchema,
          { method: 'POST', body: formData },
        );

        finalAvatarUrl = url;
        setSelectedFile(null);
        // O recorte foi enviado: a partir daqui o avatar é o persistido, e
        // recortar de novo exige selecionar o arquivo outra vez.
        setOriginalFile(null);
        setLastCropArea(null);
        setPreviewUrl(null);
        setValue('avatarUrl', finalAvatarUrl, { shouldDirty: true });
      } catch (error) {
        setFormError(resolveErrorMessage(error, GENERIC_UPLOAD_ERROR_MESSAGE, UPLOAD_BUSINESS_ERROR_STATUS_CODES));
        setIsSaving(false);
        // Upload falhou: o Autor não pode ser criado/atualizado.
        return;
      }
    }

    const finalValues: AuthorFormValues = { ...data, avatarUrl: finalAvatarUrl };

    try {
      await onSubmit(finalValues);
      reset(toFormInput(finalValues));
      onSuccess?.();
    } catch (error) {
      setFormError(resolveErrorMessage(error, GENERIC_SUBMIT_ERROR_MESSAGE, SUBMIT_BUSINESS_ERROR_STATUS_CODES));
    } finally {
      setIsSaving(false);
    }
  }

  const watchedName = useWatch({ control, name: 'name' });
  const currentAvatarUrl = useWatch({ control, name: 'avatarUrl' });
  const previewSrc = previewUrl ?? currentAvatarUrl;

  return (
    <form className="flex w-full max-w-xs flex-col gap-4" onSubmit={handleSubmit(onValid)} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="author-name" className="font-ui text-body-sm font-action">
          Nome
        </label>
        <input
          id="author-name"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'author-name-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('name')}
        />
        {errors.name && (
          <Text id="author-name-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.name.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="author-bio" className="font-ui text-body-sm font-action">
          Bio
        </label>
        <textarea
          id="author-bio"
          disabled={isSaving}
          aria-invalid={errors.bio ? true : undefined}
          aria-describedby={errors.bio ? 'author-bio-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('bio')}
        />
        {errors.bio && (
          <Text id="author-bio-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.bio.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="author-avatar" className="font-ui text-body-sm font-action">
          Avatar
        </label>
        <AuthorAvatar name={watchedName ?? ''} avatarUrl={previewSrc ?? null} />
        <input
          ref={fileInputRef}
          id="author-avatar"
          type="file"
          accept={AVATAR_FILE_ACCEPT}
          onChange={handleFileChange}
          disabled={isSaving}
          aria-describedby={avatarError ? 'author-avatar-error author-avatar-hint' : 'author-avatar-hint'}
          aria-invalid={avatarError ? true : undefined}
          className="font-ui text-body-sm"
        />
        <Text id="author-avatar-hint" variant="body-sm" tone="muted" className="m-0">
          JPEG, PNG ou WebP, até 5 MB. Depois de escolher, você ajusta o recorte.
        </Text>
        {avatarError && (
          <Text id="author-avatar-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {avatarError}
          </Text>
        )}
        {(previewSrc || (originalFile && selectedFile)) && (
          <div className="flex flex-wrap gap-2">
            {originalFile && selectedFile && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAdjustCrop}
                disabled={isSaving}
              >
                Ajustar recorte
              </Button>
            )}
            {previewSrc && (
              <Button type="button" variant="secondary" size="sm" onClick={handleRemoveAvatar} disabled={isSaving}>
                Remover avatar
              </Button>
            )}
          </div>
        )}
      </div>

      {cropSource && (
        <AvatarCropDialog
          key={cropSource.url}
          imageUrl={cropSource.url}
          returnFocusRef={cropReturnFocusRef}
          initialCroppedAreaPixels={cropSource.initialArea}
          onApply={(croppedFile, croppedArea) => handleCropApplied(cropSource.url, croppedFile, croppedArea)}
          onCancel={handleCropCancelled}
        />
      )}

      {formError && (
        <Text role="alert" tone="danger" variant="body-sm" className="m-0">
          {formError}
        </Text>
      )}

      <Button type="submit" disabled={isSaving} className="self-start">
        {isSaving ? 'Salvando...' : submitLabel}
      </Button>
    </form>
  );
}
