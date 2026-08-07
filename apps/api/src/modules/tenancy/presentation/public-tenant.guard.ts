import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../../../shared/database/prisma.service';
import { resolvePublicTenantContext } from '../domain/tenant-context';
import './tenant-context-request';

/**
 * Mesma mensagem de recurso inexistente já usada no resto do projeto
 * (`"X não encontrado(a)."`) — diferente de `SiteAuthorizationGuard`
 * (AUTH-009), aqui não há razão de segurança para ofuscar o motivo: um
 * `siteSlug` público "não é credencial nem prova de autorização"
 * (Architecture.md, Seção 17), resolver conteúdo não vaza nada sensível.
 */
const SITE_NOT_FOUND_MESSAGE = 'Site não encontrado.';

/**
 * Guard de resolução pública de `TenantContext` a partir de `siteSlug`
 * (TRK-002; INF-008, Architecture.md Seção 17: "`apps/fastcompre` nunca é
 * fonte confiável de `siteId` por header/hostname isoladamente. Em
 * endpoints públicos, pode enviar um identificador público `siteSlug`, que
 * a API resolve no `Site` real").
 *
 * Primeiro consumidor real de `resolvePublicTenantContext` (núcleo puro já
 * existente desde a INF-008/Fase 4, sem nenhum guard/controller usando-o
 * até aqui). Irmão de `SiteAuthorizationGuard`, mas deliberadamente mais
 * simples: sem sessão, sem `SiteUser`, sem Role — só confirma que o `Site`
 * existe.
 *
 * `siteSlug` sempre de parâmetro de rota (`request.params.siteSlug`),
 * nunca de header/hostname/body — mesma convenção de `SiteAuthorizationGuard`.
 *
 * Falha (`SITE_NOT_FOUND`) → `404`. Sucesso → `request.tenant` preenchido
 * com o `TenantContext` imutável (`{ siteId, siteSlug }`), mesma
 * augmentação de `Express.Request` já declarada em `tenant-context-request.ts`
 * (reaproveitada sem alteração — o tipo não é exclusivo do caminho admin).
 */
@Injectable()
export class PublicTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const siteSlug = request.params.siteSlug as string | undefined;

    const site = siteSlug
      ? await this.prisma.site.findUnique({
          where: { slug: siteSlug },
          select: { id: true, slug: true },
        })
      : null;

    const resolution = resolvePublicTenantContext(site);

    if (!resolution.ok) {
      throw new NotFoundException(SITE_NOT_FOUND_MESSAGE);
    }

    request.tenant = resolution.context;
    return true;
  }
}
