import { Injectable, PipeTransform, UnprocessableEntityException } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Pipe genérico de validação (INF-003): recebe o schema Zod exportado por
 * `packages/contracts` e valida o payload contra ele antes de qualquer
 * caso de uso rodar — `PipeTransform` executa na resolução dos argumentos
 * do handler, antes do corpo do controller. Só garante forma (estrutura),
 * nunca significado de negócio — isso continua sendo do domínio/application.
 *
 * O schema nunca é redefinido aqui: quem usa este pipe sempre importa o
 * schema real de `packages/contracts` e passa no construtor. Trocar o
 * schema do contrato muda a validação sem tocar neste arquivo.
 *
 * Falha de validação vira `UnprocessableEntityException` (422) — o
 * `AllExceptionsFilter` (INF-001) já converte qualquer `HttpException` em
 * `ApiError`, então este pipe não precisa (e não deve) montar esse envelope
 * sozinho.
 *
 * Uso: `@Body(new ZodValidationPipe(someContractSchema)) body: SomeType`.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
        .join('; ');

      throw new UnprocessableEntityException(`Payload inválido: ${issues}`);
    }

    return result.data;
  }
}
