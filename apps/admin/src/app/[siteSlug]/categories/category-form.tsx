'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { createCategoryRequestSchema, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { AdminApiError } from '../../../lib/api-error';
import styles from './category-form.module.css';

interface CategoryFormProps {
  initialValues: CreateCategoryRequest;
  onSubmit: (values: CreateCategoryRequest) => Promise<void>;
  submitLabel: string;
}

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
 *
 * Deliberadamente mantido fora do `formState` do `react-hook-form`:
 * nunca `setError('root', ...)`. Erro de negócio/API é estado próprio
 * deste componente; erro de validação de campo é estado do RHF — as duas
 * fronteiras nunca se misturam no mesmo mecanismo.
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
 * `react-hook-form` + `zodResolver(createCategoryRequestSchema)` — mesmo
 * schema que já validava manualmente, agora como resolver. Continua sendo
 * usado também no modo edição: este form sempre envia os dois campos
 * preenchidos (nunca edição parcial de um campo isolado), então "ambos
 * obrigatórios, min(1)" já é exatamente o que ele garante na prática —
 * não é uso indevido do schema de update (que só é `.optional()` por
 * causa do PATCH parcial da API, não porque este form produza corpos
 * parciais). Nenhum schema local é criado; `updateCategoryRequestSchema`
 * nunca é usado aqui.
 *
 * `defaultValues: initialValues`, lido só na montagem — sem
 * `useEffect`/`values` ressincronizando a partir de props.
 *
 * `shouldFocusError: true` é o padrão do RHF, declarado aqui de forma
 * explícita porque é o mecanismo real que move o foco para o primeiro
 * campo inválido na submissão falha.
 *
 * `isSaving` (estado próprio, não `formState.isSubmitting` do RHF)
 * representa exclusivamente a chamada assíncrona real de persistência.
 * `formState.isSubmitting` alterna true→false mesmo numa tentativa que
 * falha só na validação, e vincular `disabled` a ele desabilitaria os
 * campos no instante em que o RHF tentaria focar o primeiro campo
 * inválido — elemento desabilitado não recebe foco. `isSaving` evita
 * isso, ficando `true` só ao redor da chamada real a `onSubmit`.
 *
 * `reset(data)` só roda depois que a persistência é bem-sucedida,
 * estabelecendo os valores salvos como novo baseline do formulário; em
 * erro (negócio ou rede), os valores digitados permanecem.
 */
export function CategoryForm({ initialValues, onSubmit, submitLabel }: CategoryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateCategoryRequest>({
    resolver: zodResolver(createCategoryRequestSchema),
    defaultValues: initialValues,
    shouldFocusError: true,
  });

  async function onValid(data: CreateCategoryRequest) {
    setFormError(null);
    setIsSaving(true);
    try {
      await onSubmit(data);
      reset(data);
    } catch (error) {
      setFormError(resolveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit(onValid)} noValidate>
      <div className={styles.field}>
        <label htmlFor="category-name">Nome</label>
        <input
          id="category-name"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="category-name-error" role="alert" className={styles.fieldError}>
            {errors.name.message}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="category-slug">Slug</label>
        <input
          id="category-slug"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={errors.slug ? 'category-slug-error' : undefined}
          {...register('slug')}
        />
        {errors.slug && (
          <p id="category-slug-error" role="alert" className={styles.fieldError}>
            {errors.slug.message}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSaving}>
        {isSaving ? 'Salvando...' : submitLabel}
      </button>
    </form>
  );
}
