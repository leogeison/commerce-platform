import { z } from 'zod';

/**
 * UXA-005A — error map do Zod configurado exclusivamente no boundary do
 * Admin (alternativa (c), aprovada). Resolve mensagens amigáveis em PT-BR a
 * partir da informação ESTRUTURAL que o próprio Zod já computou para a issue
 * (`code`, `path`, metadados como `origin`/`minimum`) — nunca a partir do
 * texto técnico de `issue.message`, e nunca reimplementando a regra de
 * validação que já vive no schema (`packages/contracts`).
 *
 * Passado via `{ error: adminZodErrorMap }`, funciona identicamente:
 * - como `schemaOptions` de `zodResolver(schema, { error: adminZodErrorMap })`
 *   (formulários RHF, ex.: `CategoryForm`);
 * - como opção de `schema.safeParse(values, { error: adminZodErrorMap })`
 *   (formulários que ainda resolvem manualmente, ex.: Produto/Autor/Artigo
 *   hoje).
 * Ambos os pontos de integração aceitam a mesma opção nativa do Zod 4
 * (`ParseContext.error`), porque a resolução acontece em tempo de parse —
 * antes de qualquer redução que descarte metadados (ex.: a que o
 * `zodResolver` aplica ao preencher `formState.errors`).
 *
 * Nesta tarefa (UXA-005A), Categoria é o único consumidor conectado. Os
 * únicos casos tratados abaixo são os que `createCategoryRequestSchema`
 * realmente produz e exercita hoje: `too_small` (origem `string`) em `name`
 * e `slug`, ambos `z.string().min(1)`. Nenhum caso de Produto, Autor ou
 * Artigo foi antecipado nesta tarefa.
 *
 * Resultado real (UXA-013/UXA-015, gate UXA-016): nenhuma extensão foi
 * necessária. `name` de Produto e de Autor tem a mesma constraint
 * (`min(1)`) já coberta pela entrada `name` abaixo, então os dois
 * reaproveitam a mensagem existente sem alteração neste arquivo. `slug` de
 * Produto reaproveita a entrada `slug`, também inalterada. Os demais campos
 * de Produto/Autor (`categoryId`, `description`, `bio`, `avatarUrl`) nunca
 * disparam `too_small` na prática — nenhum tem `.min()`, ou nunca são
 * preenchidos por um controle nativo digitável. Oferta (`OfferForm`,
 * UXA-014) não usa este error map para `price`/`affiliateUrl`: essas
 * mensagens já vêm em PT-BR do próprio schema de contrato
 * (`offerPriceSchema`/`affiliateUrlSchema`), que tem precedência.
 *
 * Tipagem: `adminZodErrorMap` é anotado com o tipo público exportado pelo
 * próprio Zod (`z.core.$ZodErrorMap`) — não existe representação manual
 * paralela de `ZodIssue` neste arquivo.
 */

const FIELD_LABELS: Record<string, string> = {
  name: 'nome',
  slug: 'slug',
};

const GENERIC_FALLBACK_MESSAGE = 'Valor inválido. Verifique o campo e tente novamente.';

/**
 * Deriva a mensagem de `too_small` a partir do `minimum` real que o Zod
 * calculou para a issue — não de um valor duplicado à parte. Se o schema de
 * Categoria mudar de `.min(1)` para `.min(3)`, esta função passa a produzir
 * "pelo menos 3 caracteres" automaticamente, sem precisar de alteração
 * manual aqui.
 */
function tooSmallStringMessage(minimum: number | bigint, fieldLabel: string): string {
  const numericMinimum = typeof minimum === 'bigint' ? Number(minimum) : minimum;

  if (numericMinimum <= 1) {
    return `Informe o ${fieldLabel}.`;
  }

  return `O ${fieldLabel} precisa ter pelo menos ${numericMinimum} caracteres.`;
}

interface FieldMessageResolvers {
  too_small?: (minimum: number | bigint, fieldLabel: string) => string;
}

const FIELD_MESSAGE_RESOLVERS: Record<string, FieldMessageResolvers> = {
  name: {
    too_small: tooSmallStringMessage,
  },
  slug: {
    too_small: tooSmallStringMessage,
  },
};

export const adminZodErrorMap: z.core.$ZodErrorMap = (issue) => {
  const field = typeof issue.path?.[0] === 'string' ? issue.path[0] : undefined;
  const fieldLabel = field ? FIELD_LABELS[field] : undefined;
  const resolvers = field ? FIELD_MESSAGE_RESOLVERS[field] : undefined;

  if (resolvers && fieldLabel && issue.code === 'too_small' && issue.origin === 'string') {
    return resolvers.too_small?.(issue.minimum, fieldLabel) ?? GENERIC_FALLBACK_MESSAGE;
  }

  return GENERIC_FALLBACK_MESSAGE;
};
