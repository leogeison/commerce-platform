/**
 * Utilitários de leitura defensiva de erros do Prisma (`PrismaClientKnownRequestError`),
 * extraídos de `PrismaAuthorRepository` (EDT-001) para cá quando um segundo
 * consumidor real apareceu (`PrismaArticleRepository`, EDT-006) — mesmo
 * critério já documentado no projeto pra justificar abstração
 * (`PrismaCategoryRepository`: "reaproveitado por CAT-001 a CAT-007...
 * justificado como abstração", não uma interface especulativa). Nenhum
 * comportamento mudou nesta extração, só o local do código.
 *
 * **Histórico da decisão (`P2002`), por que a leitura é dupla (`meta.target`
 * + mensagem), documentado aqui porque agora é compartilhado entre
 * repositories:**
 *
 * 1. Uma primeira versão (só em `PrismaAuthorRepository`) lia
 *    `error.meta.driverAdapterError.cause.constraint.fields` — suposição
 *    baseada em leitura estática do código-fonte do `@prisma/adapter-pg`
 *    instalado (`node_modules/.pnpm/@prisma+adapter-pg@7.9.1/.../dist/index.js`,
 *    função `mapDriverError`), nunca confirmada contra Postgres real.
 *    Rodando o e2e da `EDT-001` contra Postgres real, o cenário "userId
 *    duplicado" (`P2002`) voltou `500` em vez de `409` — a suposição
 *    estava errada para esse caso (só o `P2003` equivalente, via
 *    `readForeignKeyConstraintName`, bateu).
 * 2. Uma segunda versão passou a extrair os nomes de coluna de
 *    `error.message` via regex, usando o texto observado nesse teste real:
 *    `"Unique constraint failed on the fields: (\`siteId\`, \`userId\`)"`.
 *    Um segundo e2e real revelou que essa instalação de Postgres/Prisma
 *    formata os nomes com crase **e** aspas duplas combinadas —
 *    `` (`"siteId"`, `"userId"`) `` — e um `replace` que só removia um
 *    caractere de pontuação por borda deixava `"siteId"` (com aspas) sem
 *    bater com o esperado. `500` de novo, mesma causa raiz: confiar demais
 *    num formato só validado uma vez.
 *
 * **Versão atual**: tenta `error.meta.target` primeiro (campo
 * historicamente documentado do Prisma para `P2002` — não confirmado que
 * o Prisma 7 com driver adapter o preenche, mas ler antes da mensagem é
 * estritamente mais seguro caso ele exista). Se ausente, cai para
 * `error.message`, capturando o conteúdo entre parênteses e normalizando
 * cada nome removendo **qualquer combinação e repetição** de
 * crase/aspa dupla/aspa simples/espaço nas bordas (cobre `` `siteId` ``,
 * `"siteId"` e `` `"siteId"` `` com a mesma regra).
 *
 * Nada disso é contrato público estável do Prisma — por isso todo
 * consumidor destas funções deve exigir bater **exatamente** o conjunto
 * de campos/nome de constraint esperado, nunca presumir, e deixar o erro
 * original subir sem tradução em qualquer formato inesperado.
 */

export function isErrorWithCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

/**
 * Navega defensivamente até `error.meta.driverAdapterError.cause` (Prisma 7
 * + `@prisma/adapter-pg`) — objeto bruto devolvido pelo driver adapter para
 * qualquer erro de Postgres, reconhecido ou não pelo `mapDriverError` dele.
 * Base comum de `readDriverConstraint` (lê `cause.constraint`, usado por
 * `P2003` já reconhecido) e `readDriverErrorCode` (lê `cause.code`, usado
 * por `isForeignKeyConstraintViolation` para o caso `23001`, não
 * reconhecido pelo `mapDriverError`) — mesmo objeto `cause`, campo
 * diferente conforme quem chama. Cada nível é checado com `typeof`/`in`
 * antes de descer; qualquer desvio do formato esperado interrompe e
 * devolve `undefined`.
 */
function readDriverErrorCause(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== 'object' || err === null || !('meta' in err)) {
    return undefined;
  }

  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('driverAdapterError' in meta)) {
    return undefined;
  }

  const driverAdapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (
    typeof driverAdapterError !== 'object' ||
    driverAdapterError === null ||
    !('cause' in driverAdapterError)
  ) {
    return undefined;
  }

  const cause = (driverAdapterError as { cause?: unknown }).cause;
  return typeof cause === 'object' && cause !== null ? (cause as Record<string, unknown>) : undefined;
}

/**
 * `error.meta.driverAdapterError.cause.constraint`, quando presente.
 * Continua exigindo `'constraint' in cause` explicitamente (não só
 * `cause?.constraint`) para preservar o mesmo critério defensivo de
 * antes: ausência da chave é tratada igual a formato inesperado.
 */
function readDriverConstraint(err: unknown): Record<string, unknown> | undefined {
  const cause = readDriverErrorCause(err);
  if (cause === undefined || !('constraint' in cause)) {
    return undefined;
  }

  const constraint = cause.constraint;
  return typeof constraint === 'object' && constraint !== null
    ? (constraint as Record<string, unknown>)
    : undefined;
}

/**
 * `error.meta.driverAdapterError.cause.code` — SQLSTATE bruto do Postgres,
 * preservado pelo driver adapter mesmo quando `mapDriverError`
 * (`@prisma/adapter-pg`) não tem um `case` próprio para aquele código (cai
 * no `default`, que devolve `kind: "postgres"` + `code` original). Usado
 * por `isForeignKeyConstraintViolation` para reconhecer `23001`, que não
 * vira `P2003` — ver o comentário dessa função para o histórico completo.
 */
function readDriverErrorCode(err: unknown): string | undefined {
  const cause = readDriverErrorCause(err);
  const code = cause?.code;
  return typeof code === 'string' ? code : undefined;
}

/**
 * Nomes de coluna de uma violação `P2002` — `error.meta.target` quando
 * existir como lista de strings, senão o conteúdo entre parênteses de
 * `error.message` (ver o histórico de decisão acima). Cada nome é
 * normalizado por `normalizeConstraintFieldName`. Formato desconhecido
 * devolve `undefined` — nunca lança, nunca inventa uma lista de campos.
 *
 * Quem chama deve sempre confirmar que o conjunto devolvido bate
 * **exatamente** com os campos esperados da constraint (nem a mais, nem a
 * menos) antes de traduzir o erro — nunca assumir que qualquer `P2002`
 * pertence à constraint que o chamador tinha em mente.
 */
export function readUniqueConstraintFields(err: unknown): string[] | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }

  const targetFields = readMetaTargetFields(err);
  if (targetFields) {
    return targetFields;
  }

  return readUniqueConstraintFieldsFromMessage(err);
}

/**
 * `error.meta.target`: campo historicamente documentado do Prisma para
 * `P2002` (lista de nomes de coluna). Não confirmado que a combinação
 * Prisma 7 + `@prisma/adapter-pg` o preenche — por isso é só uma tentativa
 * antes do fallback de mensagem, nunca a única fonte assumida.
 */
function readMetaTargetFields(err: unknown): string[] | undefined {
  if (typeof err !== 'object' || err === null || !('meta' in err)) {
    return undefined;
  }

  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) {
    return undefined;
  }

  const target = (meta as { target?: unknown }).target;
  if (!Array.isArray(target) || !target.every((field) => typeof field === 'string')) {
    return undefined;
  }

  const fields = normalizeConstraintFieldNames(target as string[]);
  return fields.length > 0 ? fields : undefined;
}

/**
 * Fallback: extrai o conteúdo entre os parênteses de `error.message` no
 * padrão `"Unique constraint failed on the fields: (...)"`. Os nomes
 * dentro dos parênteses já apareceram, em execuções reais distintas deste
 * projeto, como `` `siteId` ``, `"siteId"` e `` `"siteId"` `` — o split por
 * vírgula não depende de qual dessas formas é usada, só
 * `normalizeConstraintFieldName` precisa lidar com a pontuação.
 */
function readUniqueConstraintFieldsFromMessage(err: unknown): string[] | undefined {
  if (typeof err !== 'object' || err === null || !('message' in err)) {
    return undefined;
  }

  const message = (err as { message?: unknown }).message;
  if (typeof message !== 'string') {
    return undefined;
  }

  const match = message.match(/Unique constraint failed on the fields:\s*\(([^)]*)\)/);
  if (!match?.[1]) {
    return undefined;
  }

  const fields = normalizeConstraintFieldNames(match[1].split(','));
  return fields.length > 0 ? fields : undefined;
}

/**
 * Normaliza uma lista bruta de nomes de coluna (de `meta.target` ou do
 * conteúdo entre parênteses da mensagem), removendo entradas vazias após
 * a limpeza.
 */
function normalizeConstraintFieldNames(rawFields: string[]): string[] {
  return rawFields.map(normalizeConstraintFieldName).filter((field) => field.length > 0);
}

/**
 * Remove **qualquer combinação e repetição** de crase, aspas duplas,
 * aspas simples e espaços das bordas de um nome de coluna — não só um
 * caractere de cada lado. Necessário porque o formato observado em
 * produção combina crase e aspa dupla no mesmo nome (`` `"siteId"` ``); um
 * `replace` que removesse só um caractere de pontuação por borda deixava
 * `"siteId"` com as aspas ainda presas.
 */
function normalizeConstraintFieldName(rawField: string): string {
  return rawField.trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
}

/**
 * Nome da constraint/índice de uma violação `P2003`
 * (`error.meta.driverAdapterError.cause.constraint.index`), quando o
 * driver adapter o expuser. Validado empiricamente contra Postgres real
 * na `EDT-001` (cenário `userId` inexistente → `422`) — diferente do
 * `P2002`, não precisou de correção depois.
 *
 * Quem chama deve sempre confirmar que o nome bate **exatamente** com a
 * constraint esperada antes de traduzir o erro.
 */
export function readForeignKeyConstraintName(err: unknown): string | undefined {
  const constraint = readDriverConstraint(err);
  const index = constraint?.index;
  return typeof index === 'string' ? index : undefined;
}

/**
 * `SQLSTATE` Postgres para `restrict_violation` — devolvido quando um
 * `DELETE`/`UPDATE` viola uma FK declarada com `ON DELETE RESTRICT`
 * (todas as FKs internas deste schema, `schema.prisma`). Diferente de
 * `23503` (`foreign_key_violation`, o único código que `mapDriverError`
 * reconhece e mapeia para `P2003` — sempre o caso em `INSERT`/`UPDATE` com
 * FK inválida, nunca afetado pela ação declarada em `ON DELETE`), `23001`
 * não tem `case` próprio nesse mapeamento.
 */
const POSTGRES_RESTRICT_VIOLATION_SQLSTATE = '23001';

/**
 * `true` para uma violação de foreign key detectável de qualquer um dos
 * dois formatos observados nesta base de código:
 *
 * 1. `P2003` — o código que o Prisma Client atribui quando
 *    `@prisma/adapter-pg` reconhece o erro Postgres (`23503`,
 *    `foreign_key_violation`). Comportamento já conhecido, usado até aqui
 *    nos caminhos de `create`/`update` (ex.: `Author.userId` inexistente).
 * 2. `23001` (`restrict_violation`) no formato bruto do driver adapter —
 *    `error.meta.driverAdapterError.cause.code`. É o código que o Postgres
 *    real efetivamente devolve quando um `delete()` é bloqueado por uma FK
 *    `ON DELETE RESTRICT` (todo `deleteBySite` de Categoria/Produto/Oferta/
 *    Autor). `mapDriverError` não tem `case` para `23001`, então o Prisma
 *    Client nunca atribui `P2003` a esse erro — sem este segundo
 *    reconhecimento, ele sobe sem tradução (`500`), mesmo o Postgres já
 *    tendo bloqueado a operação corretamente por causa do dependente.
 *    Validado empiricamente contra Postgres real (Categoria bloqueada por
 *    Produto).
 *
 * Nenhum outro `SQLSTATE` (`23505` unique, `23502` not-null, `23514`
 * check, ou qualquer erro genérico/objeto malformado) bate em nenhuma das
 * duas checagens — `23001` é uma classe do padrão SQL exclusiva de
 * violação de `RESTRICT`/`NO ACTION` explícito, nunca usada pelo Postgres
 * para nenhum outro tipo de erro.
 */
export function isForeignKeyConstraintViolation(err: unknown): boolean {
  if (isErrorWithCode(err, 'P2003')) {
    return true;
  }

  return readDriverErrorCode(err) === POSTGRES_RESTRICT_VIOLATION_SQLSTATE;
}
