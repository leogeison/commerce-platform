'use client';

import { useState, type FormEvent } from 'react';
import { createCategoryRequestSchema, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { AdminApiError } from '../../../lib/api-error';
import styles from './category-form.module.css';

interface CategoryFormProps {
  initialValues: CreateCategoryRequest;
  onSubmit: (values: CreateCategoryRequest) => Promise<void>;
  submitLabel: string;
}

type FieldErrors = Partial<Record<keyof CreateCategoryRequest, string>>;

const GENERIC_ERROR_MESSAGE = 'Não foi possível salvar a Categoria. Tente novamente em instantes.';

/**
 * `AdminApiError` cujo corpo veio de `apiErrorSchema` (código presente,
 * `throwApiError`/`api-client.ts`) carrega mensagem já produzida e
 * considerada segura pela própria API (`AllExceptionsFilter`, inclusive
 * para `500` — "Ocorreu um erro inesperado."). Mesmo assim, só repassamos
 * `error.message` para os status que representam decisão de negócio real
 * (`403`/`404`/`409`/`422`) — mesma cautela defensiva já usada em
 * `LoginForm` (ADM-002): erro de rede, resposta inválida ou `500`
 * inesperado sempre cai na mensagem genérica fixa deste componente, nunca
 * no texto vindo da API.
 */
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

function resolveErrorMessage(error: unknown): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Formulário compartilhado entre criar (`/new`) e editar (`/:id`) Categoria
 * (ADM-005) — único componente reaproveitado, específico de Categoria
 * (`name`/`slug`), sem abstração genérica entre entidades.
 *
 * Valida com `createCategoryRequestSchema` mesmo no modo edição: este form
 * sempre envia os dois campos preenchidos (nunca edição parcial de um
 * campo isolado), então "ambos obrigatórios, min(1)" já é exatamente o que
 * ele garante na prática — não é uma regra nova, nem uso indevido do
 * schema de update (que só é `.optional()` por causa do PATCH parcial da
 * API, não porque este form produza corpos parciais).
 *
 * `isSubmitting` volta a `false` após `onSubmit` (sucesso ou erro): tanto
 * faz para o modo criar (a página redireciona logo em seguida) quanto para
 * o modo editar (permanece na própria página — precisa reabilitar o
 * formulário).
 */
export function CategoryForm({ initialValues, onSubmit, submitLabel }: CategoryFormProps) {
  const [name, setName] = useState(initialValues.name);
  const [slug, setSlug] = useState(initialValues.slug);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const parsed = createCategoryRequestSchema.safeParse({ name, slug });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'name' || field === 'slug') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await onSubmit(parsed.data);
      setIsSubmitting(false);
    } catch (error) {
      setFormError(resolveErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="category-name">Nome</label>
        <input
          id="category-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.name ? true : undefined}
          aria-describedby={fieldErrors.name ? 'category-name-error' : undefined}
        />
        {fieldErrors.name && (
          <p id="category-name-error" role="alert" className={styles.fieldError}>
            {fieldErrors.name}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="category-slug">Slug</label>
        <input
          id="category-slug"
          type="text"
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.slug ? true : undefined}
          aria-describedby={fieldErrors.slug ? 'category-slug-error' : undefined}
        />
        {fieldErrors.slug && (
          <p id="category-slug-error" role="alert" className={styles.fieldError}>
            {fieldErrors.slug}
          </p>
        )}
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
