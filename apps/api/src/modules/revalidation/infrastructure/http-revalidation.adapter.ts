import type { RevalidateRequest } from '@commerce-platform/contracts';
import type { RevalidationPort } from '../domain/revalidation.port';

const REVALIDATION_SECRET_HEADER = 'x-revalidation-secret';
const REVALIDATION_TIMEOUT_MS = 5_000;

/**
 * Chama o endpoint interno de revalidação do deployment FastCompre.
 * `targetUrl`/`secret` chegam via construtor, já resolvidos — a classe fica
 * agnóstica de `ConfigService`/Nest e trivial de testar com um `fetch`
 * fake, sem rede real (mesmo raciocínio de `S3StorageAdapter`).
 *
 * Só propaga falhas (status não-2xx, erro de rede, timeout) — decidir o
 * que fazer com uma falha (logar sem reverter a alteração já persistida,
 * por exemplo) é responsabilidade de quem consome esta porta, não dela.
 */
export class HttpRevalidationAdapter implements RevalidationPort {
  constructor(
    private readonly targetUrl: string,
    private readonly secret: string,
  ) {}

  async revalidate(input: RevalidateRequest): Promise<void> {
    const url = new URL('/api/internal/revalidate', this.targetUrl);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [REVALIDATION_SECRET_HEADER]: this.secret,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(REVALIDATION_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Revalidação falhou com status ${response.status}.`);
    }
  }
}
