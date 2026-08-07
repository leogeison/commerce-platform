import { Inject, Injectable } from '@nestjs/common';
import { PrismaArticleRepository } from '../../editorial/infrastructure/prisma-article.repository';
import { PrismaOfferRepository } from '../../catalog/infrastructure/prisma-offer.repository';
import {
  AFFILIATE_CLICK_RECORDER,
  type AffiliateClickRecorder,
} from '../../tracking/domain/affiliate-click-recorder';
import type { Offer } from '../../../generated/prisma/client';

export interface HandleAffiliateRedirectInput {
  siteId: string;
  offerId: string;
  articleId?: string;
  /**
   * `utmSource`/`utmMedium`/`utmCampaign`/`referer`/`userAgent` (TRK-003):
   * telemetria não confiável (Architecture.md, Seção 20), já adaptada para
   * `camelCase` por quem chama (`AffiliateRedirectController`, a partir de
   * `query.utm_source`/`utm_medium`/`utm_campaign` e dos headers `Referer`/
   * `User-Agent`). Normalizados para `string | null` (`?? null`) só ao
   * montar `RecordAffiliateClickInput` para `AffiliateClickRecorder`
   * (TRK-004), depois da validação tenant-aware de Oferta/Artigo — essa
   * normalização de ausência é a única coisa que esta classe faz com eles;
   * nunca valida formato/conteúdo (isso continua fora de escopo).
   */
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  referer?: string;
  userAgent?: string;
}

export type HandleAffiliateRedirectResult =
  | { ok: true; offer: Offer; articleId: string | null }
  | { ok: false; reason: 'OFFER_NOT_FOUND' }
  | { ok: false; reason: 'ARTICLE_NOT_FOUND' }
  | { ok: false; reason: 'OFFER_ARCHIVED' };

/**
 * Valida os dados cross-domain necessários para o redirect de clique de
 * afiliado (APP-004) e registra o `AffiliateClick` correspondente
 * (TRK-004, via `AffiliateClickRecorder` — `Tracking` continua "burro", só
 * recebe dados já validados por aqui). **Não** responde `302`/`410` (isso
 * é `TRK-005`/`TRK-006`) e **não** valida UTM/rate limit (fora do escopo
 * de Application).
 *
 * Renomeada de `PrepareAffiliateRedirectUseCase` para
 * `HandleAffiliateRedirectUseCase` depois de `TRK-004`: o nome `Prepare`
 * fazia sentido em APP-004, quando a classe só validava; com o registro do
 * `AffiliateClick` (um efeito colateral real, não só leitura), ela passou
 * a coordenar o fluxo de redirect, não só prepará-lo — `Handle` reflete
 * isso sem prometer mais do que a classe entrega (segue sem responder
 * `302`/`410`).
 *
 * `siteId` chega já resolvido pelo chamador — mesma convenção de todo o
 * projeto; quem resolve `:siteSlug` publicamente (`GET
 * /r/:siteSlug/:offerId`) é `TRK-002`, fora do escopo aqui.
 *
 * Ordem fixa (Architecture.md, Seção 20 — "todo clique em link de afiliado
 * gera um registro"; consistência de tenant antes de estado de negócio,
 * mas registro do clique **antes** de decidir `OFFER_ARCHIVED`, não depois
 * — uma Oferta arquivada ainda representa um clique real no endpoint, só
 * termina em `410` em vez de `302`):
 * 1. Oferta existe neste Site (`OFFER_NOT_FOUND`, "não existe"/"de outro
 *    Site" tratados igual — mesmo critério genérico de isolamento usado
 *    em todo o projeto). Sem registro de clique.
 * 2. Se `articleId` foi informado, Artigo existe neste mesmo Site
 *    (`ARTICLE_NOT_FOUND`) — a própria busca escopada por `siteId` já
 *    cobre "IDs de Sites diferentes entre Oferta/Artigo são rejeitados"
 *    (critério de aceite oficial): não há necessidade de comparar
 *    `offer.siteId` com `article.siteId` à parte, os dois já vêm da
 *    mesma consulta tenant-aware. Sem registro de clique.
 * 3. Oferta e (se informado) Artigo validados: registra o `AffiliateClick`
 *    via `affiliateClickRecorder.record(...)`, usando `offer.id`/`article.id`
 *    — os IDs canônicos dos registros efetivamente carregados do banco,
 *    nunca `input.offerId`/`input.articleId` diretamente — com a
 *    telemetria de `TRK-003` normalizada para `string | null`. Tracking só
 *    recebe IDs de recursos que a Application já confirmou existirem
 *    neste Site.
 * 4. Oferta arquivada (`OFFER_ARCHIVED`) — resultado interno explícito,
 *    já com o clique registrado; `TRK-006` decide como mapear isso para
 *    `410 Gone`, esta tarefa não produz nenhum status HTTP.
 * 5. Caso contrário, sucesso.
 *
 * Deliberadamente fora do escopo: status do Artigo (`PENDING_REVIEW`/
 * `PUBLISHED`/etc. — não importa para o clique), estoque da Oferta, URL
 * de afiliado — nenhuma dessas regras pertence à validação cross-domain
 * de tenant que esta tarefa cobre.
 *
 * `articleId` devolvido no sucesso (`string | null`, nunca `undefined`) —
 * mesmo valor canônico (`article.id`) usado no registro do clique, não
 * `input.articleId` recalculado à parte.
 */
@Injectable()
export class HandleAffiliateRedirectUseCase {
  constructor(
    private readonly offerRepository: PrismaOfferRepository,
    private readonly articleRepository: PrismaArticleRepository,
    @Inject(AFFILIATE_CLICK_RECORDER)
    private readonly affiliateClickRecorder: AffiliateClickRecorder,
  ) {}

  async execute(input: HandleAffiliateRedirectInput): Promise<HandleAffiliateRedirectResult> {
    const offer = await this.offerRepository.findOneBySite(input.siteId, input.offerId);

    if (!offer) {
      return { ok: false, reason: 'OFFER_NOT_FOUND' };
    }

    let articleId: string | null = null;

    if (input.articleId) {
      const article = await this.articleRepository.findOneBySite(input.siteId, input.articleId);

      if (!article) {
        return { ok: false, reason: 'ARTICLE_NOT_FOUND' };
      }

      articleId = article.id;
    }

    await this.affiliateClickRecorder.record({
      siteId: input.siteId,
      offerId: offer.id,
      articleId,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
      referer: input.referer ?? null,
      userAgent: input.userAgent ?? null,
    });

    if (offer.archivedAt !== null) {
      return { ok: false, reason: 'OFFER_ARCHIVED' };
    }

    return { ok: true, offer, articleId };
  }
}
