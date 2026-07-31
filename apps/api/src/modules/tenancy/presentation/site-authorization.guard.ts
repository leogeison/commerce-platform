import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@commerce-platform/contracts';
import { PrismaService } from '../../../shared/database/prisma.service';
import { INVALID_SESSION_MESSAGE } from '../../identity/presentation/session-auth.guard';
import { resolveAdminTenantContext } from '../domain/tenant-context';
import { roleMeetsMinimum } from '../domain/role-hierarchy';
import { MIN_ROLE_METADATA_KEY } from './min-role.decorator';
import './tenant-context-request';

/**
 * Mesma mensagem para todo desfecho de autorização negada — Site
 * inexistente, sem `SiteUser`, `SiteUser` inativo ou Role insuficiente —
 * nunca revela qual dos casos ocorreu (decisão explícita da AUTH-009,
 * mesma filosofia de mensagem genérica já usada em `SessionAuthGuard`).
 */
const FORBIDDEN_MESSAGE = 'Acesso não autorizado para este Site.';

/**
 * Guard de autorização por Site/Role (AUTH-009; Architecture.md, Seção 16).
 *
 * Precisa rodar depois de `SessionAuthGuard` — `@UseGuards(SessionAuthGuard,
 * SiteAuthorizationGuard)` — porque depende de `request.auth.user` já
 * resolvido. Verificação explícita de `request.auth` (não `!`) porque este
 * guard é reutilizável entre módulos futuros (Catalog/Editorial): um erro
 * de composição de rota (esquecer o `SessionAuthGuard` antes) deve
 * continuar resultando no mesmo `401` genérico de sessão inválida, nunca
 * num `TypeError`/`500`.
 *
 * `siteSlug` vem sempre de parâmetro de rota (`request.params.siteSlug`,
 * convenção confirmada no Architecture.md — ex. `/admin/sites/:siteSlug/
 * uploads/images`), nunca de header/hostname/body (Seção 17).
 *
 * Falha fechada sem `@MinRole`: ao contrário do `RateLimitGuard` (que deixa
 * passar sem `@RateLimit`), aqui a ausência do decorator é tratada como
 * erro de configuração da rota e responde `403` — esquecer a política
 * mínima nunca libera acesso por acidente (decisão explícita da AUTH-009).
 *
 * Consulta relacional única: busca o `Site` pelo slug com o `SiteUser`
 * ativo daquele usuário aninhado (`take: 1`, já garantido único pela
 * constraint `@@unique([userId, siteId])` do schema). `resolveAdminTenantContext`
 * (INF-008, inalterado) continua sendo quem decide se o vínculo é válido —
 * inclusive a defesa contra `SiteUser` de outro Site; a checagem de Role
 * fica em `roleMeetsMinimum` (`tenancy/domain/role-hierarchy.ts`), separada
 * de propósito para não alterar o core já aprovado da AUTH-009/INF-008.
 */
@Injectable()
export class SiteAuthorizationGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const minimumRole = this.reflector.getAllAndOverride<Role | undefined>(
      MIN_ROLE_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!minimumRole) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    const request = context.switchToHttp().getRequest<Request>();

    if (!request.auth) {
      throw new UnauthorizedException(INVALID_SESSION_MESSAGE);
    }

    const userId = request.auth.user.id;
    const siteSlug = request.params.siteSlug as string | undefined;

    const site = siteSlug
      ? await this.prisma.site.findUnique({
          where: { slug: siteSlug },
          select: {
            id: true,
            slug: true,
            siteUsers: {
              where: { userId, active: true },
              take: 1,
              select: { siteId: true, userId: true, role: true },
            },
          },
        })
      : null;

    const membership = site?.siteUsers[0] ?? null;

    const resolution = resolveAdminTenantContext(
      site ? { id: site.id, slug: site.slug } : null,
      membership
        ? { siteId: membership.siteId, userId: membership.userId }
        : null,
    );

    if (!resolution.ok) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    if (!roleMeetsMinimum(membership!.role, minimumRole)) {
      throw new ForbiddenException(FORBIDDEN_MESSAGE);
    }

    request.tenant = resolution.context;
    return true;
  }
}
