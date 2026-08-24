import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';
import { createCategoryRequestSchema } from '@commerce-platform/contracts';
import { adminZodErrorMap } from './validation-messages';

/**
 * `adminZodErrorMap` — UXA-005A.
 *
 * Estes testes exercitam a função diretamente (unidade) e também através do
 * schema real de Categoria (integração leve, sem UI), para provar dois
 * pontos que os testes de `CategoryForm` sozinhos não isolam claramente:
 * 1) nenhuma mensagem técnica padrão do Zod escapa quando o campo/código é
 *    conhecido (`name`/`slug` + `too_small`);
 * 2) a mensagem usa o `minimum` real da issue, não um valor duplicado à
 *    parte — se o schema mudasse de `.min(1)` para `.min(3)`, a mensagem
 *    mudaria sozinha, sem qualquer edição neste arquivo.
 */
describe('adminZodErrorMap', () => {
  it('Nome vazio (schema real de Categoria): produz "Informe o nome." — nunca o texto técnico do Zod', () => {
    const result = createCategoryRequestSchema.safeParse(
      { name: '', slug: 'valido' },
      { error: adminZodErrorMap },
    );

    expect(result.success).toBe(false);
    const nameIssue = result.error?.issues.find((issue) => issue.path[0] === 'name');
    expect(nameIssue?.message).toBe('Informe o nome.');
    expect(nameIssue?.message).not.toMatch(/Too small/i);
  });

  it('Slug vazio (schema real de Categoria): produz "Informe o slug." — nunca o texto técnico do Zod', () => {
    const result = createCategoryRequestSchema.safeParse(
      { name: 'válido', slug: '' },
      { error: adminZodErrorMap },
    );

    expect(result.success).toBe(false);
    const slugIssue = result.error?.issues.find((issue) => issue.path[0] === 'slug');
    expect(slugIssue?.message).toBe('Informe o slug.');
    expect(slugIssue?.message).not.toMatch(/Too small/i);
  });

  it('usa o `minimum` real da issue (metadado do Zod), sem duplicar a regra do schema', () => {
    // Schema hipotético, só para este teste: não é o schema real de
    // Categoria (que é `.min(1)`) — prova que a mensagem reage ao
    // `minimum` que o Zod calculou, não a um valor hardcoded aqui.
    const hypotheticalSchema = z.object({ name: z.string().min(3) });

    const result = hypotheticalSchema.safeParse({ name: 'ab' }, { error: adminZodErrorMap });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('O nome precisa ter pelo menos 3 caracteres.');
  });

  it('fallback: issue de código não tratado (ex.: invalid_type) recebe a mensagem genérica, nunca `issue.message` técnico do Zod', () => {
    const message = adminZodErrorMap({
      code: 'invalid_type',
      expected: 'string',
      path: ['name'],
      input: 42,
    } as Parameters<typeof adminZodErrorMap>[0]);

    expect(message).toBe('Valor inválido. Verifique o campo e tente novamente.');
  });

  it('fallback: campo desconhecido (fora de name/slug) recebe a mensagem genérica', () => {
    const message = adminZodErrorMap({
      code: 'too_small',
      origin: 'string',
      minimum: 1,
      path: ['description'],
      input: '',
    } as Parameters<typeof adminZodErrorMap>[0]);

    expect(message).toBe('Valor inválido. Verifique o campo e tente novamente.');
  });

  it('fallback: issue sem path (nível raiz) recebe a mensagem genérica', () => {
    const message = adminZodErrorMap({
      code: 'custom',
      path: [],
      input: undefined,
    } as Parameters<typeof adminZodErrorMap>[0]);

    expect(message).toBe('Valor inválido. Verifique o campo e tente novamente.');
  });
});
