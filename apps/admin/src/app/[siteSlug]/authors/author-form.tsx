'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { updateAuthorRequestSchema, uploadImageResponseSchema } from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import styles from './author-form.module.css';

export interface AuthorFormValues {
  name: string;
  bio: string | null;
  avatarUrl: string | null;
}

interface AuthorFormProps {
  siteSlug: string;
  initialValues: AuthorFormValues;
  submitLabel: string;
  onSubmit: (values: AuthorFormValues) => Promise<void>;
}

type FieldErrors = Partial<Record<'name' | 'bio', string>>;

const GENERIC_SUBMIT_ERROR_MESSAGE = 'Não foi possível salvar o Autor. Tente novamente em instantes.';
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem. Tente novamente em instantes.';

/**
 * Reaproveita `updateAuthorRequestSchema` (`packages/contracts`) para
 * validar `name`/`bio` — não é um schema de domínio novo, só um recorte
 * (`.pick`) do contrato de PATCH já existente, com `userId`/`avatarUrl`
 * deliberadamente fora: `avatarUrl` não é um campo de texto digitado (é
 * resolvido pelo upload, ver `handleSubmit`), e `userId` não existe nesta
 * UI (ADM-007: vínculo Author↔User fica fora desta tarefa). `name` chega
 * como `.optional()` nesse recorte (porque no PATCH real omitir `name`
 * significa "não alterar") — isso não enfraquece a validação aqui: este
 * formulário sempre fornece um valor para `name` (nunca omite a chave), e
 * `z.string().min(1)` continua sendo aplicado a esse valor sempre que ele
 * está presente. Por isso o payload final enviado a `onSubmit` é montado a
 * partir do estado local já validado, não de `parsed.data` — o tipo
 * inferido do recorte mantém `name`/`bio` como opcionais (fiel ao PATCH
 * real), o que não corresponde ao shape sempre-resolvido que
 * `AuthorFormValues` exige.
 */
const authorFormFieldsSchema = updateAuthorRequestSchema.pick({ name: true, bio: true });

/**
 * `403`/`404`/`409`/`422` são as respostas de negócio estruturadas e
 * seguras já convencionadas desde a ADM-005. `400` entra só no conjunto do
 * upload pelo mesmo motivo já documentado em `ProductForm`: `UploadImageController`
 * sempre devolve, para esse status, uma das três mensagens fixas e seguras
 * já conhecidas.
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
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`) Autor
 * (ADM-007) — específico de Autor, sem abstração genérica com
 * `CategoryForm`/`ProductForm` (mesmo critério de sempre).
 *
 * Upload de avatar: mesmo fluxo já corrigido no `ProductForm` pós-ADM-006,
 * replicado aqui (não reaproveitado via componente comum) — selecionar/
 * trocar arquivo nunca envia nada pela rede, só guarda o `File` localmente
 * (`selectedFile`) e mostra um preview local via `URL.createObjectURL`
 * (`previewUrl`). O upload real acontece uma única vez, dentro do próprio
 * `handleSubmit`, com `purpose: 'AUTHOR_AVATAR'`, antes do POST/PATCH do
 * Author.
 *
 * `storedAvatarUrl` (mesma nomenclatura/razão de `storedImageUrl` no
 * `ProductForm`): representa só "este arquivo já existe no storage", não
 * "este Autor já referencia esta imagem". Atualizado assim que o upload
 * termina com sucesso, ANTES de `onSubmit` ser chamado, e não é revertido
 * se o POST/PATCH falhar — uma nova tentativa de salvar reaproveita essa
 * URL já enviada, nunca refaz o upload do mesmo arquivo. Isso não resolve
 * o caso de uma imagem ficar órfã no storage se o POST/PATCH falhar depois
 * de um upload bem-sucedido — limitação aceita, mesmo trade-off já
 * documentado em Architecture.md Seção 29.
 */
export function AuthorForm({ siteSlug, initialValues, submitLabel, onSubmit }: AuthorFormProps) {
  const [name, setName] = useState(initialValues.name);
  const [bio, setBio] = useState(initialValues.bio ?? '');
  const [storedAvatarUrl, setStoredAvatarUrl] = useState<string | null>(initialValues.avatarUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Único dono do ciclo de vida do blob local: revoga a URL anterior
   * sempre que `previewUrl` muda (troca de arquivo, remoção, ou submit
   * bem-sucedido zerando o preview) e também no desmonte — sem `setState`
   * no corpo do efeito, só na função de cleanup (mesma estrutura do
   * `ProductForm`/`OfferSection`, não esbarra em `react-hooks/set-state-in-effect`).
   */
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reseta o valor do input imediatamente: sem isso, selecionar o MESMO
    // arquivo de novo não dispararia um novo evento `change`.
    event.target.value = '';

    if (!file || isSubmitting) {
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveAvatar() {
    if (isSubmitting) {
      return;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setStoredAvatarUrl(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const bioValue = bio === '' ? null : bio;
    const parsed = authorFormFieldsSchema.safeParse({ name, bio: bioValue });

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'bio') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    let finalAvatarUrl = storedAvatarUrl;

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
        setPreviewUrl(null);
        setStoredAvatarUrl(finalAvatarUrl);
      } catch (error) {
        setFormError(resolveErrorMessage(error, GENERIC_UPLOAD_ERROR_MESSAGE, UPLOAD_BUSINESS_ERROR_STATUS_CODES));
        setIsSubmitting(false);
        // Upload falhou: o Autor não pode ser criado/atualizado.
        return;
      }
    }

    try {
      await onSubmit({ name, bio: bioValue, avatarUrl: finalAvatarUrl });
      setIsSubmitting(false);
    } catch (error) {
      setFormError(resolveErrorMessage(error, GENERIC_SUBMIT_ERROR_MESSAGE, SUBMIT_BUSINESS_ERROR_STATUS_CODES));
      setIsSubmitting(false);
    }
  }

  const previewSrc = previewUrl ?? storedAvatarUrl;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="author-name">Nome</label>
        <input
          id="author-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'author-name-error' : undefined}
        />
        {fieldErrors.name && (
          <p id="author-name-error" role="alert" className={styles.fieldError}>
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="author-bio">Bio</label>
        <textarea id="author-bio" value={bio} onChange={(event) => setBio(event.target.value)} disabled={isSubmitting} />
        {fieldErrors.bio && (
          <p role="alert" className={styles.fieldError}>
            {fieldErrors.bio}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="author-avatar">Avatar</label>
        {previewSrc && <img src={previewSrc} alt="Avatar do Autor" className={styles.preview} />}
        <input id="author-avatar" type="file" accept="image/*" onChange={handleFileChange} disabled={isSubmitting} />
        <div className={styles.imageActions}>
          {previewSrc && (
            <button type="button" onClick={handleRemoveAvatar} disabled={isSubmitting}>
              Remover avatar
            </button>
          )}
        </div>
      </div>

      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Salvando...' : submitLabel}
      </button>
    </form>
  );
}
