import { SetMetadata } from '@nestjs/common';

export interface RateLimitOptions {
  /** Número máximo de requisições permitidas dentro da janela. */
  limit: number;
  /** Duração da janela, em milissegundos. */
  windowMs: number;
}

export const RATE_LIMIT_METADATA_KEY = 'rateLimit:options';

/**
 * Valida a configuração antes de virar metadata: erro de configuração (ex.:
 * `limit: 0`, `windowMs: -1000`) falha alto e cedo, na inicialização do
 * módulo onde o decorator é aplicado — não silenciosamente em runtime, na
 * primeira requisição.
 */
function assertValidRateLimitOptions(options: RateLimitOptions): void {
  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error(
      `@RateLimit: "limit" deve ser um inteiro maior que zero (recebido: ${options.limit}).`,
    );
  }

  if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
    throw new Error(
      `@RateLimit: "windowMs" deve ser um número finito maior que zero (recebido: ${options.windowMs}).`,
    );
  }
}

/**
 * Decorator opcional (INF-007) que anexa a configuração de rate limit
 * (`limit`/`windowMs`) a um handler ou controller. Lido depois pelo
 * `RateLimitGuard` via `Reflector`.
 *
 * Sem este decorator numa rota, o `RateLimitGuard` deixa a requisição
 * passar — não há limite configurado, nada a aplicar.
 *
 * Uso (aplicação real fica para quando existir a rota, ex.: login/redirect
 * na Fase 5/9 — fora do escopo desta tarefa):
 *
 * ```ts
 * @RateLimit({ limit: 5, windowMs: 60_000 })
 * @UseGuards(RateLimitGuard)
 * @Post('login')
 * login() { ... }
 * ```
 */
export const RateLimit = (options: RateLimitOptions) => {
  assertValidRateLimitOptions(options);
  return SetMetadata(RATE_LIMIT_METADATA_KEY, options);
};
