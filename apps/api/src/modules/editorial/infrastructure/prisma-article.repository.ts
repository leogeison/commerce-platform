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

export interface UpdateArticleInput {
  siteId: string;
  id: string;
  type?: ArticleType;
  title?: string;
  slug?: string;
  /** `undefined` = não mexer; `null` = limpar; string = definir. */
  categoryId?: string | null;
  /** `undefined` = não mexer; `null` = limpar; string = definir. */
  authorId?: string | null;
  /** `undefined` = não mexer; `null` = limpar; string = definir. */
  metaDescription?: string | null;
  /** `undefined` = não mexer; `null` = limpar; string = definir. */
  coverImageUrl?: string | null;
  bodyMdx?: string;
}

export type UpdateArticleRepositoryResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'NOT_DRAFT' }
  | { ok: false; reason: 'SLUG_CONFLICT' }
  | { ok: false; reason: 'CATEGORY_NOT_FOUND' }
  | { ok: false; reason: 'AUTHOR_NOT_FOUND' };

export type TransitionArticleResult =
  | { ok: true; article: Article }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'WRONG_STATUS' };

/**
 * Dados extras que uma transição pode gravar além de `status` (EDT-014).
 * Deliberadamente um tipo próprio, não `Prisma.ArticleUpdateManyMutationInput`
 * — esse tipo do Prisma aceita qualquer coluna de `Article`, inclusive
 * `status`, o que permitiria uma transição futura sobrescrever o status
 * de destino por engano. Só `publishedAt` é aceito hoje; `status` nunca
 * entra aqui — `transitionStatus` sempre o define por último, a partir do
 * parâmetro `to`, nunca de `extraData`.
 */
export type ArticleTransitionExtraData = {
  publishedAt?: Date;
};

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

export interface FindManyPublishedBySiteInput {
  siteId: string;
  page: number;
  pageSize: number;
  /** `undefined` = sem filtro por Categoria. */
  categorySlug?: string;
  /** `undefined` = sem filtro por tipo. */
  type?: ArticleType;
}

/**
 * `category` sempre presente para um Artigo `PUBLISHED` — invariante
 * garantida pelo fluxo de publicação (Architecture.md §33: `categoryId`
 * passa a ser obrigatório no momento da publicação), não reforçada aqui.
 * O tipo reflete a relação Prisma como ela é (nulável no schema), mas quem
 * consome este resultado (o presenter público) trata a ausência como uma
 * inconsistência real a ser reportada, nunca mascarada com fallback.
 */
export type PublishedArticleWithCategorySlug = Article & {
  category: { slug: string } | null;
};

export interface FindManyPublishedBySiteResult {
  items: PublishedArticleWithCategorySlug[];
  total: number;
}

/**
 * Uma linha de `ArticleProduct` (join), com o `Product` completo e suas
 * Ofertas já filtradas — usada só pelo detalhe público (PUB-003). O `Offer[]`
 * aqui já vem sem as arquivadas (`archivedAt: null` no `where` da consulta,
 * não um filtro aplicado depois em memória) — decisão explícita da PUB-003:
 * a API pública nunca expõe uma Oferta cujo link de afiliado sempre
 * responderia `410 Gone` (TRK-006).
 */
export type PublishedArticleProductWithOffers = Prisma.ArticleProductGetPayload<{
  include: { product: { include: { offers: true } } };
}>;

/**
 * Um Artigo publicado com `category` (para `categorySlug`), `products`
 * (join `ArticleProduct`, já ordenado por `position` e com Ofertas
 * filtradas) e `author` (UXF-011) — usado só pelo detalhe público
 * (PUB-003). Mesma disciplina de `PublishedArticleWithCategorySlug`: o
 * tipo reflete a relação Prisma como ela é (nulável), quem consome trata
 * ausência de `category` como inconsistência real, nunca mascara com
 * fallback — diferente de `author`, cuja ausência é um estado válido e
 * esperado (`Article.authorId` é opcional), não uma inconsistência.
 *
 * `author` já reflete o `select: { name: true, avatarUrl: true } }` da
 * consulta (`findOnePublishedBySite`, abaixo) — nunca o registro completo
 * de `Author` (`id`/`siteId`/`userId`/`bio` nunca são buscados).
 */
export type PublishedArticleWithProducts = Article & {
  category: { slug: string } | null;
  products: PublishedArticleProductWithOffers[];
  author: { name: string; avatarUrl: string | null } | null;
};

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

  /**
   * Lista paginada de Artigos publicados de um Site (PUB-002; Architecture.md
   * §31) — leitura pública, sem sessão.
   *
   * `status: 'PUBLISHED'` fixo no `where`, nunca parametrizável — é
   * exatamente isso que torna esta consulta "pública" (diferente de
   * `findManyBySite`, cujo `status` é filtro opcional do lado admin).
   *
   * `categorySlug` filtrado via relação Prisma direta (`category: { slug:
   * ... } }`), sem resolver `categoryId` numa consulta separada antes —
   * uma única consulta, sem janela entre resolver o slug e usá-lo.
   *
   * `include: { category: { select: { slug: true } } }` — é como a
   * resposta pública obtém `categorySlug` sem uma segunda consulta por
   * Artigo (Architecture.md §31: "todo endpoint público retorna
   * `categorySlug` junto do artigo").
   *
   * `orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }]` — Architecture.md
   * §31 ("Home pública ordena por `publishedAt DESC`... desempate
   * secundário estável"); não existe endpoint de Home separado no
   * backlog, `WEB-002` (Fase 12) consome esta mesma listagem, então a
   * ordenação vale para ela como um todo, não um caso especial.
   */
  async findManyPublishedBySite(
    input: FindManyPublishedBySiteInput,
  ): Promise<FindManyPublishedBySiteResult> {
    const where: Prisma.ArticleWhereInput = {
      siteId: input.siteId,
      status: 'PUBLISHED',
      ...(input.type === undefined ? {} : { type: input.type }),
      ...(input.categorySlug === undefined
        ? {}
        : { category: { slug: input.categorySlug } }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.article.findMany({
        where,
        include: { category: { select: { slug: true } } },
        orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    return { items, total };
  }

  /**
   * Busca um Artigo publicado por `slug`, restrito ao Site, com Categoria e
   * Produtos/Ofertas embutidos (PUB-003; Architecture.md §31).
   *
   * `status: 'PUBLISHED'` fixo no `where` — mesmo critério de
   * `findManyPublishedBySite`: um `slug` que existe em `DRAFT`/
   * `PENDING_REVIEW`/`ARCHIVED` neste Site, ou que existe em outro Site,
   * simplesmente não bate na consulta, mesmo `null` genérico (quem decide
   * que `null` vira `404` é o controller).
   *
   * `products: { orderBy: { position: 'asc' }, include: { product: {
   * include: { offers: { where: { archivedAt: null } } } } } }` —
   * `position` é o campo de `ArticleProduct` criado exatamente para
   * ordenar a exibição dentro do Artigo (EDT-010). O `where: { archivedAt:
   * null }` dentro de `offers` filtra na própria consulta, não em memória
   * depois — decisão explícita da PUB-003 (ver
   * `PublishedArticleProductWithOffers`). Produto arquivado **não** é
   * filtrado aqui: continua aparecendo em `products`, mesmo decisão
   * explícita da PUB-003 (Architecture.md §12, "Artigos existentes
   * preservam a referência e o histórico"); se todas as Ofertas dele
   * estiverem arquivadas, o Produto aparece com `offers: []`.
   *
   * Ofertas ordenadas só por `id asc` — nenhum critério funcional de
   * ordenação de Oferta (ex.: preço) está documentado na Architecture, e a
   * PUB-003 decidiu explicitamente não inventar um (não usa `createdAt`).
   * `id asc` é só o desempate determinístico já usado em toda listagem do
   * projeto quando não há critério de negócio definido — sem ele a ordem
   * devolvida pelo Postgres não seria garantida entre chamadas.
   *
   * `author: { select: { name: true, avatarUrl: true } } }` (UXF-011) —
   * mesmo critério de `category: { select: { slug: true } } }` acima:
   * busca só os campos públicos, nunca `include: { author: true }` (que
   * traria também `id`/`siteId`/`userId`/`bio`). A FK composta
   * `Article.author` (`[authorId, siteId] → [id, siteId]`, ver schema
   * Prisma) torna estruturalmente impossível esta relação trazer um Autor
   * de outro Site — nenhum filtro adicional de isolamento é necessário
   * aqui. `null` quando `Article.authorId` é `null` (Autor não vinculado),
   * estado válido, nunca um erro.
   */
  async findOnePublishedBySite(
    siteId: string,
    slug: string,
  ): Promise<PublishedArticleWithProducts | null> {
    return this.prisma.article.findFirst({
      where: { siteId, slug, status: 'PUBLISHED' },
      include: {
        category: { select: { slug: true } },
        author: { select: { name: true, avatarUrl: true } },
        products: {
          orderBy: { position: 'asc' },
          include: {
            product: {
              include: { offers: { where: { archivedAt: null }, orderBy: { id: 'asc' } } },
            },
          },
        },
      },
    });
  }

  /**
   * Busca um `Article` por `id`, restrito ao Site (EDT-008). `findUnique`
   * pela chave composta `id_siteId`, mesmo padrão de
   * `PrismaAuthorRepository.findOneBySite`/`PrismaCategoryRepository.findOneBySite`
   * — um `id` real de Artigo de outro Site nunca bate nessa chave, então
   * retorna `null` do mesmo jeito que um `id` inexistente, mesmo `404`
   * genérico.
   */
  async findOneBySite(siteId: string, id: string): Promise<Article | null> {
    return this.prisma.article.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Atualiza um `Article` do Site, só permitido em `DRAFT` (EDT-009).
   *
   * `updateMany({ where: { id, siteId, status: 'DRAFT' }, ... })` — mesmo
   * padrão condicional de `PrismaProductRepository.archiveBySite`/
   * `unarchiveBySite`: a condição de elegibilidade (`status: 'DRAFT'`)
   * entra no próprio `where` da instrução SQL, avaliada atomicamente pelo
   * Postgres junto da atualização — sem pré-checagem separada, sem janela
   * de corrida entre checar o status e escrever.
   *
   * Campos tri-state (`categoryId`, `authorId`, `metaDescription`,
   * `coverImageUrl`) aproveitam o comportamento nativo do Prisma em
   * `update`/`updateMany`: um valor `undefined` no `data` **não entra** na
   * instrução SQL (coluna intocada); `null` explícito **limpa** a coluna;
   * qualquer outro valor a define. Por isso os campos abaixo são passados
   * exatamente como chegam em `input`, sem nenhum filtro/normalização —
   * qualquer `...(x === undefined ? {} : {x})` aqui apagaria a distinção
   * entre "não mexer" e "limpar", que é o requisito central desta tarefa.
   *
   * `count === 0` é ambíguo (não existe, é de outro Site, ou existe mas
   * não está em `DRAFT`) — um `findUnique` de acompanhamento resolve qual
   * dos três é: `null` → `NOT_FOUND` (mesmo critério de isolamento já
   * usado em `findOneBySite`); encontrado → `NOT_DRAFT`.
   *
   * `P2002`/`P2003` traduzidos exatamente como em `create()` (mesma
   * verificação exata de campos/constraint) — só podem ocorrer quando a
   * linha realmente bateu no `where` (`status: 'DRAFT'`) e a escrita foi
   * de fato tentada.
   */
  async updateBySite(input: UpdateArticleInput): Promise<UpdateArticleRepositoryResult> {
    try {
      const result = await this.prisma.article.updateMany({
        where: { id: input.id, siteId: input.siteId, status: 'DRAFT' },
        data: {
          type: input.type,
          title: input.title,
          slug: input.slug,
          categoryId: input.categoryId,
          authorId: input.authorId,
          metaDescription: input.metaDescription,
          coverImageUrl: input.coverImageUrl,
          bodyMdx: input.bodyMdx,
        },
      });

      if (result.count === 0) {
        const existing = await this.prisma.article.findUnique({
          where: { id_siteId: { id: input.id, siteId: input.siteId } },
        });

        if (!existing) {
          return { ok: false, reason: 'NOT_FOUND' };
        }

        return { ok: false, reason: 'NOT_DRAFT' };
      }

      const article = await this.prisma.article.findUnique({
        where: { id_siteId: { id: input.id, siteId: input.siteId } },
      });

      return { ok: true, article: article! };
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
   * `submit-for-review` (EDT-012): `DRAFT → PENDING_REVIEW`. Transição
   * incondicional, dado o status de origem correto — nenhuma validação de
   * Categoria/Produto/Oferta/`metaDescription`/capa aqui, essas regras
   * pertencem exclusivamente ao fluxo de publicação (`APP-002`/`REV-003`,
   * fora do escopo desta tarefa).
   */
  async submitForReview(siteId: string, id: string): Promise<TransitionArticleResult> {
    return this.transitionStatus(siteId, id, 'DRAFT', 'PENDING_REVIEW');
  }

  /** `revert-to-draft` (EDT-013): `PENDING_REVIEW → DRAFT`, incondicional. */
  async revertToDraft(siteId: string, id: string): Promise<TransitionArticleResult> {
    return this.transitionStatus(siteId, id, 'PENDING_REVIEW', 'DRAFT');
  }

  /** `restore-to-draft` (EDT-016): `ARCHIVED → DRAFT`, incondicional. */
  async restoreToDraft(siteId: string, id: string): Promise<TransitionArticleResult> {
    return this.transitionStatus(siteId, id, 'ARCHIVED', 'DRAFT');
  }

  /**
   * `mark-as-published` (EDT-014) — operação INTERNA, sem controller
   * próprio: só `MarkArticleAsPublishedUseCase` a chama, que por sua vez
   * só será chamado por `APP-002` (fora do escopo desta tarefa). Grava
   * `status` e `publishedAt` na mesma instrução `updateMany`, condicionada
   * a `PENDING_REVIEW` como status de origem — mesma garantia atômica das
   * três transições acima. Sem nenhuma validação de
   * Categoria/Produto/Oferta/`metaDescription`/capa aqui: essas regras
   * pertencem a `APP-002`, que só chama esta operação depois de todas
   * passarem.
   */
  async markAsPublished(siteId: string, id: string): Promise<TransitionArticleResult> {
    return this.transitionStatus(siteId, id, 'PENDING_REVIEW', 'PUBLISHED', {
      publishedAt: new Date(),
    });
  }

  /**
   * `archive` — operação INTERNA, sem controller próprio: só
   * `ArchiveArticleUseCase` a chama, que por sua vez só é chamado pelo
   * orquestrador HTTP-facing que também aciona a revalidação. `PUBLISHED →
   * ARCHIVED`, incondicional dado o status de origem correto. Sem
   * `extraData`: `Article` não tem coluna própria para "quando foi
   * arquivado", e `publishedAt` precisa permanecer intocado — como esta
   * chamada não passa `extraData`, a coluna nunca entra na instrução
   * `updateMany`, preservando o valor já gravado.
   */
  async archive(siteId: string, id: string): Promise<TransitionArticleResult> {
    return this.transitionStatus(siteId, id, 'PUBLISHED', 'ARCHIVED');
  }

  /**
   * Artigos publicados que referenciam uma Categoria (APP-005) — usado
   * para descobrir páginas públicas afetadas quando a Categoria muda
   * (`REV-005`, Fase 14, ainda não implementado). Filtro obrigatório por
   * `siteId` + `status: 'PUBLISHED'`: Artigo em `DRAFT`/`PENDING_REVIEW`/
   * `ARCHIVED` nunca é uma página pública, não há o que revalidar.
   * `orderBy: { id: 'asc' }` garante resultado determinístico entre
   * chamadas — sem isso a ordem do `findMany` não é garantida pelo
   * Postgres.
   */
  async findPublishedByCategory(siteId: string, categoryId: string): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: { siteId, status: 'PUBLISHED', categoryId },
      orderBy: { id: 'asc' },
    });
  }

  /** Artigos publicados que referenciam um Autor (APP-005) — mesmo critério de `findPublishedByCategory`. */
  async findPublishedByAuthor(siteId: string, authorId: string): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: { siteId, status: 'PUBLISHED', authorId },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Artigos publicados que vinculam um Produto (APP-005), via
   * `ArticleProduct` — mesmo critério de `findPublishedByCategory`, mas
   * a referência é indireta (tabela de junção), não uma coluna direta de
   * `Article`.
   */
  async findPublishedByProduct(siteId: string, productId: string): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: { siteId, status: 'PUBLISHED', products: { some: { productId } } },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Artigos publicados afetados por uma Oferta (APP-005) — uma Oferta não
   * referencia Artigo diretamente; a travessia é `Article → ArticleProduct
   * → Product → Offer`: qual Produto é dono desta Oferta, e quais Artigos
   * publicados vinculam esse Produto. Filtro de relação aninhado do
   * Prisma, uma única consulta — sem resolver `productId` da Oferta numa
   * chamada separada.
   */
  async findPublishedByOffer(siteId: string, offerId: string): Promise<Article[]> {
    return this.prisma.article.findMany({
      where: {
        siteId,
        status: 'PUBLISHED',
        products: { some: { product: { offers: { some: { id: offerId } } } } },
      },
      orderBy: { id: 'asc' },
    });
  }

  /**
   * Existe algum Artigo referenciando esta Categoria, em qualquer status
   * (APP-006) — regra geral: qualquer vínculo bloqueia exclusão física da
   * Categoria, não só Artigo publicado (Architecture.md §12 Categoria:
   * "Categoria com Produto ou Artigo vinculado não pode ser excluída" —
   * "vinculado" não é qualificado por status; mesmo critério já usado em
   * `PrismaArticleProductRepository.existsByProduct`, APP-003).
   *
   * `findFirst` (não `count`): só precisamos saber se existe ao menos um
   * Artigo, mais barato que contar todos.
   */
  async existsByCategory(siteId: string, categoryId: string): Promise<boolean> {
    const article = await this.prisma.article.findFirst({
      where: { siteId, categoryId },
      select: { id: true },
    });

    return article !== null;
  }

  /**
   * Helper privado comum às quatro transições da Fase 7/8
   * (`submitForReview`/`revertToDraft`/`restoreToDraft`/`markAsPublished`)
   * — evita repetir a mesma lógica.
   *
   * Mesmo padrão condicional de `updateBySite` (EDT-009), não o padrão de
   * transação interativa com `SELECT ... FOR UPDATE` do EDT-010: aqui é
   * uma única instrução SQL (`updateMany` condicionado a `id + siteId +
   * status: from`), atômica por natureza — o Postgres avalia o `where` e
   * a escrita juntos, sem janela de corrida, sem precisar de lock
   * explícito nem de múltiplos passos dentro de uma transação.
   *
   * `extraData` (EDT-014) entra **antes** de `status` no spread de `data`
   * — `status: to` é sempre escrito por último, garantindo que nenhum
   * `extraData` (hoje só `publishedAt`, ver `ArticleTransitionExtraData`)
   * possa sobrescrever o status de destino.
   *
   * `count === 0` é ambíguo (não existe, é de outro Site, ou existe mas
   * não está no status de origem esperado) — mesmo critério de
   * `updateBySite`: um `findUnique` de acompanhamento resolve qual dos
   * dois é.
   */
  private async transitionStatus(
    siteId: string,
    id: string,
    from: ArticleStatus,
    to: ArticleStatus,
    extraData: ArticleTransitionExtraData = {},
  ): Promise<TransitionArticleResult> {
    const result = await this.prisma.article.updateMany({
      where: { id, siteId, status: from },
      data: { ...extraData, status: to },
    });

    if (result.count === 0) {
      const existing = await this.prisma.article.findUnique({
        where: { id_siteId: { id, siteId } },
      });

      if (!existing) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      return { ok: false, reason: 'WRONG_STATUS' };
    }

    const article = await this.prisma.article.findUnique({
      where: { id_siteId: { id, siteId } },
    });

    return { ok: true, article: article! };
  }
}
