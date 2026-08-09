/**
 * Erro único da fronteira HTTP do cliente da API pública (WEB-001).
 * Deliberadamente mínimo — sem subclasses nem hierarquia: preserva só o que
 * a fronteira HTTP realmente carrega (`statusCode`/`code`, extraídos do
 * `ApiError` de `@commerce-platform/contracts` quando disponíveis) e usa
 * `cause` nativo (`Error.cause`) para anexar o erro original (ex.: um
 * `ZodError` de resposta fora do contrato) sem inventar um campo próprio.
 */
export class PublicApiError extends Error {
  readonly statusCode?: number;
  readonly code?: string;

  constructor(message: string, options?: { statusCode?: number; code?: string; cause?: unknown }) {
    super(message, { cause: options?.cause });
    this.name = 'PublicApiError';
    this.statusCode = options?.statusCode;
    this.code = options?.code;
  }
}
