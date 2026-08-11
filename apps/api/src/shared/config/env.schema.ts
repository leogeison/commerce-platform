import { z } from 'zod';

/**
 * Restringe uma URL a só sua origem (`protocol://host[:port]`, com `/`
 * final opcional) — usada por toda variável de ambiente que vira a base de
 * um `new URL(path, valor)`. Sem essa restrição, um valor com path (ex.:
 * `https://exemplo.com/base`) faria esse path desaparecer silenciosamente
 * na resolução do `new URL()`, em vez de gerar um erro claro na validação.
 * Implementação local a este arquivo — mesma necessidade já resolvida de
 * forma equivalente (mas separadamente) do lado do FastCompre.
 */
function originUrlSchema(message: string) {
  return z.string().url(message).refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.pathname === '/' && url.search === '' && url.hash === '';
      } catch {
        return false;
      }
    },
    { message },
  );
}

/**
 * Variáveis de ambiente obrigatórias da API nesta fase do projeto.
 *
 * Escopo da DB-002: apenas DATABASE_URL, segredo de sessão e segredo de
 * revalidação. Variáveis de storage (UPL-008/UPL-009) entraram quando a
 * tarefa que as introduziu chegou — mesmo princípio para qualquer variável
 * futura (ex.: Redis): não antecipada aqui.
 */
// `.passthrough()` é obrigatório aqui: por padrão, z.object() descarta (strip)
// qualquer chave não declarada no schema. Como validateEnv recebe o
// `process.env` inteiro (PATH, NODE_ENV, PORT, HOME etc.), um schema
// "fechado" devolveria ao ConfigModule só as chaves abaixo — apagando
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
    // Origem exata do apps/admin — único valor aceito pelo CORS restritivo
    // (INF-005). CORS de rotas públicas, mais permissivo, é tratado à parte
    // quando existir.
    ADMIN_ORIGIN: z.string().url('ADMIN_ORIGIN deve ser uma URL válida'),
    // Origem do deployment FastCompre chamado pelo adapter de revalidação
    // (Seção 21 do Architecture.md) — POST {REVALIDATION_TARGET_URL}/api/internal/revalidate.
    // Necessária para a API subir, mesmo antes de qualquer módulo consumir
    // o adapter de revalidação: `envSchema` valida todas as variáveis
    // declaradas de uma vez, não só as já usadas por algum provider ativo.
    REVALIDATION_TARGET_URL: originUrlSchema(
      'REVALIDATION_TARGET_URL deve ser só a origem (protocol://host[:port]), sem path/query/hash.',
    ),
    // Storage S3-compatível (UPL-008/UPL-009; Architecture.md, Seção 29) —
    // não presume nenhum provedor específico (AWS S3, R2, Spaces, MinIO
    // servem igualmente, desde que configurados aqui).
    STORAGE_S3_BUCKET: z.string().min(1, 'STORAGE_S3_BUCKET é obrigatória'),
    STORAGE_S3_REGION: z.string().min(1, 'STORAGE_S3_REGION é obrigatória'),
    // Base da URL pública usada para montar a resposta `{ url }` do upload
    // (`${STORAGE_S3_PUBLIC_URL_BASE}/${fileName}`) — não necessariamente o
    // endpoint de API do provedor (alguns expõem leitura pública num
    // domínio diferente, ex.: `.r2.dev` ou um CDN customizado).
    STORAGE_S3_PUBLIC_URL_BASE: z
      .string()
      .url('STORAGE_S3_PUBLIC_URL_BASE deve ser uma URL válida'),
    // Só necessário para provedores que não são a AWS "de verdade" (R2,
    // MinIO, Spaces); ausente = SDK usa o endpoint padrão da AWS.
    STORAGE_S3_ENDPOINT: z
      .string()
      .url('STORAGE_S3_ENDPOINT deve ser uma URL válida')
      .optional(),
    // Necessário para MinIO (geralmente `true`); AWS/R2 geralmente não
    // precisam. Resolvido para boolean aqui, não como string — quem usa
    // `EnvVars['STORAGE_S3_FORCE_PATH_STYLE']` recebe `boolean` já pronto,
    // sem converter string→boolean em nenhum outro lugar (adapter/factory).
    STORAGE_S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    // Ambas ou nenhuma (validado abaixo via `.superRefine`) — ausentes,
    // deixam o AWS SDK usar sua cadeia padrão de credenciais (útil para S3
    // real com IAM); `min(1)` garante que string vazia nunca é aceita como
    // credencial válida, mesmo padrão de `DATABASE_URL`/`SESSION_SECRET`.
    STORAGE_S3_ACCESS_KEY_ID: z
      .string()
      .min(1, 'STORAGE_S3_ACCESS_KEY_ID não pode ser vazia')
      .optional(),
    STORAGE_S3_SECRET_ACCESS_KEY: z
      .string()
      .min(1, 'STORAGE_S3_SECRET_ACCESS_KEY não pode ser vazia')
      .optional(),
  })
  .passthrough()
  .superRefine((env, ctx) => {
    const hasAccessKeyId = env.STORAGE_S3_ACCESS_KEY_ID !== undefined;
    const hasSecretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY !== undefined;

    if (hasAccessKeyId !== hasSecretAccessKey) {
      const missing = hasAccessKeyId
        ? 'STORAGE_S3_SECRET_ACCESS_KEY'
        : 'STORAGE_S3_ACCESS_KEY_ID';

      ctx.addIssue({
        code: 'custom',
        path: [missing],
        message:
          'STORAGE_S3_ACCESS_KEY_ID e STORAGE_S3_SECRET_ACCESS_KEY devem ser fornecidas juntas ou nenhuma das duas.',
      });
    }
  });

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
