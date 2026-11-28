import type { PrismaService } from '../../../shared/database/prisma.service';
import type { RecordAffiliateClickInput } from '../domain/affiliate-click-recorder';
import { PrismaAffiliateClickRepository } from './prisma-affiliate-click.repository';

const INPUT: RecordAffiliateClickInput = {
  siteId: 'site-1',
  offerId: 'offer-1',
  articleId: 'article-1',
  utmSource: 'newsletter',
  utmMedium: 'email',
  utmCampaign: 'black-friday',
  referer: 'https://origem.test.com/',
  userAgent: 'UA-Test/1.0',
  marketplace: 'AMAZON',
  articleCategoryId: 'category-1',
  outcome: 'REDIRECTED',
};

function buildRepository(findFirstResult: { id: string } | null = null) {
  const create = jest.fn().mockResolvedValue(undefined);
  const findFirst = jest.fn().mockResolvedValue(findFirstResult);
  const prisma = { affiliateClick: { create, findFirst } } as unknown as PrismaService;
  const repository = new PrismaAffiliateClickRepository(prisma);

  return { repository, create, findFirst };
}

describe('PrismaAffiliateClickRepository', () => {
  it('persiste todos os campos recebidos, sem clickedAt (default do banco)', async () => {
    const { repository, create } = buildRepository();

    await repository.record(INPUT);

    expect(create).toHaveBeenCalledWith({
      data: {
        siteId: INPUT.siteId,
        offerId: INPUT.offerId,
        articleId: INPUT.articleId,
        utmSource: INPUT.utmSource,
        utmMedium: INPUT.utmMedium,
        utmCampaign: INPUT.utmCampaign,
        referer: INPUT.referer,
        userAgent: INPUT.userAgent,
        marketplace: INPUT.marketplace,
        articleCategoryId: INPUT.articleCategoryId,
        outcome: INPUT.outcome,
      },
    });
  });

  it('UXP-006 — aplica os limites de entrada sem rejeitar: UTMs ≤ 200, User-Agent ≤ 512, referer só origem+caminho', async () => {
    const { repository, create } = buildRepository();
    await repository.record({
      ...INPUT,
      utmSource: 'a'.repeat(250),
      utmMedium: '',
      utmCampaign: '😀'.repeat(201),
      userAgent: 'u'.repeat(600),
      referer: 'https://busca.example/resultados?q=email%40pessoa.com#topo',
    });
    const data = create.mock.calls[0][0].data;
    expect(data.utmSource).toBe('a'.repeat(200));
    expect(data.utmMedium).toBeNull();
    expect(Array.from(data.utmCampaign as string)).toHaveLength(200);
    expect(data.userAgent).toHaveLength(512);
    expect(data.referer).toBe('https://busca.example/resultados');
  });

  it('UXP-006 — referer que não é URL http(s) vira null', async () => {
    const { repository, create } = buildRepository();
    await repository.record({ ...INPUT, referer: 'javascript:alert(1)' });
    await repository.record({ ...INPUT, referer: 'não é url' });
    expect(create.mock.calls[0][0].data.referer).toBeNull();
    expect(create.mock.calls[1][0].data.referer).toBeNull();
  });

  it('campos ausentes viram null explícito, nunca omitidos', async () => {
    const { repository, create } = buildRepository();
    const input: RecordAffiliateClickInput = {
      siteId: 'site-1',
      offerId: 'offer-1',
      articleId: null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      referer: null,
      userAgent: null,
      marketplace: 'SHOPEE',
      articleCategoryId: null,
      outcome: 'OFFER_ARCHIVED',
    };

    await repository.record(input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });

  describe('existsForOffer (TRK-010)', () => {
    it('devolve true quando findFirst encontra um clique', async () => {
      const { repository, findFirst } = buildRepository({ id: 'click-1' });

      const result = await repository.existsForOffer('site-1', 'offer-1');

      expect(result).toBe(true);
      expect(findFirst).toHaveBeenCalledWith({
        where: { siteId: 'site-1', offerId: 'offer-1' },
        select: { id: true },
      });
    });

    it('devolve false quando findFirst não encontra nenhum clique', async () => {
      const { repository } = buildRepository(null);

      const result = await repository.existsForOffer('site-1', 'offer-1');

      expect(result).toBe(false);
    });
  });
});
