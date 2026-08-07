import { ExecutionContext, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { Site } from '../../../generated/prisma/client';
import type { PrismaService } from '../../../shared/database/prisma.service';
import { PublicTenantGuard } from './public-tenant.guard';
import type { TenantContext } from '../domain/tenant-context';
import './tenant-context-request';

const SITE_ID = 'site-1';
const SITE_SLUG = 'loja-a';

type FakeRequest = Pick<Request, 'params'> & { tenant?: TenantContext };

/**
 * Mesmo padrão de `ExecutionContext` fake já usado em `rate-limit.guard.spec.ts`
 * (nenhum guard deste projeto ganha `TestingModule`/app Nest real para seu
 * próprio teste unitário) — só o suficiente para `switchToHttp().getRequest()`.
 */
function buildContext(siteSlug: string | undefined): {
  context: ExecutionContext;
  request: FakeRequest;
} {
  const request: FakeRequest = { params: { siteSlug } as never };

  return {
    context: {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
    request,
  };
}

function buildGuard(site: Pick<Site, 'id' | 'slug'> | null) {
  const findUnique = jest.fn().mockResolvedValue(site);
  const prisma = { site: { findUnique } } as unknown as PrismaService;
  const guard = new PublicTenantGuard(prisma);

  return { guard, findUnique };
}

describe('PublicTenantGuard', () => {
  it('Site encontrado: permite a requisição e preenche request.tenant com siteId/siteSlug', async () => {
    const { guard, findUnique } = buildGuard({ id: SITE_ID, slug: SITE_SLUG });
    const { context, request } = buildContext(SITE_SLUG);

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(findUnique).toHaveBeenCalledWith({
      where: { slug: SITE_SLUG },
      select: { id: true, slug: true },
    });
    expect(request.tenant).toEqual({ siteId: SITE_ID, siteSlug: SITE_SLUG });
  });

  it('Site inexistente: lança 404 e não preenche request.tenant', async () => {
    const { guard } = buildGuard(null);
    const { context, request } = buildContext('site-inexistente');

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
    expect(request.tenant).toBeUndefined();
  });
});
