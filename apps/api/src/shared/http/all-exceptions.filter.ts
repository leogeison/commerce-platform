import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiError } from '@commerce-platform/contracts';

/**
 * Único ponto de tratamento de erro da API (INF-001). Qualquer exceção que
 * chegue até aqui vira uma resposta no formato `ApiError` (Architecture.md,
 * seção 26) — nunca stack trace ou mensagem interna crua para o cliente.
 *
 * Duas situações:
 * - `HttpException` (lançada pelo Nest, por um guard, ou por um
 *   controller): preserva o status HTTP real e deriva `code`/`message`
 *   dela. Mapear `code` de erros de domínio específicos é responsabilidade
 *   de cada módulo (fora do escopo desta tarefa) — aqui só cobrimos o caso
 *   genérico, com `code` derivado do nome do status HTTP.
 * - Qualquer outra coisa (bug não previsto, exceção não tratada): sempre
 *   500 com `code: "INTERNAL_ERROR"` e mensagem genérica; o erro real só
 *   vai para o log do servidor (via `Logger`), nunca para a resposta.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const details = this.extractDetails(exception);
      const apiError: ApiError = {
        statusCode,
        code: HttpStatus[statusCode] ?? 'HTTP_ERROR',
        error: exception.name,
        message: this.extractMessage(exception),
        ...(details !== undefined ? { details } : {}),
      };

      response.status(statusCode).json(apiError);
      return;
    }

    this.logger.error(exception instanceof Error ? exception.stack : exception);

    const apiError: ApiError = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      error: 'Internal Server Error',
      message: 'Ocorreu um erro inesperado.',
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(apiError);
  }

  private extractMessage(exception: HttpException): string {
    const body = exception.getResponse();

    if (typeof body === 'string') {
      return body;
    }

    const maybeMessage = (body as { message?: string | string[] }).message;

    if (Array.isArray(maybeMessage)) {
      return maybeMessage.join(', ');
    }

    return maybeMessage ?? exception.message;
  }

  private extractDetails(exception: HttpException): unknown {
    const body = exception.getResponse();

    return typeof body === 'string' ? undefined : (body as { details?: unknown }).details;
  }
}
