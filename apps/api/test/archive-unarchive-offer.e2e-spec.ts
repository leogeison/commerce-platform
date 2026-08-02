import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { ArchiveOfferUseCase } from '../src/modules/catalog/application/archive-offer.use-case';
import { UnarchiveOfferUseCase } from '../src/modules/catalog/application/unarchive-offer.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace } from '../src/generated/prisma/enums';
import type { Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * `ArchiveOfferUseCase`/`UnarchiveOfferUseCase` (e2e, CAT-019/CAT-020) —
 * operações **internas** do Catalog, sem controller/rota HTTP própria
 * (endpoint real é `REV-013`, ainda não implementado). Mesmo padrão de
 * `archive-unarchive-product.e2e-spec.ts`: chama os casos de uso
 * diretamente (sem HTTP), com Postgres real (mesmo requisito de
 * `database.e2e-spec.ts`).
 *
 * `app`/`supertest` só entram no teste final, para provar que nenhuma rota
 * HTTP alcança arquivar/desarquivar Oferta.
 */
describe('ArchiveOfferUseCase / UnarchiveOfferUseCase (CAT-019/CAT-020, operação interna)', () => {
  let app: INestApplication<App> | undefined;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let archiveUseCase: ArchiveOfferUseCase;
  let unarchiveUseCase: UnarchiveOfferUseCase;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    prisma = moduleRef.get(PrismaService);
    archiveUseCase = moduleRef.get(ArchiveOfferUseCase);
    unarchiveUseCase = moduleRef.get(UnarchiveOfferUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'cat019-site-a',
        name: 'Cat019 Site A',
        domain: 'cat019-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat019-site-b',
        name: 'Cat019 Site B',
        domain: 'cat019-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Fone Bluetooth', slug: 'fone-bluetooth' },
    });
  });

  afterEach(async () => {
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat019-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat019-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat019-' } } });

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  async function createOffer(site: Site, product: Product, archived = false): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '100.00',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
        archivedAt: archived ? new Date() : null,
      },
    });
  }

  describe('archive', () => {
    it('arquiva uma Oferta ativa: archivedAt preenchido', async () => {
      const offer = await createOffer(siteA, productA);

      const result = await archiveUseCase.execute({ siteId: siteA.id, id: offer.id });

      expect(result).not.toBeNull();
      expect(result?.archivedAt).not.toBeNull();
    });

    it('idempotente: arquivar duas vezes mantém o mesmo archivedAt', async () => {
      const offer = await createOffer(siteA, productA);

      const first = await archiveUseCase.execute({ siteId: siteA.id, id: offer.id });
      const second = await archiveUseCase.execute({ siteId: siteA.id, id: offer.id });

      expect(second?.archivedAt?.getTime()).toBe(first?.archivedAt?.getTime());
    });

    it('id inexistente no próprio Site: null', async () => {
      const result = await archiveUseCase.execute({
        siteId: siteA.id,
        id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result).toBeNull();
    });

    it('id de Oferta real de outro Site: null (isolamento), Oferta do outro Site inalterada', async () => {
      const productFromSiteB = await prisma.product.create({
        data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
      });
      const offerFromSiteB = await createOffer(siteB, productFromSiteB);

      const result = await archiveUseCase.execute({
        siteId: siteA.id,
        id: offerFromSiteB.id,
      });

      expect(result).toBeNull();

      const persisted = await prisma.offer.findUniqueOrThrow({
        where: { id: offerFromSiteB.id },
      });
      expect(persisted.archivedAt).toBeNull();
    });
  });

  describe('unarchive', () => {
    it('desarquiva uma Oferta arquivada: archivedAt: null', async () => {
      const offer = await createOffer(siteA, productA, true);

      const result = await unarchiveUseCase.execute({ siteId: siteA.id, id: offer.id });

      expect(result).not.toBeNull();
      expect(result?.archivedAt).toBeNull();
    });

    it('idempotente: desarquivar duas vezes mantém archivedAt: null', async () => {
      const offer = await createOffer(siteA, productA, true);

      const first = await unarchiveUseCase.execute({ siteId: siteA.id, id: offer.id });
      const second = await unarchiveUseCase.execute({ siteId: siteA.id, id: offer.id });

      expect(first?.archivedAt).toBeNull();
      expect(second?.archivedAt).toBeNull();
    });

    it('id inexistente no próprio Site: null', async () => {
      const result = await unarchiveUseCase.execute({
        siteId: siteA.id,
        id: '00000000-0000-0000-0000-000000000000',
      });

      expect(result).toBeNull();
    });

    it('id de Oferta real de outro Site: null (isolamento), Oferta do outro Site inalterada', async () => {
      const productFromSiteB = await prisma.product.create({
        data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
      });
      const offerFromSiteB = await createOffer(siteB, productFromSiteB, true);

      const result = await unarchiveUseCase.execute({
        siteId: siteA.id,
        id: offerFromSiteB.id,
      });

      expect(result).toBeNull();

      const persisted = await prisma.offer.findUniqueOrThrow({
        where: { id: offerFromSiteB.id },
      });
      expect(persisted.archivedAt).not.toBeNull();
    });
  });

  it('nenhuma rota HTTP expõe arquivar/desarquivar Oferta: 404', async () => {
    const offer = await createOffer(siteA, productA);

    const archiveResponse = await request(app!.getHttpServer()).post(
      `/admin/sites/${siteA.slug}/products/${productA.id}/offers/${offer.id}/archive`,
    );
    const unarchiveResponse = await request(app!.getHttpServer()).post(
      `/admin/sites/${siteA.slug}/products/${productA.id}/offers/${offer.id}/unarchive`,
    );

    expect(archiveResponse.status).toBe(404);
    expect(unarchiveResponse.status).toBe(404);
  });
});
