import { Test, TestingModule } from '@nestjs/testing';
import { CatalogModule } from '../src/modules/catalog/catalog.module';
import { DeleteOfferUseCase } from '../src/modules/catalog/application/delete-offer.use-case';
import { PrismaService } from '../src/shared/database/prisma.service';
import { Marketplace } from '../src/generated/prisma/enums';
import type { Offer, Product, Site } from '../src/generated/prisma/client';

/**
 * `DeleteOfferUseCase` (e2e, CAT-021) — operação **interna** do Catalog,
 * sem controller/rota HTTP própria. Mesmo padrão de
 * `delete-product.e2e-spec.ts` (CAT-014): chama o caso de uso diretamente
 * (sem HTTP), com Postgres real (mesmo requisito de `database.e2e-spec.ts`).
 *
 * O cenário de bloqueio usa uma fixture de `AffiliateClick` só para
 * provocar o `P2003` no banco (a única FK que aponta para `Offer` fora do
 * Catalog) — o teste verifica apenas o resultado genérico `HAS_DEPENDENTS`
 * do caso de uso, nunca importa `AffiliateClick` do código de produção do
 * Catalog (que segue sem conhecer esse conceito).
 *
 * Não há mais teste de "nenhuma rota HTTP expõe esta exclusão" aqui: a
 * TRK-010 criou o caminho HTTP real (`RemoveOfferController`, em
 * `ApplicationModule`), então essa afirmação deixou de ser verdadeira —
 * cobertura completa do endpoint (guards, `409`/`404`/`204`, isolamento
 * entre Sites) está em `remove-offer.e2e-spec.ts`. Esta suíte permanece
 * focada só no caso de uso interno (CAT-021), sem HTTP.
 */
describe('DeleteOfferUseCase (CAT-021, operação interna)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let useCase: DeleteOfferUseCase;
  let siteA: Site;
  let siteB: Site;
  let productA: Product;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CatalogModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    useCase = moduleRef.get(DeleteOfferUseCase);

    siteA = await prisma.site.create({
      data: {
        slug: 'cat021-site-a',
        name: 'Cat021 Site A',
        domain: 'cat021-site-a.test.com',
        locale: 'pt-BR',
      },
    });
    siteB = await prisma.site.create({
      data: {
        slug: 'cat021-site-b',
        name: 'Cat021 Site B',
        domain: 'cat021-site-b.test.com',
        locale: 'pt-BR',
      },
    });

    productA = await prisma.product.create({
      data: { siteId: siteA.id, name: 'Fone Bluetooth', slug: 'fone-bluetooth' },
    });
  });

  afterEach(async () => {
    await prisma.affiliateClick.deleteMany({
      where: { site: { slug: { startsWith: 'cat021-' } } },
    });
    await prisma.offer.deleteMany({
      where: { site: { slug: { startsWith: 'cat021-' } } },
    });
    await prisma.product.deleteMany({
      where: { site: { slug: { startsWith: 'cat021-' } } },
    });
    await prisma.site.deleteMany({ where: { slug: { startsWith: 'cat021-' } } });
  });

  async function createOffer(site: Site, product: Product): Promise<Offer> {
    return prisma.offer.create({
      data: {
        siteId: site.id,
        productId: product.id,
        marketplace: Marketplace.MERCADO_LIVRE,
        price: '99.90',
        affiliateUrl: 'https://mercadolivre.com.br/produto/exemplo',
      },
    });
  }

  it('sucesso: exclui fisicamente a Oferta sem dependentes', async () => {
    const offer = await createOffer(siteA, productA);

    const result = await useCase.execute({ siteId: siteA.id, id: offer.id });

    expect(result).toEqual({ ok: true });
    const persisted = await prisma.offer.findUnique({ where: { id: offer.id } });
    expect(persisted).toBeNull();
  });

  it('bloqueado por dependente externo (AffiliateClick): HAS_DEPENDENTS, Oferta e dependente continuam persistidos', async () => {
    const offer = await createOffer(siteA, productA);
    const click = await prisma.affiliateClick.create({
      data: { siteId: siteA.id, offerId: offer.id },
    });

    const result = await useCase.execute({ siteId: siteA.id, id: offer.id });

    expect(result).toEqual({ ok: false, reason: 'HAS_DEPENDENTS' });

    const persistedOffer = await prisma.offer.findUnique({ where: { id: offer.id } });
    const persistedClick = await prisma.affiliateClick.findUnique({ where: { id: click.id } });
    expect(persistedOffer).not.toBeNull();
    expect(persistedClick).not.toBeNull();
  });

  it('id inexistente no próprio Site: NOT_FOUND', async () => {
    const result = await useCase.execute({
      siteId: siteA.id,
      id: '00000000-0000-0000-0000-000000000000',
    });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('id de Oferta real de outro Site: NOT_FOUND (isolamento), Oferta do outro Site preservada', async () => {
    const productFromSiteB = await prisma.product.create({
      data: { siteId: siteB.id, name: 'Do Site B', slug: 'do-site-b' },
    });
    const offerFromSiteB = await createOffer(siteB, productFromSiteB);

    const result = await useCase.execute({ siteId: siteA.id, id: offerFromSiteB.id });

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });

    const persisted = await prisma.offer.findUnique({
      where: { id: offerFromSiteB.id },
    });
    expect(persisted).not.toBeNull();
  });
});
