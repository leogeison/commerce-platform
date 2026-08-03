import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  isErrorWithCode,
  readForeignKeyConstraintName,
  readUniqueConstraintFields,
} from '../../../shared/database/prisma-error.util';
import {
  Prisma,
  type Article,
  type ArticleStatus,
  type ArticleType,
} from '../../../generated/prisma/client';

export interface CreateArticleInput {
  siteId: string;
  type: ArticleType;
  title: string;
  slug: string;
  categoryId?: string;
  authorId?: string;
  metaDescription?: string;
  coverImageUrl?: string;
  bodyMdx?: string;
}

export type CreateArticleRepositoryResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' }
  | { ok: false; reason: 'AUTHOR_NOT_FOUND' };

export interface FindManyBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
  /** `undefined` = sem filtro por status. */
  status?: ArticleStatus;
  /** `undefined` = sem filtro por tipo. */
  type?: ArticleType;
  /** `undefined` = sem filtro por Categoria. */
  categoryId?: string;
}

export interface FindManyBySiteResult {
  items: Article[];
  total: number;
}

/**
 * Nomes reais das duas FKs compostas alcançáveis por `create()`, gerados
 * pela migration (`20260728150323_init/migration.sql`). `Article` é a
 * primeira entidade do projeto com duas FKs opcionais reachable no mesmo
 * `create()` (`Product`/`Offer`/`Author` só tinham uma cada) — por isso
 * `readForeignKeyConstraintName` precisa ser comparado contra os dois
 * nomes, nunca assumido como "só pode ser X".
 */
const CATEGORY_FOREIGN_KEY_CONSTRAINT = 'Article_categoryId_siteId_fkey';
const AUTHOR_FOREIGN_KEY_CONSTRAINT = 'Article_authorId_siteId_fkey';

/**
 * Repository concreto (Prisma) de `Article` (EDT-006). `PrismaArticleRepository`,
 * mesmo padrão de `PrismaCategoryRepository`/`PrismaAuthorRepository`:
 * classe concreta dependente do Prisma, sem interface/porta própria.
 * Primeiro método: `create()` (`EDT-007` a `EDT-009` entram junto com as
 * tarefas correspondentes — não implementadas aqui).
 *
 * `create()` reativo, sem pré-checagem de `categoryId`/`authorId`/`slug`
 * (mesma estratégia de `PrismaProductRepository.create()`/
 * `PrismaAuthorRepository.create()`), traduzindo três erros do Postgres —
 * cada um só quando a constraint específica é identificada com segurança
 * (mesmo critério da `EDT-001`, usando `shared/database/prisma-error.util.ts`):
 *
 * - `P2002` em `@@unique([siteId, slug])` → `SLUG_CONFLICT`, só quando os
 *   nomes de coluna de `readUniqueConstraintFields` forem **exatamente**
 *   `siteId` e `slug`. `Article` também tem `@@unique([id, siteId])`, mas
 *   essa nunca colide num `create` normal (`id` é gerado) — mesmo
 *   raciocínio já documentado em `PrismaCategoryRepository`. Só uma
 *   constraint de unicidade é alcançável aqui (diferente de `Author`, que
 *   tinha `userId` opcional colidindo de verdade) — mas a checagem exata
 *   continua, sem presumir que todo `P2002` em `create()` é sempre sobre
 *   o mesmo par de campos.
 * - `P2003` na FK `Article.category` → `CATEGORY_NOT_FOUND`, só quando o
 *   nome da constraint for exatamente `Article_categoryId_siteId_fkey`.
 * - `P2003` na FK `Article.author` → `AUTHOR_NOT_FOUND`, só quando o nome
 *   da constraint for exatamente `Article_authorId_siteId_fkey`.
 *
 * A FK de `siteId` → `Site` não deveria falhar aqui (`siteId` já validado
 * pelo `SiteAuthorizationGuard`, mesmo critério de todo `create()` do
 * projeto). Qualquer `P2003` cuja constraint não bater com nenhuma das
 * duas nomeadas acima sobe sem tradução, nunca é mascarado.
 *
 * Sem `status` no `data`: omitido de propósito, deixa o Prisma aplicar o
 * default do schema (`DRAFT`) — Artigo sempre nasce `DRAFT`, nenhum
 * caminho neste repository aceita definir `status` na criação.
 */
@Injectable()
export class PrismaArticleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateArticleInput): Promise<CreateArticleRepositoryResult> {
    try {
      const article = await this.prisma.article.create({
        data: {
          siteId: input.siteId,
          categoryId: input.categoryId,
          authorId: input.authorId,
          type: input.type,
          title: input.title,
          slug: input.slug,
          metaDescription: input.metaDescription,
          coverImageUrl: input.coverImageUrl,
          bodyMdx: input.bodyMdx,
        },
      });

      return { ok: true, article };
    } catch (err) {
      if (isErrorWithCode(err, 'P2002')) {
        const fields = readUniqueConstraintFields(err);
        if (fields?.length === 2 && fields.includes('siteId') && fields.includes('slug')) {
          return { ok: false, reason: 'SLUG_CONFLICT' };
        }

        throw err;
      }

      if (isErrorWithCode(err, 'P2003')) {
        const constraintName = readForeignKeyConstraintName(err);

        if (constraintName === CATEGORY_FOREIGN_KEY_CONSTRAINT) {
          return { ok: false, reason: 'CATEGORY_NOT_FOUND' };
        }

        if (constraintName === AUTHOR_FOREIGN_KEY_CONSTRAINT) {
          return { ok: false, reason: 'AUTHOR_NOT_FOUND' };
        }

        throw err;
      }

      throw err;
    }
  }

  /**
   * Lista paginada de `Article` de um Site (EDT-007). Mesmo padrão de
   * `PrismaProductRepository.findManyBySite` (CAT-009): `findMany` +
   * `count` no mesmo `where` via `prisma.$transaction([...])` (mesmo
   * snapshot consistente).
   *
   * `status`/`type`/`categoryId` ausentes não entram no `where` — sem
   * filtro. Presentes, filtram exatamente por aquele valor; um
   * `categoryId` de outro Site simplesmente não bate em nenhum Artigo
   * deste Site (lista vazia, sem tratamento especial), mesmo raciocínio já
   * usado no filtro `categoryId` de Produto. Os três filtros combinam com
   * `AND` implícito do `where` — nenhuma regra de exclusividade entre
   * eles documentada.
   *
   * `orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]` — decisão explícita
   * desta tarefa (diferente de Categoria/Produto/Autor, que ordenam por
   * `name asc`): Artigo é conteúdo editorial, não cadastro, e o painel
   * administrativo prioriza visualizar os itens criados recentemente
   * primeiro. `id asc` só como desempate determinístico, mesmo critério
   * das demais listagens.
   */
  async findManyBySite(input: FindManyBySiteInput): Promise<FindManyBySiteResult> {
    const where: Prisma.ArticleWhereInput = {
      siteId: input.siteId,
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total };
  }
}
