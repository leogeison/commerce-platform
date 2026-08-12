'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginRequest,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';
import styles from './login.module.css';

type FieldErrors = Partial<Record<keyof LoginRequest, string>>;

const GENERIC_ERROR_MESSAGE = 'Não foi possível entrar. Tente novamente em instantes.';
const RATE_LIMIT_MESSAGE =
  'Muitas tentativas seguidas. Aguarde um instante antes de tentar novamente.';

/**
 * Traduz `AdminApiError` para uma mensagem segura de exibir ao usuário
 * (ADM-002). `401` reaproveita `error.message` — já é a mensagem genérica
 * que a própria API produz (`AuthController.login`, "Credenciais
 * inválidas.", nunca distingue e-mail de senha). `429` (rate limit) recebe
 * mensagem própria, fixa, em vez do texto cru da API. Qualquer outro caso
 * (`422`, `500`, `INVALID_RESPONSE_SHAPE`, falha de rede/JSON) cai na
 * mensagem genérica — nunca expõe detalhe interno.
 */
function resolveErrorMessage(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.statusCode === 401) {
      return error.message;
    }
    if (error.statusCode === 429) {
      return RATE_LIMIT_MESSAGE;
    }
  }
  return GENERIC_ERROR_MESSAGE;
}

/**
 * Único Client Component da tela de login (ADM-002). Chama exclusivamente
 * `POST /admin/auth/login` via `apiRequest` (`ADM-001`, `credentials:
 * 'include'` — o navegador guarda o cookie `HttpOnly` da API
 * automaticamente; este componente nunca lê nem manipula cookie).
 *
 * `loginRequestSchema.safeParse` valida antes de qualquer chamada de rede
 * — mesma fonte de verdade do body aceito pela API, sem regra duplicada.
 * `loginResponseSchema` valida a resposta de sucesso via `apiRequest`, mas
 * o `user` retornado não é usado aqui: o próximo destino (`/`) ainda é o
 * placeholder do `MONO-006` até `ADM-003` existir.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);

    const parsed = loginRequestSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' || field === 'password') {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      await apiRequest('/admin/auth/login', loginResponseSchema, {
        method: 'POST',
        body: parsed.data,
      });
      router.replace('/');
    } catch (error) {
      setFormError(resolveErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <div className={styles.field}>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.email ? true : undefined}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
        {fieldErrors.email && (
          <p id="email-error" role="alert" className={styles.fieldError}>
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={isSubmitting}
          aria-invalid={fieldErrors.password ? true : undefined}
          aria-describedby={fieldErrors.password ? 'password-error' : undefined}
        />
        {fieldErrors.password && (
          <p id="password-error" role="alert" className={styles.fieldError}>
            {fieldErrors.password}
          </p>
        )}
      </div>

      {formError && (
        <p role="alert" className={styles.formError}>
          {formError}
        </p>
      )}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
