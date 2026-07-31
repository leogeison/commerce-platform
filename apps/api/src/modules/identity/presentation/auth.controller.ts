import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  loginRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
} from '@commerce-platform/contracts';
import { PrismaService } from '../../../shared/database/prisma.service';
import { OriginGuard } from '../../../shared/http/origin.guard';
import { RateLimit } from '../../../shared/http/rate-limit.decorator';
import { RateLimitGuard } from '../../../shared/http/rate-limit.guard';
import { SessionCookieHelper } from '../../../shared/http/session-cookie.helper';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { SessionAuthGuard } from './session-auth.guard';
import {
  ADMIN_SESSION_COOKIE_NAME,
} from '../session.constants';

/**
 * `POST /admin/auth/login` (AUTH-005), `POST /admin/auth/logout`
 * (AUTH-007) e `GET /admin/auth/me` (AUTH-008) — Architecture.md, Seção 15.
 *
 * `OriginGuard` (INF-006) + `RateLimitGuard`/`@RateLimit` (INF-007)
 * aplicados aqui pela primeira vez no login — ambos ficaram como providers
 * comuns, não globais, esperando exatamente esta rota (ver os próprios
 * comentários de `HttpModule`/`RateLimit`). `{ limit: 5, windowMs: 60_000 }`
 * já era o exemplo documentado no decorator desde a INF-007.
 *
 * Mensagem genérica: e-mail inexistente e senha incorreta chegam aqui como
 * o mesmo `LoginResult.ok === false` (a distinção nunca sai de
 * `LoginUseCase`) — sempre o mesmo `401` com a mesma mensagem.
 */
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly sessionCookieHelper: SessionCookieHelper,
    private readonly prisma: PrismaService,
  ) {}

  @Post('login')
  @UseGuards(OriginGuard, RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60_000 })
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.loginUseCase.execute(body);

    if (!result.ok) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    // `maxAgeMs` derivado do `expiresAt` efetivamente persistido pela
    // sessão (não de `ADMIN_SESSION_DURATION_MS` de novo aqui) — cookie e
    // registro no banco expiram no mesmo instante, sem recalcular a
    // duração a partir de um novo `Date.now()` neste ponto.
    this.sessionCookieHelper.setCookie(
      res,
      ADMIN_SESSION_COOKIE_NAME,
      result.token,
      { maxAgeMs: result.expiresAt.getTime() - Date.now() },
    );

    return { user: result.user };
  }

  /**
   * `OriginGuard` antes de `SessionAuthGuard` de propósito (decisão
   * explícita, AUTH-007): uma requisição mutável com origem inválida é
   * rejeitada antes de sequer consultar o hash do token no banco — a mesma
   * ordem seria desejável no login também, mas lá `RateLimitGuard` é quem
   * vem depois do `OriginGuard`, por razões da própria INF-007.
   *
   * `request.auth!`: o `SessionAuthGuard` já rodou com sucesso antes deste
   * método (senão teria lançado `401` e este código nunca seria alcançado)
   * — `request.auth` sempre populado aqui, mesmo raciocínio já aplicado à
   * remoção do `!session.user` redundante dentro do próprio guard
   * (AUTH-006).
   */
  @Post('logout')
  @UseGuards(OriginGuard, SessionAuthGuard)
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.logoutUseCase.execute({ sessionId: req.auth!.sessionId });
    this.sessionCookieHelper.clearCookie(res, ADMIN_SESSION_COOKIE_NAME);
  }

  /**
   * `GET /admin/auth/me` (AUTH-008) — usado pelo seletor de Site pós-login.
   *
   * Só `SessionAuthGuard`: `GET` não é mutável (`OriginGuard` só cobre
   * `POST`/`PATCH`/`DELETE`, mesmo critério de `MUTABLE_METHODS`), e não há
   * rate limit previsto para esta tarefa.
   *
   * `req.auth!.user`: reaproveita o `User` já resolvido pelo guard a partir
   * da `Session` — nenhuma consulta extra a `User` aqui.
   *
   * `active: true`: um `SiteUser` desativado não deve aparecer como Site
   * acessível no seletor (decisão explícita da AUTH-008). Isso não
   * substitui a AUTH-009 — cada rota protegida de escrita ainda vai validar
   * de novo, no momento da operação, que o vínculo está ativo e a Role é
   * suficiente; este endpoint só informa o estado atual pro seletor.
   *
   * Lista vazia é estado válido (AUTH-008/AUTH-011): usuário sem nenhum
   * `SiteUser` ativo autentica normalmente e recebe `sites: []`, nunca erro.
   *
   * `select` (não `include`): só os campos que o `meResponseSchema`
   * realmente expõe, nada a mais do modelo `Site` sai daqui. `orderBy` por
   * nome do Site: ordenação estável do seletor, não depende da ordem de
   * criação dos registros no banco.
   */
  @Get('me')
  @UseGuards(SessionAuthGuard)
  async me(@Req() req: Request): Promise<MeResponse> {
    const siteUsers = await this.prisma.siteUser.findMany({
      where: {
        userId: req.auth!.user.id,
        active: true,
      },
      select: {
        role: true,
        site: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
      orderBy: {
        site: {
          name: 'asc',
        },
      },
    });

    return {
      user: req.auth!.user,
      sites: siteUsers.map((siteUser) => ({
        siteId: siteUser.site.id,
        siteSlug: siteUser.site.slug,
        siteName: siteUser.site.name,
        role: siteUser.role,
      })),
    };
  }
}
