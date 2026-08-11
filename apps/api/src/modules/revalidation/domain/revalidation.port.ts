import type { RevalidateRequest } from '@commerce-platform/contracts';

/**
 * Porta de domínio para revalidação de cache do site público. Mesmo molde
 * de `uploads/domain/storage.port.ts`/`identity/domain/password-hasher.ts`:
 * `Symbol` como token de injeção + interface pura, sem import de
 * `@nestjs/*`, para quem consome nunca precisar saber que a implementação
 * concreta faz uma chamada HTTP.
 */
export const REVALIDATION_PORT = Symbol('RevalidationPort');

export interface RevalidationPort {
  revalidate(input: RevalidateRequest): Promise<void>;
}
