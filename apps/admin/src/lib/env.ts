import { z } from 'zod';

/**
 * Configuração server/client de `apps/admin` (ADM-001).
 *
 * Sem `import 'server-only'`, ao contrário de `apps/fastcompre/src/lib/env.ts`
 * — este módulo é importado por `api-client.ts`, que roda no navegador
 * (chamadas autenticadas via `credentials: 'include'`, Alternativa B
 * aprovada). `NEXT_PUBLIC_API_URL` é o prefixo exigido pelo Next.js para que
 * o valor seja inlinado no bundle do cliente; referenciado sempre de forma
 * estática (`process.env.NEXT_PUBLIC_API_URL`, nunca indexado
 * dinamicamente) para que o bundler consiga substituí-lo em build-time.
 *
 * Validada com Zod no momento em que este módulo é importado — mesma
 * disciplina de `apps/fastcompre/src/lib/env.ts`: falha imediata e clara se
 * `NEXT_PUBLIC_API_URL` estiver ausente/inválida, em vez de um erro obscuro
 * mais adiante.
 */

/**
 * Só a origem (`protocol://host[:port]`), sem path/query/hash — usada como
 * base para `${env.NEXT_PUBLIC_API_URL}${path}` em `api-client.ts`. Mesmo
 * critério de `originUrlSchema` em `apps/fastcompre/src/lib/env.ts`:
 * `new URL(value).pathname === '/'` cobre tanto "sem barra final" quanto
 * "com uma única barra final" (o `URL` nativo normaliza os dois para `/`);
 * qualquer path/query/hash além disso é rejeitado.
 *
 * `.transform` normaliza o valor final removendo toda barra final —
 * garantindo que `env.NEXT_PUBLIC_API_URL` nunca termine em `/`, para que a
 * concatenação com `path` (que sempre começa com `/`) em `api-client.ts`
 * nunca produza barra dupla (`.../ /admin/...`).
 */
const apiUrlSchema = z
  .string()
  .url()
  .refine(
    (value) => {
      try {
        const url = new URL(value);
        return url.pathname === '/' && url.search === '' && url.hash === '';
      } catch {
        return false;
      }
    },
    {
      message:
        'NEXT_PUBLIC_API_URL deve ser só a origem (protocol://host[:port]), sem path/query/hash.',
    },
  )
  .transform((value) => value.replace(/\/+$/, ''));

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: apiUrlSchema,
});

export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
