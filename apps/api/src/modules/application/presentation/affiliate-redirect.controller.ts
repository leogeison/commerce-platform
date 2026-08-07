import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  affiliateRedirectParamsSchema,
  affiliateRedirectQuerySchema,
  type AffiliateRedirectParams,
  type AffiliateRedirectQuery,
} from '@commerce-platform/contracts';
import { RateLimit } from '../../../shared/http/rate-limit.decorator';
import { RateLimitGuard } from '../../../shared/http/rate-limit.guard';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PublicTenantGuard } from '../../tenancy/presentation/public-tenant.guard';
import '../../tenancy/presentation/tenant-context-request';
import { HandleAffiliateRedirectUseCase } from '../application/handle-affiliate-redirect.use-case';

const OFFER_NOT_FOUND_MESSAGE = 'Oferta não encontrada.';
const ARTICLE_NOT_FOUND_MESSAGE = 'Artigo não encontrado.';

/**
 * Corpo amigável do `410` (TRK-006; Architecture.md, Seção 20: "resposta
 * `410 Gone`, com corpo de resposta já amigável... não existe fallback
 * para página de Produto... o corpo amigável precisa ser produzido pela
 * própria API/Tracking, não por uma página Next.js"). HTML mínimo direto
 * neste arquivo — sem template engine/view (nenhum precedente de
 * `@Render()` neste projeto; seria abstração sem necessidade comprovada
 * para duas linhas de HTML).
 */
const OFFER_ARCHIVED_HTML = `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>Oferta indisponível</title></head>
  <body><p>Esta oferta não está mais disponível.</p></body>
</html>
`;

/**
 * `GET /r/:siteSlug/:offerId` (TRK-002 a TRK-007; Architecture.md, Seção
 * 20 — Fluxo de Tracking). **Registrado em `ApplicationModule.controllers`
 * a partir desta tarefa** — as cinco anteriores (`TRK-002` a `TRK-005`)
 * construíram este método incrementalmente sem expor a rota, exatamente
 * para não deixar `OFFER_ARCHIVED` sem resposta HTTP válida numa rota já
 * pública; agora os dois desfechos reais (sucesso e Oferta arquivada) têm
 * comportamento definitivo, então a rota nasce.
 *
 * Vive em `ApplicationModule` (não em `TrackingModule`, que existe só para
 * fornecer a capacidade de registrar `AffiliateClick`, TRK-004), junto de
 * `HandleAffiliateRedirectUseCase` (APP-004, renomeada de
 * `PrepareAffiliateRedirectUseCase` na própria TRK-004), o caso de uso
 * cross-domain que este controller delega.
 *
 * `PublicTenantGuard` resolve `siteSlug → Site` (TRK-002); params/query
 * validados pelos contratos de `TRK-001`, incluindo a telemetria adaptada
 * para `camelCase` (`TRK-003`); `OFFER_NOT_FOUND`/`ARTICLE_NOT_FOUND`
 * viram `404` (`TRK-002`); o registro do `AffiliateClick` acontece dentro
 * de `HandleAffiliateRedirectUseCase.execute(...)`, antes do resultado
 * chegar aqui (`TRK-004`) — inclusive quando a Oferta está arquivada
 * (Architecture.md: "todo clique... gera um registro").
 *
 * `@Res({ passthrough: false })` em vez de `@Redirect()` (usado
 * provisoriamente até a TRK-005): esta rota tem dois desfechos de sucesso
 * com formas de resposta incompatíveis entre si (redirecionamento vs. HTML
 * customizado com outro status) — `@Redirect()` só sabe produzir a
 * primeira, então passa a ser a própria rota, explicitamente, quem decide
 * o que enviar em cada caso:
 * - `ok: true` → `res.redirect(302, result.offer.affiliateUrl)` — a
 *   `affiliateUrl` real, validada e carregada do banco, nunca da
 *   requisição.
 * - `OFFER_ARCHIVED` → `410` com `OFFER_ARCHIVED_HTML` (`Content-Type:
 *   text/html`), sem fallback para página de Produto.
 *
 * Exceções lançadas (`NotFoundException` de `OFFER_NOT_FOUND`/
 * `ARTICLE_NOT_FOUND`) continuam interceptadas normalmente pelo
 * `AllExceptionsFilter` global mesmo com `@Res()` injetado — filtro de
 * exceção do Nest opera independente disso.
 *
 * Teste completo (routing, guard, pipes, banco, os dois desfechos de
 * sucesso e todo mapeamento de erro) em `apps/api/test/
 * affiliate-redirect.e2e-spec.ts`, nascido junto desta tarefa — os specs
 * unitários de `TRK-002` a `TRK-005` continuam válidos, cobrindo
 * delegação/mapeamento isoladamente.
 *
 * `RateLimitGuard`/`@RateLimit` (TRK-007, aplicando INF-007 aqui pela
 * segunda vez depois do login): `{ limit: 30, windowMs: 60_000 }` — bem
 * mais tolerante que o login (`5/60_000`), porque este endpoint recebe
 * cliques públicos legítimos em sequência (redes sociais, newsletter, IP
 * compartilhado por NAT corporativo), não tentativas de senha.
 * `RateLimitGuard` vem **antes** de `PublicTenantGuard` no `@UseGuards`
 * (Nest executa a lista em ordem): a checagem em memória é mais barata que
 * a consulta ao Postgres feita por `PublicTenantGuard`, então um IP acima
 * do limite é rejeitado com `429` antes de qualquer query — mesmo com
 * `siteSlug` inexistente. Nenhum `AffiliateClick` é gerado nesse caso,
 * porque `HandleAffiliateRedirectUseCase` nunca é alcançado.
 */
@Controller('r')
export class AffiliateRedirectController {
  constructor(
    private readonly handleAffiliateRedirectUseCase: HandleAffiliateRedirectUseCase,
  ) {}

  @Get(':siteSlug/:offerId')
  @UseGuards(RateLimitGuard, PublicTenantGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async redirect(
    @Param(new ZodValidationPipe(affiliateRedirectParamsSchema))
    params: AffiliateRedirectParams,
    @Query(new ZodValidationPipe(affiliateRedirectQuerySchema))
    query: AffiliateRedirectQuery,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const result = await this.handleAffiliateRedirectUseCase.execute({
      siteId: req.tenant!.siteId,
      offerId: params.offerId,
      articleId: query.articleId,
      utmSource: query.utm_source,
      utmMedium: query.utm_medium,
      utmCampaign: query.utm_campaign,
      referer: req.headers.referer,
      userAgent: req.headers['user-agent'],
    });

    if (!result.ok) {
      if (result.reason === 'OFFER_NOT_FOUND') {
        throw new NotFoundException(OFFER_NOT_FOUND_MESSAGE);
      }

      if (result.reason === 'ARTICLE_NOT_FOUND') {
        throw new NotFoundException(ARTICLE_NOT_FOUND_MESSAGE);
      }

      // `OFFER_ARCHIVED`: `410` amigável — sem fallback para página de
      // Produto (Architecture.md, Seção 20). O clique já foi registrado
      // dentro de `HandleAffiliateRedirectUseCase`, mesmo neste ramo.
      res.status(410).type('html').send(OFFER_ARCHIVED_HTML);
      return;
    }

    res.redirect(302, result.offer.affiliateUrl);
  }
}
