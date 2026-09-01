'use client';

import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';
import {
  articleTypeSchema,
  uploadImageResponseSchema,
  type ArticleType,
  type AuthorAdmin,
  type CategoryAdmin,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../../lib/api-client';
import { AdminApiError } from '../../../lib/api-error';
import { TYPE_LABELS } from '../../../lib/article-labels';
import { fetchAllAuthors } from '../../../lib/fetch-all-authors';
import { fetchAllCategories } from '../../../lib/fetch-all-categories';
import { ArticleBodyEditor } from './article-body-editor';
import styles from './article-form.module.css';

export interface ArticleFormValues {
  type: ArticleType;
  title: string;
  slug: string;
  categoryId: string | null;
  authorId: string | null;
  metaDescription: string | null;
  bodyMdx: string;
  coverImageUrl: string | null;
}

interface ArticleFormProps {
  siteSlug: string;
  initialValues: ArticleFormValues;
  submitLabel: string;
  onSubmit: (values: ArticleFormValues) => Promise<void>;
}

type TextFieldErrors = Partial<Record<'type' | 'title' | 'slug' | 'categoryId' | 'authorId', string>>;
type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };
type AuthorsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: AuthorAdmin[] };

const GENERIC_SUBMIT_ERROR_MESSAGE = 'Não foi possível salvar o Artigo. Tente novamente em instantes.';
const GENERIC_UPLOAD_ERROR_MESSAGE = 'Não foi possível enviar a imagem de capa. Tente novamente em instantes.';
const GENERIC_CATEGORIES_ERROR_MESSAGE = 'Não foi possível carregar as Categorias.';
const GENERIC_AUTHORS_ERROR_MESSAGE = 'Não foi possível carregar os Autores.';

/**
 * Só os campos que o usuário digita/seleciona diretamente em controles de
 * texto/seleção — `coverImageUrl` não entra aqui, mesmo critério de
 * `imageUrl` em `productTextFieldsSchema`/`ProductForm`: é resolvida
 * separadamente pelo fluxo de upload, fora deste schema.
 */
const articleTextFieldsSchema = z.object({
  type: articleTypeSchema,
  title: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string().uuid().nullable(),
  authorId: z.string().uuid().nullable(),
  metaDescription: z.string().nullable(),
  bodyMdx: z.string(),
});

/**
 * Mesmos status HTTP de negócio já convencionados desde `CategoryForm`/
 * `ProductForm`/`AuthorForm`. `400` só no conjunto do upload, mesmo
 * critério de `UPLOAD_BUSINESS_ERROR_STATUS_CODES` em `ProductForm`.
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
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`, só em
 * `DRAFT`) Artigo (ADM-009) — específico de Artigo, sem abstração genérica
 * entre entidades (mesmo critério de `ProductForm`/`AuthorForm`).
 *
 * Busca as próprias opções de Categoria (`fetchAllCategories`, já
 * compartilhada desde a ADM-008) e de Autor (`fetchAllAuthors`, nova nesta
 * tarefa) — mesmo critério de dono único do dado já usado em `ProductForm`.
 * Categoria segue a mesma regra de `ProductForm`: arquivadas ocultas,
 * exceto a já vinculada (rotulada "(arquivada)"). Autor não tem ciclo de
 * arquivamento, então todos aparecem sem distinção.
 *
 * `bodyMdx` é um `<textarea>` simples — tratado como Markdown textual puro,
 * sem preview, sem editor dedicado, sem nenhuma dependência nova (decisão
 * fechada no desenho técnico da ADM-009).
 *
 * Upload de capa: mesmo fluxo corrigido do ADM-006/007 — seleção local
 * (`selectedFile`/`previewUrl` via `URL.createObjectURL`, sem rede no
 * `onChange`), upload único dentro de `handleSubmit` só se houver
 * `selectedFile`, `purpose: 'ARTICLE_COVER'`. Sucesso atualiza
 * `storedCoverImageUrl` e limpa `selectedFile`/`previewUrl` ANTES de
 * `onSubmit`, para que um retry após falha de persistência reaproveite a
 * URL já enviada em vez de reenviar o arquivo. `useEffect` de cleanup
 * dedicado a `previewUrl`, só na função de limpeza (sem `setState` no
 * corpo do efeito).
 */
export function ArticleForm({ siteSlug, initialValues, submitLabel, onSubmit }: ArticleFormProps) {
  const [type, setType] = useState<ArticleType>(initialValues.type);
  const [title, setTitle] = useState(initialValues.title);
  const [slug, setSlug] = useState(initialValues.slug);
  const [categoryId, setCategoryId] = useState(initialValues.categoryId ?? '');
  const [authorId, setAuthorId] = useState(initialValues.authorId ?? '');
  const [metaDescription, setMetaDescription] = useState(initialValues.metaDescription ?? '');
  const [bodyMdx, setBodyMdx] = useState(initialValues.bodyMdx);
  const [storedCoverImageUrl, setStoredCoverImageUrl] = useState<string | null>(initialValues.coverImageUrl);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });
  const [authorsState, setAuthorsState] = useState<AuthorsState>({ status: 'loading' });
  const [fieldErrors, setFieldErrors] = useState<TextFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetchAllCategories(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCategoriesState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoriesState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  useEffect(() => {
    let cancelled = false;

    fetchAllAuthors(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setAuthorsState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthorsState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  /**
   * Único dono do ciclo de vida do blob local — mesmo critério de
   * `ProductForm`: revoga a URL anterior sempre que `previewUrl` muda e
   * também no desmonte, sem `setState` no corpo do efeito.
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
    event.target.value = '';

    if (!file || isSubmitting) {
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function handleRemoveImage() {
    if (isSubmitting) {
      return;
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setStoredCoverImageUrl(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const parsed = articleTextFieldsSchema.safeParse({
      type,
      title,
      slug,
      categoryId: categoryId === '' ? null : categoryId,
      authorId: authorId === '' ? null : authorId,
      metaDescription: metaDescription === '' ? null : metaDescription,
      bodyMdx,
    });

    if (!parsed.success) {
      const errors: TextFieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'type' || field === 'title' || field === 'slug' || field === 'categoryId' || field === 'authorId') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    let finalCoverImageUrl = storedCoverImageUrl;

    if (selectedFile) {
      try {
        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('purpose', 'ARTICLE_COVER');

        const { url } = await apiRequest(
          `/admin/sites/${encodeURIComponent(siteSlug)}/uploads/images`,
          uploadImageResponseSchema,
          { method: 'POST', body: formData },
        );

        finalCoverImageUrl = url;
        setSelectedFile(null);
        setPreviewUrl(null);
        setStoredCoverImageUrl(finalCoverImageUrl);
      } catch (error) {
        setFormError(resolveErrorMessage(error, GENERIC_UPLOAD_ERROR_MESSAGE, UPLOAD_BUSINESS_ERROR_STATUS_CODES));
        setIsSubmitting(false);
        return;
      }
    }

    try {
      await onSubmit({ ...parsed.data, coverImageUrl: finalCoverImageUrl });
      setIsSubmitting(false);
    } catch (error) {
      setFormError(resolveErrorMessage(error, GENERIC_SUBMIT_ERROR_MESSAGE, SUBMIT_BUSINESS_ERROR_STATUS_CODES));
      setIsSubmitting(false);
    }
  }

  const categoryOptions =
    categoriesState.status === 'ready'
      ? categoriesState.items.filter((category) => !category.archivedAt || category.id === initialValues.categoryId)
      : [];

  const previewSrc = previewUrl ?? storedCoverImageUrl;

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="article-type">Tipo</label>
        <select
          id="article-type"
          value={type}
          onChange={(event) => setType(event.target.value as ArticleType)}
          disabled={isSubmitting}
        >
          {articleTypeSchema.options.map((option) => (
            <option key={option} value={option}>
              {TYPE_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="article-title">Título</label>
        <input
          id="article-title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.title ? true : undefined}
          aria-describedby={fieldErrors.title ? 'article-title-error' : undefined}
        />
        {fieldErrors.title && (
          <p id="article-title-error" role="alert" className={styles.fieldError}>
            {fieldErrors.title}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="article-slug">Slug</label>
        <input
          id="article-slug"
          type="text"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.slug ? true : undefined}
          aria-describedby={fieldErrors.slug ? 'article-slug-error' : undefined}
        />
        {fieldErrors.slug && (
          <p id="article-slug-error" role="alert" className={styles.fieldError}>
            {fieldErrors.slug}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="article-category">Categoria</label>
        <select
          id="article-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          disabled={isSubmitting || categoriesState.status !== 'ready'}
        >
          <option value="">Nenhuma</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
              {category.archivedAt ? ' (arquivada)' : ''}
            </option>
          ))}
        </select>
        {categoriesState.status === 'error' && (
          <p role="alert" className={styles.fieldError}>
            {GENERIC_CATEGORIES_ERROR_MESSAGE}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="article-author">Autor</label>
        <select
          id="article-author"
          value={authorId}
          onChange={(event) => setAuthorId(event.target.value)}
          disabled={isSubmitting || authorsState.status !== 'ready'}
        >
          <option value="">Nenhum</option>
          {authorsState.status === 'ready' &&
            authorsState.items.map((author) => (
              <option key={author.id} value={author.id}>
                {author.name}
              </option>
            ))}
        </select>
        {authorsState.status === 'error' && (
          <p role="alert" className={styles.fieldError}>
            {GENERIC_AUTHORS_ERROR_MESSAGE}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="article-meta-description">Meta description</label>
        <textarea
          id="article-meta-description"
          value={metaDescription}
          onChange={(event) => setMetaDescription(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label id="article-body-label" htmlFor="article-body">
          Corpo (Markdown)
        </label>
        <ArticleBodyEditor
          id="article-body"
          labelId="article-body-label"
          initialValue={initialValues.bodyMdx}
          onChange={setBodyMdx}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="article-cover">Capa</label>
        {previewSrc && <img src={previewSrc} alt="Capa do Artigo" className={styles.preview} />}
        <input id="article-cover" type="file" accept="image/*" onChange={handleFileChange} disabled={isSubmitting} />
        <div className={styles.imageActions}>
          {previewSrc && (
            <button type="button" onClick={handleRemoveImage} disabled={isSubmitting}>
              Remover capa
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
