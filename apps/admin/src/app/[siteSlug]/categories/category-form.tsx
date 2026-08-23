'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Button, Text } from '@commerce-platform/ui';
import { createCategoryRequestSchema, type CreateCategoryRequest } from '@commerce-platform/contracts';
import { AdminApiError } from '../../../lib/api-error';
import { useSyncFormDirty } from '../unsaved-changes-context';

interface CategoryFormProps {
  initialValues: CreateCategoryRequest;
  onSubmit: (values: CreateCategoryRequest) => Promise<void>;
  onSuccess?: () => void;
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
 *
 * `useSyncFormDirty(isDirty)` (UXA-003) publica `formState.isDirty` —
 * autoridade única de dirty-state — para o guard de navegação
 * compartilhado; este componente nunca sabe como esse guard é consumido
 * (`GuardedLink`, troca de Site, Logout), só publica o valor real.
 *
 * `onSuccess`, quando informado, só é chamado depois de `reset(data)` —
 * nunca antes. Isso importa especificamente para o modo criação: é quem
 * chama `CategoryForm` (`CreateCategory`) quem decide navegar dentro de
 * `onSuccess`, e essa navegação só acontece depois que a RHF já
 * estabeleceu o novo baseline limpo — nunca antes, mesmo que nenhum
 * mecanismo atual dependa dessa ordem para funcionar corretamente.
 *
 * UXA-005 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system + primitives `Button`/`Text` (`packages/ui`). `<input>`
 * permanece HTML nativo com classes Tailwind locais: não existe primitive
 * de campo de formulário em `packages/ui` nesta tarefa (decisão #5 da
 * aprovação). `border-outline`/`rounded-control` mapeiam para os tokens
 * semânticos `--color-border-default`/`--radius-md` (bridge Tailwind,
 * `tailwind-theme.css`); a borda de erro usa
 * `var(--color-feedback-danger-fill)` via valor arbitrário, pois não existe
 * bridge Tailwind dedicado a borda de erro — mesmo token já usado por
 * `Text tone="danger"` na mensagem de erro correspondente. O botão de
 * submit passa a usar `Button` (variant "primary" por padrão): preserva
 * `type="submit"`, `disabled={isSaving}` e o texto condicional; `self-start`
 * reproduz o `align-self: flex-start` original dentro do form em coluna.
 */
export function CategoryForm({ initialValues, onSubmit, onSuccess, submitLabel }: CategoryFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateCategoryRequest>({
    resolver: zodResolver(createCategoryRequestSchema),
    defaultValues: initialValues,
    shouldFocusError: true,
  });

  useSyncFormDirty(isDirty);

  async function onValid(data: CreateCategoryRequest) {
    setFormError(null);
    setIsSaving(true);
    try {
      await onSubmit(data);
      reset(data);
      onSuccess?.();
    } catch (error) {
      setFormError(resolveErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="flex w-full max-w-xs flex-col gap-4" onSubmit={handleSubmit(onValid)} noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor="category-name" className="font-ui text-body-sm font-action">
          Nome
        </label>
        <input
          id="category-name"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('name')}
        />
        {errors.name && (
          <Text id="category-name-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.name.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category-slug" className="font-ui text-body-sm font-action">
          Slug
        </label>
        <input
          id="category-slug"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={errors.slug ? 'category-slug-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('slug')}
        />
        {errors.slug && (
          <Text id="category-slug-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.slug.message}
          </Text>
        )}
      </div>

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
