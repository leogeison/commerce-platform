'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Text } from '@commerce-platform/ui';
import { createOfferRequestSchema, marketplaceSchema, type CreateOfferRequest } from '@commerce-platform/contracts';
import { AdminApiError } from '../../../../lib/api-error';
import { adminZodErrorMap } from '../../../../lib/validation-messages';
import { useSyncFormDirty } from '../../unsaved-changes-context';

/**
 * Formato de ENTRADA aceito por `OfferForm` — mesmo shape de
 * `CreateOfferRequest` (`currency`/`inStock` opcionais). Essa
 * optionalidade é do CONTRATO HTTP (`createOfferRequestSchema`,
 * `packages/contracts`), não do componente: reflete que o schema Prisma
 * já tem `currency @default("BRL")`/`inStock @default(true)`, então o
 * corpo de `POST .../offers` pode legitimamente omitir os dois. `OfferForm`
 * NUNCA repassa essa omissão adiante — normaliza para o estado interno
 * sempre definido (`toFormInput`, abaixo) antes de alimentar a RHF.
 */
export type OfferFormInitialValues = CreateOfferRequest;

/**
 * Estado interno controlado pelo `OfferForm` — `currency`/`inStock`
 * SEMPRE definidos, nunca `undefined`, diferente do contrato de origem: o
 * formulário nunca depende do default do backend (mesmo princípio já
 * documentado antes desta tarefa — evita reenvio ambíguo numa nova
 * tentativa e mantém o corpo sempre completo/previsível). `.unwrap()`
 * remove só o `.optional()` externo de cada campo — a constraint em si
 * (`z.string().min(1)`/`z.boolean()`) continua vindo de
 * `createOfferRequestSchema`, nunca duplicada aqui; se o contrato mudar,
 * esta schema acompanha automaticamente. Nenhum `z.preprocess` é
 * necessário (diferente de `ProductForm`): Oferta não tem nenhum campo
 * `.nullable()` no contrato (`updateOfferRequestSchema`, doc comment),
 * então não existe tradução `''`↔`null` a fazer aqui.
 */
const offerFormValuesSchema = z.object({
  marketplace: createOfferRequestSchema.shape.marketplace,
  price: createOfferRequestSchema.shape.price,
  currency: createOfferRequestSchema.shape.currency.unwrap(),
  affiliateUrl: createOfferRequestSchema.shape.affiliateUrl,
  inStock: createOfferRequestSchema.shape.inStock.unwrap(),
});

type OfferFormInput = z.input<typeof offerFormValuesSchema>;
export type OfferFormValues = z.output<typeof offerFormValuesSchema>;

interface OfferFormProps {
  initialValues: OfferFormInitialValues;
  submitLabel: string;
  onSubmit: (values: OfferFormValues) => Promise<void>;
  onCancel: () => void;
  /**
   * UXA-014 — espelha `formState.isDirty` da RHF para `OfferSection`, que
   * usa isso (não o `isDirty` agregado do `UnsavedChangesContext`) para
   * decidir se a troca local criar↔editar precisa de confirmação. Mesmo
   * padrão de dois efeitos que `useSyncFormDirty` já usa internamente:
   * ver os dois `useEffect` abaixo.
   */
  onDirtyChange?: (isDirty: boolean) => void;
}

const GENERIC_ERROR_MESSAGE = 'Não foi possível salvar a Oferta. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

/**
 * Defaults canônicos aplicados — `currency: 'BRL'`, `inStock: true` — NÃO
 * são inventados aqui: são os mesmos já documentados no próprio contrato
 * (`createOfferRequestSchema`, CTR-005 — "schema Prisma já tem defaults
 * `currency @default(\"BRL\")`, `inStock @default(true)`") e os mesmos já
 * usados por `DEFAULT_CREATE_VALUES` (`offer-section.tsx`, inalterado por
 * esta tarefa). Esta função é a única fronteira onde essa optionalidade
 * do contrato é resolvida para um valor sempre definido — nenhum chamador
 * real hoje (`DEFAULT_CREATE_VALUES`/`offerToFormValues`, em
 * `offer-section.tsx`) omite `currency`/`inStock`, então isto é uma defesa
 * de fronteira (o formulário controlado nunca nasce com `undefined`
 * nesses dois campos, mesmo que um chamador futuro venha a omiti-los),
 * não uma mudança de comportamento observável hoje.
 */
function toFormInput(values: OfferFormInitialValues): OfferFormInput {
  return {
    marketplace: values.marketplace,
    price: values.price,
    currency: values.currency ?? 'BRL',
    affiliateUrl: values.affiliateUrl,
    inStock: values.inStock ?? true,
  };
}

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
 * Formulário de Oferta (ADM-006) — usado tanto pra criar quanto editar,
 * sempre inline dentro de `OfferSection` (Oferta não tem página própria,
 * Architecture.md §32).
 *
 * UXA-014 — migração completa para os padrões já provados em Categoria/
 * Produto: `react-hook-form` + `zodResolver(offerFormValuesSchema, {
 * error: adminZodErrorMap })`, `shouldFocusError: true`, `useSyncFormDirty`
 * (agora multi-publisher, `unsaved-changes-context.tsx`). Diferente de
 * `ProductForm`/`CategoryForm`, este componente NÃO chama `reset()` após
 * sucesso: `OfferSection` fecha o formulário (desmonta) assim que
 * `onSubmit` resolve — não há necessidade de estabelecer um novo baseline
 * "limpo" num componente que está prestes a sumir da árvore. O desmonte em
 * si já limpa o dirty-state (publisher removido do Context via
 * `useSyncFormDirty`'s cleanup; `onDirtyChange(false)` via o cleanup
 * abaixo).
 *
 * `price`/`affiliateUrl` já carregam mensagens PT-BR customizadas no
 * próprio schema (`offerPriceSchema`/`affiliateUrlSchema`,
 * `packages/contracts`) — têm precedência sobre `adminZodErrorMap`, que
 * neste componente age só como fallback estrutural (nenhuma extensão de
 * `FIELD_LABELS`/`FIELD_MESSAGE_RESOLVERS` foi necessária, mesma conclusão
 * já registrada para `ProductForm`).
 *
 * `isSaving` (estado próprio, não `formState.isSubmitting`) pela mesma
 * razão documentada em `CategoryForm`/`ProductForm`: `isSubmitting` da RHF
 * alterna mesmo em tentativa que falha só na validação, e desabilitar
 * campos nesse instante impediria o foco automático no campo inválido.
 *
 * Apresentação: CSS Module → Tailwind v4 + tokens do design system +
 * primitives `Button`/`Text` (`packages/ui`), mesmo vocabulário já usado
 * em `ProductForm`/`CategoryForm`. `<input>`/`<select>` continuam HTML
 * nativo com classes Tailwind locais.
 */
export function OfferForm({ initialValues, submitLabel, onSubmit, onCancel, onDirtyChange }: OfferFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OfferFormInput, unknown, OfferFormValues>({
    resolver: zodResolver(offerFormValuesSchema, { error: adminZodErrorMap }),
    defaultValues: toFormInput(initialValues),
    shouldFocusError: true,
  });

  useSyncFormDirty(isDirty);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Cleanup isolado (só depende de `onDirtyChange`, estável na prática) —
  // roda exclusivamente no desmonte real, nunca a cada mudança de
  // `isDirty` — mesma razão já documentada em `useSyncFormDirty`.
  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  async function onValid(data: OfferFormValues) {
    setFormError(null);
    setIsSaving(true);

    try {
      await onSubmit(data);
      // Sem `reset()`: em sucesso, `OfferSection` desmonta este
      // formulário — nenhum novo baseline "limpo" precisa ser
      // estabelecido num componente que está saindo da árvore. Ainda
      // assim `isSaving` volta a `false` aqui (React 18+ não avisa por
      // `setState` numa instância que está prestes a desmontar na mesma
      // continuação) — mantém o botão num estado consistente para
      // qualquer chamador que NÃO desmonte imediatamente no sucesso.
      setIsSaving(false);
    } catch (error) {
      setFormError(resolveErrorMessage(error));
      setIsSaving(false);
    }
  }

  return (
    <form
      className="flex w-full max-w-xs flex-col gap-3 rounded-control border border-outline p-3"
      onSubmit={handleSubmit(onValid)}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="offer-marketplace" className="font-ui text-body-sm font-action">
          Marketplace
        </label>
        <select
          id="offer-marketplace"
          disabled={isSaving}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body"
          {...register('marketplace')}
        >
          {marketplaceSchema.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-price" className="font-ui text-body-sm font-action">
          Preço
        </label>
        <input
          id="offer-price"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.price ? true : undefined}
          aria-describedby={errors.price ? 'offer-price-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('price')}
        />
        {errors.price && (
          <Text id="offer-price-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.price.message}
          </Text>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-currency" className="font-ui text-body-sm font-action">
          Moeda
        </label>
        <input
          id="offer-currency"
          type="text"
          disabled={isSaving}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body"
          {...register('currency')}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="offer-affiliate-url" className="font-ui text-body-sm font-action">
          URL de afiliado
        </label>
        <input
          id="offer-affiliate-url"
          type="text"
          disabled={isSaving}
          aria-invalid={errors.affiliateUrl ? true : undefined}
          aria-describedby={errors.affiliateUrl ? 'offer-affiliate-url-error' : undefined}
          className="rounded-control border border-outline px-3 py-2 font-ui text-body aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]"
          {...register('affiliateUrl')}
        />
        {errors.affiliateUrl && (
          <Text id="offer-affiliate-url-error" role="alert" tone="danger" variant="body-sm" className="m-0">
            {errors.affiliateUrl.message}
          </Text>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input id="offer-in-stock" type="checkbox" disabled={isSaving} className="h-4 w-4" {...register('inStock')} />
        <label htmlFor="offer-in-stock" className="font-ui text-body-sm font-action">
          Em estoque
        </label>
      </div>

      {formError && (
        <Text role="alert" tone="danger" variant="body-sm" className="m-0">
          {formError}
        </Text>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? 'Salvando...' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
