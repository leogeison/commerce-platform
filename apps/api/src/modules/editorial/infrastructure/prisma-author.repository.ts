import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  isErrorWithCode,
  isForeignKeyConstraintViolation,
  readForeignKeyConstraintName,
  readUniqueConstraintFields,
} from '../../../shared/database/prisma-error.util';
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

export interface UpdateAuthorInput {
  siteId: string;
  id: string;
  name?: string;
  bio?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
}

export type UpdateAuthorRepositoryResult =
  | { ok: true; author: Author }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'USER_ALREADY_HAS_AUTHOR' }
  | { ok: false; reason: 'USER_NOT_FOUND' };

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
 *   (`shared/database/prisma-error.util.ts`) forem **exatamente** `siteId`
 *   e `userId` (nenhum a mais, nenhum a menos). `Author` também tem
 *   `@@unique([id, siteId])`, mas essa nunca colide num `create` normal
 *   (`id` é gerado) — mesmo raciocínio já documentado em
 *   `PrismaCategoryRepository`. Ainda assim, não presumimos: se os campos
 *   não baterem exatamente com `siteId`/`userId`, o erro sobe sem
 *   tradução, em vez de mascarar um conflito de unicidade inesperado como
 *   `USER_ALREADY_HAS_AUTHOR`.
 * - `P2003` na FK `Author.user` → `USER_NOT_FOUND`, só quando o nome da
 *   constraint (`readForeignKeyConstraintName`, mesmo util compartilhado)
 *   for exatamente `Author_userId_fkey`. A FK de `siteId` → `Site` não
 *   deveria falhar aqui (o `siteId` usado já foi validado pelo
 *   `SiteAuthorizationGuard`, mesmo critério de
 *   `PrismaProductRepository.create()`), mas se algum dia falhar — ou se a
 *   constraint não puder ser identificada — o erro sobe para o filtro
 *   global de exceções, nunca é mascarado como `USER_NOT_FOUND`.
 *
 * `readUniqueConstraintFields`/`readForeignKeyConstraintName` moraram
 * neste arquivo até um segundo consumidor real aparecer
 * (`PrismaArticleRepository`, EDT-006) — extraídas para
 * `shared/database/prisma-error.util.ts` nesse momento, sem mudar
 * comportamento. O histórico completo das duas rodadas de correção que
 * levaram ao formato atual (baseadas em e2e reais contra Postgres, não em
 * suposição) está documentado lá, não repetido aqui.
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
   * Atualiza um `Author` do Site (EDT-004). Reativa, um único
   * `prisma.author.update()` pela chave composta `id_siteId` — mesmo
   * critério de `PrismaOfferRepository.updateBySite` (CAT-018): sem
   * pré-checagem, tenta a atualização direto e traduz o erro do
   * Postgres/Prisma.
   *
   * Propagação tri-state: `name`/`bio`/`avatarUrl`/`userId` repassados
   * exatamente como chegam em `input` para `data` — campo omitido
   * (`undefined`) nunca entra na instrução SQL (Prisma ignora chaves
   * `undefined`, coluna preservada); campo `null` explícito limpa a coluna
   * (`bio`/`avatarUrl`) ou remove o vínculo com `User` (`userId`, autor
   * volta a ser convidado); campo com valor define ou troca — trocar de um
   * `User` para outro usa exatamente a mesma instrução, sem tratamento
   * diferente de "vincular pela primeira vez".
   *
   * Traduz os mesmos dois erros de `create()`, com a mesma cautela de só
   * mascarar quando a constraint específica for identificada com
   * segurança — reproduzindo exatamente a mesma regra de tenancy de
   * `userId` já documentada lá (sem checagem de `SiteUser`/membership,
   * decisão de `EDT-001` não revisitada aqui):
   *
   * - `P2025` → `NOT_FOUND` — cobre `id` inexistente e `id` de um Author de
   *   outro Site (a chave composta nunca bate), mesmo critério de
   *   `deleteBySite`/`findOneBySite`.
   * - `P2002` em `@@unique([siteId, userId])` → `USER_ALREADY_HAS_AUTHOR`,
   *   só quando os campos resolvidos por `readUniqueConstraintFields` forem
   *   exatamente `siteId` e `userId`.
   * - `P2003` na FK `Author.user` → `USER_NOT_FOUND`, só quando o nome da
   *   constraint (`readForeignKeyConstraintName`) for exatamente
   *   `Author_userId_fkey`.
   *
   * Qualquer `P2002`/`P2003` que não bata exatamente sobe sem tradução, em
   * vez de ser mascarado.
   */
  async updateBySite(input: UpdateAuthorInput): Promise<UpdateAuthorRepositoryResult> {
    try {
      const author = await this.prisma.author.update({
        where: { id_siteId: { id: input.id, siteId: input.siteId } },
        data: {
          name: input.name,
          bio: input.bio,
          avatarUrl: input.avatarUrl,
          userId: input.userId,
        },
      });

      return { ok: true, author };
    } catch (err) {
      if (isErrorWithCode(err, 'P2025')) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

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
   * violação de FK aqui é sempre "Artigo vinculado", sem precisar
   * inspecionar `meta`/mensagem (mesmo critério de
   * `PrismaCategoryRepository.deleteBySite` pra `HAS_PRODUCTS`). Usa
   * `isForeignKeyConstraintViolation` (não `isErrorWithCode(err, 'P2003')`
   * puro, como os demais caminhos deste arquivo): a FK de `Article.author`
   * é `onDelete: Restrict`, e o Postgres real devolve `SQLSTATE 23001`
   * para isso — código diferente do `P2003`/`23503` que `create()`/
   * `update()` recebem quando `userId` é inválido (ver
   * `shared/database/prisma-error.util`).
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

      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'HAS_ARTICLES' };
      }

      throw err;
    }
  }
}
