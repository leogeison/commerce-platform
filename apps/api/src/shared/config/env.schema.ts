import { z } from 'zod';

/**
 * Variáveis de ambiente obrigatórias da API nesta fase do projeto.
 *
 * Escopo da DB-002: apenas DATABASE_URL, segredo de sessão e segredo de
 * revalidação. Novas variáveis (ex.: credenciais de storage, Redis) entram
 * quando a tarefa que as introduz chegar — não antecipadas aqui.
 */
// `.passthrough()` é obrigatório aqui: por padrão, z.object() descarta (strip)
// qualquer chave não declarada no schema. Como validateEnv recebe o
// `process.env` inteiro (PATH, NODE_ENV, PORT, HOME etc.), um schema
// "fechado" devolveria ao ConfigModule só as 3 chaves abaixo — apagando
// silenciosamente todas as outras variáveis de ambiente do processo.
export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
    SESSION_SECRET: z
      .string()
      .min(16, 'SESSION_SECRET deve ter pelo menos 16 caracteres'),
    REVALIDATION_SECRET: z
      .string()
      .min(16, 'REVALIDATION_SECRET deve ter pelo menos 16 caracteres'),
  })
  .passthrough();

export type EnvVars = z.infer<typeof envSchema>;

/**
 * Valida `process.env` (ou qualquer objeto de configuração equivalente)
 * contra o schema acima, lançando um erro com mensagem clara — listando
 * cada variável ausente ou inválida — em vez do stack trace bruto do Zod.
 */
export function validateEnv(config: Record<string, unknown>): EnvVars {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Configuração de ambiente inválida. Corrija e reinicie a API:\n${issues}`,
    );
  }

  return result.data;
}
