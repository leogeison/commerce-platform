import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import {
  isErrorWithCode,
  readForeignKeyConstraintName,
  readUniqueConstraintFields,
} from '../../../shared/database/prisma-error.util';
import { Prisma } from '../../../generated/prisma/client';

export interface LinkArticleProductInput {
  siteId: string;
  articleId: string;
  productId: string;
}

export interface UnlinkArticleProductInput {
  siteId: string;
  articleId: string;
  productId: string;
}

export interface ReorderArticleProductsInput {
  siteId: string;
  articleId: string;
  /** Lista completa e ordenada — já validada sem duplicados pelo contrato. */
  productIds: string[];
}

export type LinkArticleProductResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'ALREADY_LINKED' }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

export type UnlinkArticleProductResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'NOT_LINKED' };

export type ReorderArticleProductsResult =
  | { ok: true; productIds: string[] }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'INVALID_PRODUCT_SET' };

interface LockedArticleRow {
  status: string;
}

/**
 * Nome real da FK composta de `ArticleProduct.product`, gerado pela
 * migration (`20260728150323_init/migration.sql`). `ArticleProduct` tem
 * duas FKs (`ArticleProduct_articleId_siteId_fkey`,
 * `ArticleProduct_productId_siteId_fkey`) — só a de Produto é traduzida
 * aqui; a de Artigo não deveria disparar (o Artigo já foi confirmado pelo
 * lock antes de qualquer escrita), e se disparar por qualquer motivo
 * inesperado, sobe sem mascaramento.
 */
const PRODUCT_FOREIGN_KEY_CONSTRAINT = 'ArticleProduct_productId_siteId_fkey';

/**
 * Repository concreto (Prisma) de `ArticleProduct` (EDT-010) — separado de
 * `PrismaArticleRepository` porque `ArticleProduct` é seu próprio model
 * Prisma, mesmo critério de "um repository por model" já usado no projeto.
 *
 * Os três métodos abrem uma transação interativa (`$transaction(async (tx)
 * => ...)`) — primeira vez no projeto; até aqui só a forma array
 * (`$transaction([...])`, sequencial/batch) tinha sido usada, porque as
 * demais listagens paginadas só precisavam de duas queries independentes
 * no mesmo snapshot. Aqui é diferente: a regra "só em `DRAFT`" não é uma
 * constraint de banco (diferente do `EDT-009`, cujo `updateMany`
 * condiciona a própria instrução SQL a `status: 'DRAFT'` atomicamente) —
 * inserir/remover/reordenar linhas de `ArticleProduct` não tem como
 * carregar essa condição na mesma instrução.
 *
 * Por isso cada transação começa travando a linha do Artigo com
 * `SELECT ... FOR UPDATE` (via `tx.$queryRaw` + `Prisma.sql`, interpolação
 * segura e parametrizada, nunca concatenação de string) antes de validar o
 * status. O lock é mantido até o fim da transação — qualquer `UPDATE`
 * concorrente que toque essa linha (inclusive o `updateMany` do `EDT-009`,
 * e futuramente as transições de estado) bloqueia atrás dele, e vice-versa
 * — lock de linha do Postgres serializa nos dois sentidos, sem exigir que
 * o outro lado também use `FOR UPDATE` explicitamente.
 */
@Injectable()
export class PrismaArticleProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  private async lockArticle(
    tx: Prisma.TransactionClient,
    siteId: string,
    articleId: string,
  ): Promise<'NOT_FOUND' | 'NOT_DRAFT' | 'DRAFT'> {
    const rows = await tx.$queryRaw<LockedArticleRow[]>(
      Prisma.sql`SELECT "status" FROM "Article" WHERE "id" = ${articleId} AND "siteId" = ${siteId} FOR UPDATE`,
    );

    if (rows.length === 0) {
      return 'NOT_FOUND';
    }

    return rows[0]!.status === 'DRAFT' ? 'DRAFT' : 'NOT_DRAFT';
  }

  private async currentProductIds(
    tx: Prisma.TransactionClient,
    siteId: string,
    articleId: string,
  ): Promise<string[]> {
    const rows = await tx.articleProduct.findMany({
      where: { siteId, articleId },
      orderBy: [{ position: 'asc' }, { productId: 'asc' }],
      select: { productId: true },
    });

    return rows.map((row) => row.productId);
  }

  /**
   * Lista os `productId`s vinculados a um Artigo, ordenados por
   * `position` (APP-001) — mesma ordenação de `currentProductIds`, mas
   * pública, fora de transação e sem lock: leitura pura para o cálculo de
   * saúde do Artigo (read model, sem mutação em jogo), diferente dos três
   * métodos acima, que escrevem e por isso precisam do lock de `Article`
   * (EDT-010).
   */
  async findProductIdsByArticle(siteId: string, articleId: string): Promise<string[]> {
    const rows = await this.prisma.articleProduct.findMany({
      where: { siteId, articleId },
      orderBy: [{ position: 'asc' }, { productId: 'asc' }],
      select: { productId: true },
    });

    return rows.map((row) => row.productId);
  }

  /**
   * Vincula um Produto ao Artigo (EDT-010), sempre no fim da lista.
   *
   * Depois do lock/checagem de `DRAFT`, calcula `nextPosition` via
   * `aggregate({ _max: { position: true } })` sobre as linhas atuais
   * (`(max ?? -1) + 1` — `0` quando a lista está vazia). `create()`
   * reativo, sem pré-checagem de Produto/duplicidade (mesma estratégia já
   * usada em `PrismaArticleRepository.create()`): `P2002` na PK composta
   * (`ArticleProduct_pkey`, `[siteId, articleId, productId]`) só vira
   * `ALREADY_LINKED` quando os três campos batem **exatamente**; `P2003`
   * só vira `PRODUCT_NOT_FOUND` quando a constraint for **exatamente**
   * `ArticleProduct_productId_siteId_fkey`. Qualquer outro formato sobe
   * sem tradução.
   */
  async linkProduct(input: LinkArticleProductInput): Promise<LinkArticleProductResult> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await this.lockArticle(tx, input.siteId, input.articleId);
      if (lock === 'NOT_FOUND') {
        return { ok: false, reason: 'NOT_FOUND' };
      }
      if (lock === 'NOT_DRAFT') {
        return { ok: false, reason: 'NOT_DRAFT' };
      }

      const aggregate = await tx.articleProduct.aggregate({
        where: { siteId: input.siteId, articleId: input.articleId },
        _max: { position: true },
      });
      const nextPosition = (aggregate._max.position ?? -1) + 1;

      try {
        await tx.articleProduct.create({
          data: {
            siteId: input.siteId,
            articleId: input.articleId,
            productId: input.productId,
            position: nextPosition,
          },
        });
      } catch (err) {
        if (isErrorWithCode(err, 'P2002')) {
          const fields = readUniqueConstraintFields(err);
          if (
            fields?.length === 3 &&
            fields.includes('siteId') &&
            fields.includes('articleId') &&
            fields.includes('productId')
          ) {
            return { ok: false, reason: 'ALREADY_LINKED' };
          }

          throw err;
        }

        if (isErrorWithCode(err, 'P2003')) {
          const constraintName = readForeignKeyConstraintName(err);
          if (constraintName === PRODUCT_FOREIGN_KEY_CONSTRAINT) {
            return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
          }

          throw err;
        }

        throw err;
      }

      const productIds = await this.currentProductIds(tx, input.siteId, input.articleId);
      return { ok: true, productIds };
    });
  }

  /**
   * Desvincula um Produto do Artigo (EDT-010), recompactando as posições
   * restantes numa sequência contínua iniciada em zero, na mesma
   * transação.
   *
   * Depois do lock/checagem de `DRAFT`, busca a linha por
   * `siteId_articleId_productId` (PK composta) — `null` vira `NOT_LINKED`
   * (Produto real, mas nunca vinculado a este Artigo; tratado como recurso
   * aninhado não encontrado, não como no-op idempotente). Remove a linha,
   * depois busca as restantes ordenadas e reatribui `position = índice`
   * só quando o índice muda.
   */
  async unlinkProduct(input: UnlinkArticleProductInput): Promise<UnlinkArticleProductResult> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await this.lockArticle(tx, input.siteId, input.articleId);
      if (lock === 'NOT_FOUND') {
        return { ok: false, reason: 'NOT_FOUND' };
      }
      if (lock === 'NOT_DRAFT') {
        return { ok: false, reason: 'NOT_DRAFT' };
      }

      const existing = await tx.articleProduct.findUnique({
        where: {
          siteId_articleId_productId: {
            siteId: input.siteId,
            articleId: input.articleId,
            productId: input.productId,
          },
        },
      });

      if (!existing) {
        return { ok: false, reason: 'NOT_LINKED' };
      }

      await tx.articleProduct.delete({
        where: {
          siteId_articleId_productId: {
            siteId: input.siteId,
            articleId: input.articleId,
            productId: input.productId,
          },
        },
      });

      const remaining = await tx.articleProduct.findMany({
        where: { siteId: input.siteId, articleId: input.articleId },
        orderBy: [{ position: 'asc' }, { productId: 'asc' }],
      });

      for (let index = 0; index < remaining.length; index += 1) {
        const row = remaining[index]!;
        if (row.position !== index) {
          await tx.articleProduct.update({
            where: {
              siteId_articleId_productId: {
                siteId: input.siteId,
                articleId: input.articleId,
                productId: row.productId,
              },
            },
            data: { position: index },
          });
        }
      }

      return { ok: true, productIds: remaining.map((row) => row.productId) };
    });
  }

  /**
   * Reordena os Produtos vinculados ao Artigo (EDT-010) segundo a lista
   * completa recebida — `position` derivada do índice na lista.
   *
   * Depois do lock/checagem de `DRAFT`, compara o conjunto de
   * `productId`s atuais com o recebido: precisam ser **exatamente** o
   * mesmo conjunto (mesmo tamanho, mesmos elementos) — inclusive quando
   * ambos estão vazios, que é o único caso em que uma lista vazia é
   * aceita. Divergência vira `INVALID_PRODUCT_SET`, sem inserir/remover
   * vínculo implicitamente. Duplicados dentro de `input.productIds` já
   * foram rejeitados pelo `.refine()` do contrato antes de chegar aqui.
   */
  async reorderProducts(
    input: ReorderArticleProductsInput,
  ): Promise<ReorderArticleProductsResult> {
    return this.prisma.$transaction(async (tx) => {
      const lock = await this.lockArticle(tx, input.siteId, input.articleId);
      if (lock === 'NOT_FOUND') {
        return { ok: false, reason: 'NOT_FOUND' };
      }
      if (lock === 'NOT_DRAFT') {
        return { ok: false, reason: 'NOT_DRAFT' };
      }

      const current = await tx.articleProduct.findMany({
        where: { siteId: input.siteId, articleId: input.articleId },
        select: { productId: true },
      });
      const currentIds = new Set(current.map((row) => row.productId));
      const requestedIds = new Set(input.productIds);

      const sameSet =
        currentIds.size === requestedIds.size &&
        [...currentIds].every((id) => requestedIds.has(id));

      if (!sameSet) {
        return { ok: false, reason: 'INVALID_PRODUCT_SET' };
      }

      for (let index = 0; index < input.productIds.length; index += 1) {
        await tx.articleProduct.update({
          where: {
            siteId_articleId_productId: {
              siteId: input.siteId,
              articleId: input.articleId,
              productId: input.productIds[index]!,
            },
          },
          data: { position: index },
        });
      }

      return { ok: true, productIds: input.productIds };
    });
  }
}
