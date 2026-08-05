import { Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import type { Offer } from '../../../generated/prisma/client';

export interface PrepareAffiliateRedirectInput {
  siteId: string;
  offerId: string;
  articleId?: string;
}

export type PrepareAffiliateRedirectResult =
  | { ok: true; offer: Offer; articleId: string | null }
  | { ok: false; reason: 'OFFER_NOT_FOUND' }
  | { ok: false; reason: 'ARTICLE_NOT_FOUND' }
  | { ok: false; reason: 'OFFER_ARCHIVED' };

/**
 * Prepara/valida os dados cross-domain necessários para um futuro
 * redirect de clique de afiliado (APP-004) — **não** registra
 * `AffiliateClick` (isso é `TRK-004`, que ainda não existe: `Tracking`
 * fica "burro", só recebe IDs já validados por aqui), **não** responde
 * `302`/`410` (isso é `TRK-005`/`TRK-006`) e **não** valida UTM/rate limit
 * (fora do escopo de Application). Nome deliberado: `Prepare`, não
 * `Register`/`Redirect` — o que esta tarefa entrega é só a validação.
 *
 * `siteId` chega já resolvido pelo chamador — mesma convenção de todo o
 * projeto; quem vai resolver `:siteSlug` publicamente (`GET
 * /r/:siteSlug/:offerId`) é `TRK-002`, fora do escopo aqui.
 *
 * Ordem de verificação fixa (consistência de tenant antes de estado de
 * negócio):
 * 1. Oferta existe neste Site (`OFFER_NOT_FOUND`, "não existe"/"de outro
 *    Site" tratados igual — mesmo critério genérico de isolamento usado
 *    em todo o projeto).
 * 2. Se `articleId` foi informado, Artigo existe neste mesmo Site
 *    (`ARTICLE_NOT_FOUND`) — a própria busca escopada por `siteId` já
 *    cobre "IDs de Sites diferentes entre Oferta/Artigo são rejeitados"
 *    (critério de aceite oficial): não há necessidade de comparar
 *    `offer.siteId` com `article.siteId` à parte, os dois já vêm da
 *    mesma consulta tenant-aware.
 * 3. Oferta arquivada (`OFFER_ARCHIVED`) — resultado interno explícito;
 *    o futuro `TRK-006` decide como mapear isso para `410 Gone`, esta
 *    tarefa não produz nenhum status HTTP.
 *
 * Deliberadamente fora do escopo: status do Artigo (`PENDING_REVIEW`/
 * `PUBLISHED`/etc. — não importa para o clique), estoque da Oferta, URL
 * de afiliado — nenhuma dessas regras pertence à validação cross-domain
 * de tenant que esta tarefa cobre.
 *
 * `articleId` devolvido no sucesso (`string | null`, nunca `undefined`)
 * — o futuro Tracking deve consumir esse valor já validado pela
 * Application, não reaproveitar diretamente o `articleId` da query
 * original da requisição.
 */
@Injectable()
export class PrepareAffiliateRedirectUseCase {
  constructor(
    private readonly offerRepository: PrismaOfferRepository,
    private readonly articleRepository: PrismaArticleRepository,
  ) {}

  async execute(input: PrepareAffiliateRedirectInput): Promise<PrepareAffiliateRedirectResult> {
    const offer = await this.offerRepository.findOneBySite(input.siteId, input.offerId);

    if (!offer) {
      return { ok: false, reason: 'OFFER_NOT_FOUND' };
    }

    if (input.articleId) {
      const article = await this.articleRepository.findOneBySite(input.siteId, input.articleId);

      if (!article) {
        return { ok: false, reason: 'ARTICLE_NOT_FOUND' };
      }
    }

    if (offer.archivedAt !== null) {
      return { ok: false, reason: 'OFFER_ARCHIVED' };
    }

    return { ok: true, offer, articleId: input.articleId ?? null };
  }
}
