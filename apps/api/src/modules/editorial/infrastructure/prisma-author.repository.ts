import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { Author } from '../../../generated/prisma/client';

export interface CreateAuthorInput {
  siteId: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  userId?: string;
}

export type CreateAuthorRepositoryResult =
  | { ok: true; author: Author }
  | { ok: false; reason: 'USER_ALREADY_HAS_AUTHOR' }
  | { ok: false; reason: 'USER_NOT_FOUND' };

export interface FindManyBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
}

export interface FindManyBySiteResult {
  items: Author[];
  total: number;
}

export type DeleteAuthorRepositoryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_ARTICLES' };

/**
 * Nome real, gerado pela migration (`20260728150323_init/migration.sql`),
 * da FK de `Author.userId` para `User.id`. Único jeito confiável de
 * confirmar que um `P2003` é especificamente sobre `userId` — `Author`
 * também tem `Author_siteId_fkey` (para `Site`), então não é seguro
 * assumir que todo `P2003` em `create()` é sobre `userId` (diferente de
 * `PrismaCategoryRepository`/`PrismaProductRepository`, onde só existe uma
 * FK opcional alcançável por `create()`).
 */
const USER_FOREIGN_KEY_CONSTRAINT = 'Author_userId_fkey';

/**
 * Repository concreto (Prisma) de `Author` (EDT-001). `PrismaAuthorRepository`,
 * mesmo padrão de `PrismaCategoryRepository`/`PrismaProductRepository`:
 * classe concreta dependente do Prisma, sem interface/porta própria — só
 * existe uma implementação plausível hoje. Primeiro método: `create()`
 * (`EDT-002` a `EDT-005` entram junto com as tarefas correspondentes).
 *
 * `create()` reativo, sem pré-checagem de `userId` (mesma estratégia já
 * usada em `PrismaCategoryRepository.create()`/`PrismaProductRepository.create()`
 * para slug/`categoryId` — evita corrida entre checar e inserir), traduzindo
 * dois erros do Postgres — **mas só quando a constraint específica é
 * identificada com segurança**, decisão explícita desta tarefa após a
 * correção do desenho:
 *
 * - `P2002` em `@@unique([siteId, userId])` → `USER_ALREADY_HAS_AUTHOR`,
 *   só quando os nomes de coluna resolvidos por `readUniqueConstraintFields`
 *   abaixo forem **exatamente** `siteId` e `userId` (nenhum a mais, nenhum
 *   a menos). `Author` também tem `@@unique([id, siteId])`, mas essa nunca
 *   colide num `create` normal (`id` é gerado) — mesmo raciocínio já
 *   documentado em `PrismaCategoryRepository`. Ainda assim, não presumimos:
 *   se os campos não baterem exatamente com `siteId`/`userId`, o erro sobe
 *   sem tradução, em vez de mascarar um conflito de unicidade inesperado
 *   como `USER_ALREADY_HAS_AUTHOR`.
 * - `P2003` na FK `Author.user` → `USER_NOT_FOUND`, só quando o nome da
 *   constraint (`error.meta.driverAdapterError.cause.constraint.index`, ver
 *   `readForeignKeyConstraintName` abaixo) for exatamente
 *   `Author_userId_fkey`. A FK de `siteId` → `Site` não deveria falhar
 *   aqui (o `siteId` usado já foi validado pelo `SiteAuthorizationGuard`,
 *   mesmo critério de `PrismaProductRepository.create()`), mas se algum
 *   dia falhar — ou se a constraint não puder ser identificada — o erro
 *   sobe para o filtro global de exceções, nunca é mascarado como
 *   `USER_NOT_FOUND`.
 *
 * **Histórico da decisão (`P2002`), duas rodadas de correção:**
 *
 * 1. Primeira versão lia `error.meta.driverAdapterError.cause.constraint.fields`,
 *    por analogia com o que funcionou para `P2003` — suposição baseada só
 *    em leitura estática do `@prisma/adapter-pg`, nunca confirmada. Rodando
 *    o e2e contra Postgres real, "userId duplicado" (`P2002`) voltou `500`
 *    em vez de `409` — errado para este caso (só `P2003` bateu).
 * 2. Segunda versão passou a extrair os nomes de coluna de `error.message`
 *    via regex, usando o texto observado nesse primeiro teste real:
 *    `"Unique constraint failed on the fields: (\`siteId\`, \`userId\`)"`.
 *    Um segundo e2e real revelou que o Postgres/Prisma desta instalação
 *    formata os nomes com crase **e** aspas duplas combinadas —
 *    `` (`"siteId"`, `"userId"`) `` — e o regex de normalização da versão
 *    anterior só removia um caractere de pontuação de cada lado, deixando
 *    `"siteId"` (com aspas) em vez de `siteId`, o que nunca batia com o
 *    `includes('siteId')` esperado. `500` de novo, mesma causa raiz:
 *    continuar validando uma suposição de formato só até o próximo teste
 *    real provar o contrário.
 *
 * **Versão atual** (`readUniqueConstraintFields`): tenta primeiro
 * `error.meta.target` (quando existir como lista de strings — não
 * confirmado que o Prisma 7 com driver adapter o preenche, mas é o campo
 * historicamente documentado do Prisma para `P2002`, e ler antes da
 * mensagem é estritamente mais seguro caso ele exista). Se ausente, cai
 * para `error.message`, capturando o conteúdo entre os parênteses e
 * normalizando cada nome removendo **qualquer combinação e repetição**
 * de crase/aspa dupla/aspa simples/espaço nas bordas (não só um caractere)
 * — cobre `` `siteId` ``, `"siteId"` e `` `"siteId"` `` com a mesma regra.
 * `readForeignKeyConstraintName` (`P2003`) não foi tocada em nenhuma das
 * duas rodadas — os testes reais confirmaram que já funciona.
 *
 * Nada disso é contrato público estável do Prisma (nem `meta.target` tem
 * garantia documentada para Prisma 7 com driver adapters, nem o texto de
 * `error.message`) — por isso a checagem final em `create()` continua
 * exigindo bater **exatamente** `siteId` + `userId`, nada a mais: qualquer
 * formato futuro diferente (inclusive um terceiro jeito de pontuar os
 * nomes) resulta em `undefined`/conjunto diferente, e o erro sobe sem
 * tradução em vez de arriscar uma tradução errada de novo.
 */
@Injectable()
export class PrismaAuthorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateAuthorInput): Promise<CreateAuthorRepositoryResult> {
    try {
      const author = await this.prisma.author.create({
        data: {
          siteId: input.siteId,
          name: input.name,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
          userId: input.userId,
        },
      });

      return { ok: true, author };
    } catch (err) {
      if (isErrorWithCode(err, 'P2002')) {
        const fields = readUniqueConstraintFields(err);
        if (fields?.length === 2 && fields.includes('siteId') && fields.includes('userId')) {
          return { ok: false, reason: 'USER_ALREADY_HAS_AUTHOR' };
        }

        throw err;
      }

      if (isErrorWithCode(err, 'P2003')) {
        const constraintName = readForeignKeyConstraintName(err);
        if (constraintName === USER_FOREIGN_KEY_CONSTRAINT) {
          return { ok: false, reason: 'USER_NOT_FOUND' };
        }

        throw err;
      }

      throw err;
    }
  }

  /**
   * Lista paginada de `Author` de um Site (EDT-002). Mesmo padrão de
   * `PrismaCategoryRepository.findManyBySite` (CAT-002): `findMany` +
   * `count` no mesmo `where` via `prisma.$transaction([...])` (mesmo
   * snapshot consistente entre as duas consultas), ordenação
   * determinística `name asc, id asc` (mesmo critério de desempate já
   * usado em Categoria/Produto/Oferta).
   *
   * `where` é só `{ siteId }`, sem campo opcional — `EDT-002` ("sem
   * filtro") não tem nenhum filtro equivalente a `archived`/`categoryId`
   * de Categoria/Produto: `Author` nem tem `archivedAt` no schema.
   */
  async findManyBySite(input: FindManyBySiteInput): Promise<FindManyBySiteResult> {
    const where = { siteId: input.siteId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.author.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.author.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Busca um `Author` por `id`, restrito ao Site (EDT-003). `findUnique`
   * pela chave composta `id_siteId` (gerada pelo Prisma a partir de
   * `@@unique([id, siteId])` do schema) — mesmo padrão de
   * `PrismaCategoryRepository.findOneBySite` (CAT-003). Um `id` real de
   * Author de outro Site nunca bate nessa chave composta, então retorna
   * `null` do mesmo jeito que um `id` inexistente — quem chama nunca
   * distingue os dois casos, sempre um `404` genérico (mesmo raciocínio
   * de isolamento já usado em Categoria/Produto/Oferta).
   */
  async findOneBySite(siteId: string, id: string): Promise<Author | null> {
    return this.prisma.author.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Exclui fisicamente um `Author` do Site (EDT-005). Reativa, sem
   * pré-checagem de Artigo vinculado — mesmo raciocínio já usado em
   * `PrismaCategoryRepository.deleteBySite` (CAT-007): tenta o `delete`
   * direto pela chave composta `id_siteId` e traduz o erro do
   * Postgres/Prisma, evitando corrida entre checar "nenhum Artigo
   * vinculado" e um Artigo ser criado logo depois.
   *
   * Diferente de `create()` (duas constraints alcançáveis, exigiu
   * distinguir qual violou), aqui só existe uma FK entrante alcançável por
   * `delete()`: `Article.author` (`Article_authorId_siteId_fkey`,
   * `onDelete: Restrict`) — `Author.user`/`Author.site` são FKs *saindo*
   * de `Author`, nunca bloqueiam a exclusão dele. Por isso qualquer
   * `P2003` aqui é sempre "Artigo vinculado", sem precisar inspecionar
   * `meta`/mensagem (mesmo critério de `PrismaCategoryRepository.deleteBySite`
   * pra `HAS_PRODUCTS`).
   *
   * `P2025` é "registro não encontrado" — cobre tanto `id` inexistente
   * quanto `id` de um Author de outro Site (a chave composta `id_siteId`
   * nunca bate), mesmo critério de isolamento já usado em `findOneBySite`.
   */
  async deleteBySite(siteId: string, id: string): Promise<DeleteAuthorRepositoryResult> {
    try {
      await this.prisma.author.delete({
        where: { id_siteId: { id, siteId } },
      });

      return { ok: true };
    } catch (err) {
      if (isErrorWithCode(err, 'P2025')) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      if (isErrorWithCode(err, 'P2003')) {
        return { ok: false, reason: 'HAS_ARTICLES' };
      }

      throw err;
    }
  }
}

function isErrorWithCode(err: unknown, code: string): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === code
  );
}

/**
 * Navega defensivamente até `error.meta.driverAdapterError.cause.constraint`
 * — ver a explicação completa na documentação de `PrismaAuthorRepository`.
 * Cada nível é checado com `typeof`/`in` antes de descer; qualquer desvio
 * do formato esperado interrompe e devolve `undefined`.
 */
function readDriverConstraint(err: unknown): Record<string, unknown> | undefined {
  if (typeof err !== 'object' || err === null || !('meta' in err)) {
    return undefined;
  }

  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('driverAdapterError' in meta)) {
    return undefined;
  }

  const driverAdapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof driverAdapterError !== 'object' || driverAdapterError === null || !('cause' in driverAdapterError)) {
    return undefined;
  }

  const cause = (driverAdapterError as { cause?: unknown }).cause;
  if (typeof cause !== 'object' || cause === null || !('constraint' in cause)) {
    return undefined;
  }

  const constraint = (cause as { constraint?: unknown }).constraint;
  return typeof constraint === 'object' && constraint !== null
    ? (constraint as Record<string, unknown>)
    : undefined;
}

/**
 * Nomes de coluna de uma violação `P2002` — `error.meta.target` quando
 * existir como lista de strings, senão o conteúdo entre parênteses de
 * `error.message` (ver o histórico de decisão na documentação de
 * `PrismaAuthorRepository`). Cada nome é normalizado por
 * `normalizeConstraintFieldName`. Formato desconhecido (nem `meta.target`
 * utilizável nem mensagem no padrão esperado) devolve `undefined` — nunca
 * lança, nunca inventa uma lista de campos.
 *
 * Exportada (não só uso interno) para o teste unitário
 * `prisma-author.repository.spec.ts` cobrir diretamente as variações de
 * pontuação já observadas em produção, sem precisar de Postgres real.
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
  return rawFields
    .map(normalizeConstraintFieldName)
    .filter((field) => field.length > 0);
}

/**
 * Remove **qualquer combinação e repetição** de crase, aspas duplas,
 * aspas simples e espaços das bordas de um nome de coluna — não só um
 * caractere de cada lado. Necessário porque o formato observado em
 * produção combina crase e aspa dupla no mesmo nome (`` `"siteId"` ``); um
 * `replace` que removesse só um caractere de pontuação por borda (versão
 * anterior desta função) deixava `"siteId"` com as aspas ainda presas,
 * que nunca batia com o `siteId` esperado.
 */
function normalizeConstraintFieldName(rawField: string): string {
  return rawField.trim().replace(/^[`"'\s]+|[`"'\s]+$/g, '');
}

/** Nome da constraint/índice de uma violação `P2003` (`constraint.index`), quando o driver adapter o expuser. */
function readForeignKeyConstraintName(err: unknown): string | undefined {
  const constraint = readDriverConstraint(err);
  const index = constraint?.index;
  return typeof index === 'string' ? index : undefined;
}
