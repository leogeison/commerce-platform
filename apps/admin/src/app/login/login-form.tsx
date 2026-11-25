'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, CircleAlert, Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import { Button } from '@commerce-platform/ui';
import {
  loginRequestSchema,
  loginResponseSchema,
  type LoginRequest,
} from '@commerce-platform/contracts';
import { apiRequest } from '../../lib/api-client';
import { AdminApiError } from '../../lib/api-error';

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
 *
 * UXP-004 — redesign visual. Autenticação, sessão, validação,
 * redirecionamento e mensagens de erro inalterados. Acrescenta:
 * - controle "Mostrar senha"/"Ocultar senha" (nome acessível dinâmico +
 *   `aria-controls`, sem `aria-pressed`); a senha volta a ficar oculta a
 *   cada envio, e o controle fica desabilitado durante o envio;
 * - foco no primeiro campo inválido quando a validação client-side falha;
 * - `aria-busy` no formulário e ícone de progresso durante o envio;
 * - `name` nos campos (compatibilidade com gerenciadores de senha), com os
 *   mesmos `autoComplete` de antes.
 * Estilo só com tokens semânticos (classes Tailwind), sem hex.
 */
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setFormError(null);
    // A senha nunca permanece visível depois de um envio.
    setIsPasswordVisible(false);

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
      // Foco no primeiro campo inválido, na ordem do formulário.
      if (errors.email) {
        emailRef.current?.focus();
      } else if (errors.password) {
        passwordRef.current?.focus();
      }
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

  const inputClassName =
    'h-12 w-full rounded-control border border-outline bg-surface pl-10 font-ui text-body text-fg placeholder:text-fg-muted focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-[var(--color-feedback-danger-fill)]';
  const iconClassName = 'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted';

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="login-title"
      aria-busy={isSubmitting || undefined}
    >
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="font-ui text-body-sm font-action text-fg">
          E-mail
        </label>
        <div className="relative">
          <Mail aria-hidden="true" className={iconClassName} />
          <input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="nome@exemplo.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            className={`${inputClassName} pr-3`}
          />
        </div>
        {fieldErrors.email && (
          <p id="email-error" role="alert" className="m-0 font-ui text-body-sm text-fg-danger">
            {fieldErrors.email}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="password" className="font-ui text-body-sm font-action text-fg">
          Senha
        </label>
        <div className="relative">
          <Lock aria-hidden="true" className={iconClassName} />
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={isPasswordVisible ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Digite sua senha"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            className={`${inputClassName} pr-12`}
          />
          <button
            type="button"
            aria-label={isPasswordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            aria-controls="password"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            disabled={isSubmitting}
            className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-control text-fg-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 ring-focus disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPasswordVisible ? (
              <EyeOff aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Eye aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        </div>
        {fieldErrors.password && (
          <p id="password-error" role="alert" className="m-0 font-ui text-body-sm text-fg-danger">
            {fieldErrors.password}
          </p>
        )}
      </div>

      {formError && (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-control border border-[var(--color-feedback-danger-fill)] bg-[var(--color-feedback-danger-subtle-bg)] px-3 py-2.5 font-ui text-body-sm text-fg-danger"
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {formError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting} className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2">
        {isSubmitting ? (
          <>
            <Loader2 aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            Entrando...
          </>
        ) : (
          <>
            Entrar
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </>
        )}
      </Button>
    </form>
  );
}
