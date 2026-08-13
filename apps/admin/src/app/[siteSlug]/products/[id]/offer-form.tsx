'use client';

import { useState, type FormEvent } from 'react';
import { createOfferRequestSchema, marketplaceSchema, type CreateOfferRequest } from '@commerce-platform/contracts';
import { AdminApiError } from '../../../../lib/api-error';
import styles from './offer-form.module.css';

export type OfferFormValues = CreateOfferRequest;

interface OfferFormProps {
  initialValues: OfferFormValues;
  submitLabel: string;
  onSubmit: (values: OfferFormValues) => Promise<void>;
  onCancel: () => void;
}

type FieldErrors = Partial<Record<keyof OfferFormValues, string>>;

const GENERIC_ERROR_MESSAGE = 'Não foi possível salvar a Oferta. Tente novamente em instantes.';
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
 * Formulário de Oferta (ADM-006) — usado tanto pra criar quanto editar,
 * sempre inline dentro de `OfferSection` (Oferta não tem página própria,
 * Architecture.md §32). `currency`/`inStock` são sempre preenchidos pelo
 * formulário (nunca omitidos) — evita depender do default do backend
 * (`currency @default("BRL")`) e mantém o corpo enviado sempre completo e
 * previsível; `createOfferRequestSchema` valida normalmente mesmo com os
 * dois presentes, já que `.optional()` também aceita valor.
 */
export function OfferForm({ initialValues, submitLabel, onSubmit, onCancel }: OfferFormProps) {
  const [marketplace, setMarketplace] = useState(initialValues.marketplace);
  const [price, setPrice] = useState(initialValues.price);
  const [currency, setCurrency] = useState(initialValues.currency ?? 'BRL');
  const [affiliateUrl, setAffiliateUrl] = useState(initialValues.affiliateUrl);
  const [inStock, setInStock] = useState(initialValues.inStock ?? true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const parsed = createOfferRequestSchema.safeParse({ marketplace, price, currency, affiliateUrl, inStock });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (
          field === 'marketplace' ||
          field === 'price' ||
          field === 'currency' ||
          field === 'affiliateUrl' ||
          field === 'inStock'
        ) {
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
        <label htmlFor="offer-marketplace">Marketplace</label>
        <select
          id="offer-marketplace"
          value={marketplace}
          onChange={(event) => setMarketplace(event.target.value as OfferFormValues['marketplace'])}
          disabled={isSubmitting}
        >
          {marketplaceSchema.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="offer-price">Preço</label>
        <input
          id="offer-price"
          type="text"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.price ? true : undefined}
          aria-describedby={fieldErrors.price ? 'offer-price-error' : undefined}
        />
        {fieldErrors.price && (
          <p id="offer-price-error" role="alert" className={styles.fieldError}>
            {fieldErrors.price}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="offer-currency">Moeda</label>
        <input
          id="offer-currency"
          type="text"
          value={currency}
          onChange={(event) => setCurrency(event.target.value)}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="offer-affiliate-url">URL de afiliado</label>
        <input
          id="offer-affiliate-url"
          type="text"
          value={affiliateUrl}
          onChange={(event) => setAffiliateUrl(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.affiliateUrl ? true : undefined}
          aria-describedby={fieldErrors.affiliateUrl ? 'offer-affiliate-url-error' : undefined}
        />
        {fieldErrors.affiliateUrl && (
          <p id="offer-affiliate-url-error" role="alert" className={styles.fieldError}>
            {fieldErrors.affiliateUrl}
          </p>
        )}
      </div>

      <div className={styles.checkboxField}>
        <input
          id="offer-in-stock"
          type="checkbox"
          checked={inStock}
          onChange={(event) => setInStock(event.target.checked)}
          disabled={isSubmitting}
        />
        <label htmlFor="offer-in-stock">Em estoque</label>
      </div>

      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Salvando...' : submitLabel}
        </button>
        <button type="button" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
