import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/database/prisma.service';
import type { Marketplace, Offer } from '../../../generated/prisma/client';
import { isForeignKeyConstraintViolation } from '../../../shared/database/prisma-error.util';

export interface CreateOfferInput {
  siteId: string;
  productId: string;
  marketplace: Marketplace;
  price: string;
  currency?: string;
  affiliateUrl: string;
  inStock?: boolean;
}

export type CreateOfferRepositoryResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

export interface FindManyByProductInput {
  siteId: string;
  productId: string;
  page: number;
  pageSize: number;
}

export type FindManyByProductRepositoryResult =
  | { ok: true; items: Offer[]; total: number }
  | { ok: false; reason: 'PRODUCT_NOT_FOUND' };

export interface UpdateOfferInput {
  siteId: string;
  productId: string;
  id: string;
  marketplace?: Marketplace;
  price?: string;
  currency?: string;
  affiliateUrl?: string;
  inStock?: boolean;
}

export type UpdateOfferRepositoryResult =
  | { ok: true; offer: Offer }
  | { ok: false; reason: 'NOT_FOUND' };

export type DeleteOfferRepositoryResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'HAS_DEPENDENTS' };

/**
 * Repository concreto (Prisma) de `Offer` (CAT-015). `PrismaOfferRepository`,
 * mesmo padrão de `PrismaProductRepository`/`PrismaCategoryRepository`:
 * classe concreta dependente do Prisma, sem interface/porta própria.
 *
 * Justificado como abstração pelo mesmo motivo dos outros dois: reaproveitado
 * por CAT-015 a CAT-021 (7 casos de uso de Oferta). Começa só com `create()`.
 *
 * Sem conflito de unicidade: `Offer` só tem `@@unique([id, siteId])`
 * (estrutural, nunca colide num `create` normal, `id` é gerado) — nenhuma
 * constraint de negócio alcançável aqui. Architecture.md confirma
 * explicitamente: "Um Produto pode ter múltiplas Ofertas, inclusive do
 * mesmo marketplace." Só existe um erro possível neste método.
 *
 * `create()` traduz reativamente, sem pré-checagem (mesma estratégia já
 * usada em `PrismaProductRepository.create()` para `categoryId` — evita
 * corrida entre checar e inserir):
 * - `P2003` (violação da FK composta `Offer.product`, `[productId,
 *   siteId] → Product[id, siteId]`, `onDelete: Restrict`) → `PRODUCT_NOT_FOUND`.
 *   Cobre tanto `productId` inexistente quanto `productId` de um Produto
 *   de outro Site — o par `[productId, siteId]` só bate se o Produto
 *   existir *e* pertencer a este Site, mesmo critério de isolamento já
 *   usado em Categoria/Produto.
 *
 * Só essa FK é alcançável num `create` normal — a de `siteId` → `Site`
 * nunca falha aqui, porque o Site já foi validado antes pelo
 * `SiteAuthorizationGuard`.
 */
@Injectable()
export class PrismaOfferRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOfferInput): Promise<CreateOfferRepositoryResult> {
    try {
      const offer = await this.prisma.offer.create({
        data: {
          siteId: input.siteId,
          productId: input.productId,
          marketplace: input.marketplace,
          price: input.price,
          affiliateUrl: input.affiliateUrl,
          // `currency`/`inStock` omitidos do objeto `data` quando ausentes
          // (não `key: undefined`) — o schema Prisma já tem `@default`
          // para os dois (`"BRL"`/`true`); omitir a chave deixa o
          // Postgres/Prisma aplicar o default sozinho, sem duplicar esse
          // valor aqui.
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.inStock !== undefined ? { inStock: input.inStock } : {}),
        },
      });

      return { ok: true, offer };
    } catch (err) {
      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
      }

      throw err;
    }
  }

  /**
   * Lista paginada de `Offer` de um Produto (CAT-016). Diferente de
   * `PrismaProductRepository.findManyBySite` (CAT-009), onde `categoryId`
   * é um *filtro* opcional (inexistente/de outro Site → lista vazia,
   * `200`), aqui `productId` é o recurso-pai identificado pela própria
   * rota (`/products/:productId/offers`) — mesmo critério já usado no
   * `create()` acima e no padrão de detalhe (`GET .../:id`): recurso-pai
   * inexistente ou de outro Site é `404`, nunca lista vazia. Decisão
   * explícita da CAT-016, confirmada pelo usuário.
   *
   * Por isso a existência do Produto é confirmada primeiro, via
   * `findUnique` na mesma chave composta `id_siteId` já usada em
   * `PrismaProductRepository` — pré-checagem legítima aqui porque é leitura
   * pura: não há mutação em jogo, então não existe corrida (TOCTOU) capaz
   * de corromper dado nenhum; o pior cenário (Produto excluído entre a
   * checagem e a listagem) resulta numa lista vazia, não numa
   * inconsistência.
   *
   * Sem filtro de `archived` (Architecture.md: "Ofertas: nenhum [filtro]")
   * — ofertas arquivadas aparecem na lista, mesmo critério já usado no
   * resumo de ofertas embutido no Produto (CAT-010).
   *
   * `findMany` + `count` no mesmo `where` via `prisma.$transaction([...])`
   * — mesmo padrão de `PrismaCategoryRepository.findManyBySite`/
   * `PrismaProductRepository.findManyBySite`. Ordenação `createdAt asc, id
   * asc` — mesma convenção já usada nas ofertas embutidas no detalhe do
   * Produto (CAT-010).
   */
  async findManyByProduct(
    input: FindManyByProductInput,
  ): Promise<FindManyByProductRepositoryResult> {
    const product = await this.prisma.product.findUnique({
      where: { id_siteId: { id: input.productId, siteId: input.siteId } },
    });

    if (!product) {
      return { ok: false, reason: 'PRODUCT_NOT_FOUND' };
    }

    const where = { siteId: input.siteId, productId: input.productId };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.offer.count({ where }),
    ]);

    return { ok: true, items, total };
  }

  /**
   * Busca uma `Offer` por `id`, restrita ao Site e ao Produto (CAT-017).
   * `Offer` só tem `@@unique([id, siteId])` no schema — sem chave composta
   * envolvendo `productId` — então uso `findFirst` com os três campos no
   * `where` (`id`, `siteId`, `productId`) em vez de `findUnique` na chave
   * composta usada em Categoria/Produto.
   *
   * Um único filtro combinado cobre, com o mesmo `null`/`404` genérico,
   * três casos: `id` inexistente; `id` de uma Oferta de outro Site; `id`
   * de uma Oferta que existe e pertence a este Site mas está sob outro
   * Produto (a URL não bate com o recurso). Mesmo critério de "mesmo 404
   * para não-existe/tenant errado" já usado em `PrismaCategoryRepository.
   * findOneBySite`/`PrismaProductRepository.findOneBySiteWithOffers`,
   * estendido aqui para "produto errado" — decisão explícita da CAT-017,
   * sem pré-checagem do Produto.
   *
   * Oferta arquivada é retornada normalmente, sem filtro por `archivedAt`
   * — mesmo critério de detalhe já usado em Categoria/Produto (arquivamento
   * nunca é `404` na visão admin).
   */
  async findOneByProductAndSite(
    siteId: string,
    productId: string,
    id: string,
  ): Promise<Offer | null> {
    return this.prisma.offer.findFirst({
      where: { id, siteId, productId },
    });
  }

  /**
   * Busca uma `Offer` só por `id` + `siteId`, sem exigir `productId`
   * (APP-004) — diferente de `findOneByProductAndSite` (CAT-017), que
   * serve a rota admin aninhada em `/products/:productId/offers/:id`. Aqui
   * o chamador (o redirect público, `GET /r/:siteSlug/:offerId`, TRK-002 a
   * TRK-008) só tem `offerId`, nunca `productId`. Mesmo padrão de
   * `PrismaCategoryRepository.findOneBySite`/`PrismaArticleRepository.findOneBySite`:
   * `findUnique` na chave composta `id_siteId` (`Offer` tem
   * `@@unique([id, siteId])`), `null` cobre "não existe"/"de outro Site"
   * com o mesmo resultado genérico. Oferta arquivada é retornada
   * normalmente, sem filtro — quem decide o que fazer com uma Oferta
   * arquivada é o caso de uso chamador (`HandleAffiliateRedirectUseCase`,
   * renomeada de `PrepareAffiliateRedirectUseCase` em `TRK-004`), não o
   * repository.
   */
  async findOneBySite(siteId: string, id: string): Promise<Offer | null> {
    return this.prisma.offer.findUnique({
      where: { id_siteId: { id, siteId } },
    });
  }

  /**
   * Atualiza uma `Offer` do Site, restrita ao Produto informado (CAT-018) —
   * operação INTERNA, sem controller próprio: só `UpdateOfferUseCase` a
   * chama, que por sua vez só é chamado pelo orquestrador HTTP-facing que
   * também aciona a coordenação de revalidação (REV-012).
   *
   * `where` combina a chave composta única `id_siteId` com `productId` como
   * filtro adicional — o tipo gerado pelo Prisma para `OfferWhereUniqueInput`
   * aceita esse campo extra junto do identificador único, então o Prisma
   * monta uma única instrução `UPDATE ... WHERE id = ? AND siteId = ? AND
   * productId = ?`. Isso garante, numa única operação atômica, a invariante
   * de identidade da rota aninhada (`/products/:productId/offers/:id`):
   * `id`, `siteId` e `productId` precisam corresponder simultaneamente, ou
   * nenhuma linha é afetada. Diferente de `findOneByProductAndSite`
   * (CAT-017, leitura pura via `findFirst`) e de `archiveBySite`/
   * `unarchiveBySite` (que ignoram `productId` de propósito — sem parâmetro
   * de rota "produto errado" a distinguir nessas duas operações): aqui a
   * própria URL do PATCH identifica a Oferta como pertencente àquele
   * Produto, então um `productId` divergente deve se comportar como
   * "recurso não encontrado", nunca aplicar a alteração num Produto errado.
   *
   * `P2025` (nenhuma linha bateu nas três condições) → `NOT_FOUND` — cobre
   * "não existe", "de outro Site" e "de outro Produto" com o mesmo
   * resultado genérico, reaproveitando `isRecordNotFound` (já usado em
   * `deleteBySite`).
   *
   * Nenhum outro erro de domínio é alcançável aqui: nenhum dos campos
   * editáveis (`marketplace`, `price`, `currency`, `affiliateUrl`,
   * `inStock`) é relacional nem tem constraint de unicidade de negócio —
   * `productId` só aparece no `where`, nunca no `data`, então a FK
   * `Offer.product` nunca é tocada por este método.
   *
   * Campos ausentes (`undefined`) não entram na instrução SQL — coluna
   * intocada; nenhum é `.nullable()` no contrato, então não há semântica
   * tri-state a aplicar aqui (diferente de `PrismaProductRepository.updateBySite`).
   * `archivedAt` nunca entra no `data`, então seu valor é sempre
   * preservado — Oferta arquivada é atualizável normalmente, sem filtro de
   * estado no `where`, mesmo critério de `PrismaProductRepository.updateBySite`.
   */
  async updateBySite(input: UpdateOfferInput): Promise<UpdateOfferRepositoryResult> {
    try {
      const offer = await this.prisma.offer.update({
        where: {
          id_siteId: { id: input.id, siteId: input.siteId },
          productId: input.productId,
        },
        data: {
          marketplace: input.marketplace,
          price: input.price,
          currency: input.currency,
          affiliateUrl: input.affiliateUrl,
          inStock: input.inStock,
        },
      });

      return { ok: true, offer };
    } catch (err) {
      if (isRecordNotFound(err)) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      throw err;
    }
  }

  /**
   * Arquiva uma `Offer` do Site, restrita ao Produto informado (CAT-019,
   * operação **interna** — sem controller/rota HTTP própria; endpoint real
   * é `REV-013`). `productId` faz parte da identidade contextual desta
   * operação — mesma decisão já tomada para `updateBySite` (CAT-018) — mas
   * a implementação não pode reaproveitar a estratégia reativa de
   * `updateBySite`: arquivar é idempotente e precisa **preservar** o
   * `archivedAt` original numa segunda chamada, o que uma instrução
   * `update()` direta destruiria (sempre escreveria um novo timestamp).
   *
   * Por isso mantém a estrutura de duas etapas já usada por
   * `PrismaProductRepository.archiveBySite`, mas com uma correção
   * importante: `productId` entra tanto no `updateMany` (condição de
   * escrita) quanto na leitura de confirmação seguinte — que deixa de ser
   * `findUnique` na chave composta `id_siteId` (só dois campos) e passa a
   * ser `findFirst({ id, siteId, productId })` (os três campos da
   * identidade). Isso evita um falso sucesso: se `productId` não bater, o
   * `updateMany` não afeta nenhuma linha (0), mas se a leitura seguinte
   * ainda usasse só `id + siteId`, ela encontraria a Oferta real (de outro
   * Produto) e a devolveria como se a operação tivesse funcionado. Com
   * `productId` também na leitura, a mesma condição que impede a escrita
   * também impede a leitura de "vazar" a Oferta errada — `null` cobre,
   * com o mesmo resultado genérico, "não existe", "de outro Site" e "de
   * outro Produto".
   *
   * `updateMany` condicionado a `archivedAt: null`: idempotente, não
   * sobrescreve o timestamp original — arquivar uma Oferta já arquivada
   * (mas com `id`/`siteId`/`productId` corretos) não bate na condição
   * (0 linhas afetadas), mas o `findFirst` seguinte ainda encontra a
   * Oferta (os três IDs batem) e a devolve com o `archivedAt` original
   * intacto — sucesso idempotente, sem sobrescrita.
   */
  async archiveBySite(siteId: string, productId: string, id: string): Promise<Offer | null> {
    await this.prisma.offer.updateMany({
      where: { id, siteId, productId, archivedAt: null },
      data: { archivedAt: new Date() },
    });

    return this.prisma.offer.findFirst({
      where: { id, siteId, productId },
    });
  }

  /**
   * Desarquiva uma `Offer` do Site, restrita ao Produto informado (CAT-020,
   * operação **interna** — mesmo critério de `archiveBySite`, invertido).
   * Endpoint real também é `REV-013`.
   */
  async unarchiveBySite(siteId: string, productId: string, id: string): Promise<Offer | null> {
    await this.prisma.offer.updateMany({
      where: { id, siteId, productId, archivedAt: { not: null } },
      data: { archivedAt: null },
    });

    return this.prisma.offer.findFirst({
      where: { id, siteId, productId },
    });
  }

  /**
   * Exclui fisicamente uma `Offer` do Site (CAT-021) — operação **interna**
   * do Catalog, sem controller/rota HTTP própria; quem chama é
   * `RemoveOfferUseCase` (`TRK-010`, cross-domain, fora deste módulo),
   * depois de já ter confirmado a ausência de `AffiliateClick` por conta
   * própria.
   *
   * Diferente de `PrismaCategoryRepository.deleteBySite`/
   * `PrismaProductRepository.deleteBySite` (CAT-007/CAT-014): `Offer` não
   * tem **nenhuma** relação interna do Catalog que a referencie — a única
   * FK que aponta para `Offer` no schema é `AffiliateClick.offer`
   * (`onDelete: Restrict`), que pertence a Tracking. O Catalog não pode
   * depender de Tracking, então este método nunca importa/menciona
   * `AffiliateClick`: ele só tenta o `delete` direto pela chave composta
   * `id_siteId` e traduz o que o Postgres devolver, sem saber (nem
   * precisar saber) qual tabela originou a violação de integridade
   * referencial — `isForeignKeyConstraintViolation` (`P2003` ou `23001`,
   * ver `shared/database/prisma-error.util`) aqui vira o motivo genérico
   * `HAS_DEPENDENTS` (não um nome específico de Tracking), decisão
   * explícita da CAT-021: o Catalog trata isso como "existe algum
   * dependente externo", nunca como "existe um `AffiliateClick`".
   *
   * `P2025` (registro não encontrado) → `NOT_FOUND`, mesmo critério de
   * isolamento já usado em `PrismaProductRepository.deleteBySite` — cobre
   * tanto `id` inexistente quanto `id` de uma Oferta de outro Site.
   */
  async deleteBySite(siteId: string, id: string): Promise<DeleteOfferRepositoryResult> {
    try {
      await this.prisma.offer.delete({
        where: { id_siteId: { id, siteId } },
      });

      return { ok: true };
    } catch (err) {
      if (isRecordNotFound(err)) {
        return { ok: false, reason: 'NOT_FOUND' };
      }

      if (isForeignKeyConstraintViolation(err)) {
        return { ok: false, reason: 'HAS_DEPENDENTS' };
      }

      throw err;
    }
  }

  /**
   * Resumo mínimo das Ofertas de um conjunto de Produtos, num Site
   * (APP-001) — usado pelo cálculo cross-domain de saúde do Artigo para
   * decidir, por Produto vinculado, se existe ao menos uma Oferta válida.
   *
   * Sem paginação, diferente de `findManyByProduct`: aquele método serve a
   * listagem admin paginada de um único Produto; este é uma leitura
   * interna, para vários Produtos de uma vez, evitando N+1 (uma consulta
   * por Produto vinculado ao Artigo). Retorna linhas cruas
   * (`productId`/`archivedAt`/`inStock`/`affiliateUrl`) — a interpretação
   * de "Oferta válida" (arquivada = não, em estoque = sim, URL HTTP(S)
   * válida) fica na camada `application`, não aqui, mesmo critério de
   * manter regra de negócio fora do repository já seguido no resto do
   * projeto.
   *
   * Sem filtro de `archivedAt`/`inStock` na query: o próprio chamador
   * precisa ver todas as Ofertas (inclusive as inválidas) para decidir
   * `NO_OFFERS` (nenhuma linha) vs `NO_VALID_OFFER` (linhas existem, mas
   * nenhuma válida) — filtrar aqui destruiria essa distinção.
   *
   * `productIds` vazio retorna `[]` sem consultar o banco — evita um `IN
   * ()` vazio (Artigo sem nenhum Produto vinculado, cenário coberto por
   * `hasAtLeastOneProduct: false`).
   */
  async findSummaryByProductIds(
    siteId: string,
    productIds: string[],
  ): Promise<OfferSummaryRow[]> {
    if (productIds.length === 0) {
      return [];
    }

    return this.prisma.offer.findMany({
      where: { siteId, productId: { in: productIds } },
      select: { productId: true, archivedAt: true, inStock: true, affiliateUrl: true },
    });
  }
}

export interface OfferSummaryRow {
  productId: string;
  archivedAt: Date | null;
  inStock: boolean;
  affiliateUrl: string;
}

/** `P2025`: operação (aqui, `delete`) não encontrou o registro pela `where`. */
function isRecordNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2025'
  );
}
