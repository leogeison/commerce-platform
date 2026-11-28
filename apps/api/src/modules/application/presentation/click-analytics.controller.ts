import { Controller, Get, Header, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  clickEventsQuerySchema,
  clickFiltersQuerySchema,
  clickRankingsQuerySchema,
  clicksSiteParamsSchema,
  type ClickEventsQuery,
  type ClickEventsResponse,
  type ClickFilterOptionsResponse,
  type ClickFiltersQuery,
  type ClickRankingsQuery,
  type ClickRankingsResponse,
  type ClicksSiteParams,
  type ClickSummaryResponse,
} from '@commerce-platform/contracts';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { SessionAuthGuard } from '../../identity/presentation/session-auth.guard';
import { MinRole } from '../../tenancy/presentation/min-role.decorator';
import { SiteAuthorizationGuard } from '../../tenancy/presentation/site-authorization.guard';
import '../../tenancy/presentation/tenant-context-request';
import { ClickAnalyticsService } from '../application/click-analytics/click-analytics.service';

/**
 * UXP-006 — dashboard de cliques de afiliados (somente leitura).
 *
 * `GET` não mutável: `SessionAuthGuard` + `SiteAuthorizationGuard` (sem
 * `OriginGuard`, mesmo critério das demais leituras do Admin). Consulta:
 * `VIEWER` ou superior. Exportação CSV: `EDITOR` ou superior (decisão do
 * PO), aplicada na própria API. `siteId` sempre do contexto de tenancy
 * resolvido pelo guard — nunca da query. `Cache-Control: no-store`: os
 * dados nunca são servidos de cache intermediário.
 */
@Controller('admin/sites/:siteSlug/clicks')
export class ClickAnalyticsController {
  constructor(private readonly analytics: ClickAnalyticsService) {}

  @Get('summary')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  @Header('Cache-Control', 'no-store')
  summary(
    @Param(new ZodValidationPipe(clicksSiteParamsSchema)) _params: ClicksSiteParams,
    @Query(new ZodValidationPipe(clickFiltersQuerySchema)) query: ClickFiltersQuery,
    @Req() req: Request,
  ): Promise<ClickSummaryResponse> {
    return this.analytics.summary(req.tenant!.siteId, query);
  }

  @Get('rankings')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  @Header('Cache-Control', 'no-store')
  rankings(
    @Param(new ZodValidationPipe(clicksSiteParamsSchema)) _params: ClicksSiteParams,
    @Query(new ZodValidationPipe(clickRankingsQuerySchema)) query: ClickRankingsQuery,
    @Req() req: Request,
  ): Promise<ClickRankingsResponse> {
    return this.analytics.rankings(req.tenant!.siteId, query);
  }

  @Get('events')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  @Header('Cache-Control', 'no-store')
  events(
    @Param(new ZodValidationPipe(clicksSiteParamsSchema)) _params: ClicksSiteParams,
    @Query(new ZodValidationPipe(clickEventsQuerySchema)) query: ClickEventsQuery,
    @Req() req: Request,
  ): Promise<ClickEventsResponse> {
    return this.analytics.events(req.tenant!.siteId, query);
  }

  @Get('filter-options')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('VIEWER')
  @Header('Cache-Control', 'no-store')
  filterOptions(
    @Param(new ZodValidationPipe(clicksSiteParamsSchema)) _params: ClicksSiteParams,
    @Req() req: Request,
  ): Promise<ClickFilterOptionsResponse> {
    return this.analytics.filterOptions(req.tenant!.siteId);
  }

  @Get('export.csv')
  @UseGuards(SessionAuthGuard, SiteAuthorizationGuard)
  @MinRole('EDITOR')
  async exportCsv(
    @Param(new ZodValidationPipe(clicksSiteParamsSchema)) _params: ClicksSiteParams,
    @Query(new ZodValidationPipe(clickFiltersQuerySchema)) query: ClickFiltersQuery,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const { filename, content } = await this.analytics.exportCsv(req.tenant!.siteId, query);
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(content);
  }
}
