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
};

function buildRepository() {
  const create = jest.fn().mockResolvedValue(undefined);
  const prisma = { affiliateClick: { create } } as unknown as PrismaService;
  const repository = new PrismaAffiliateClickRepository(prisma);

  return { repository, create };
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
      },
    });
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
    };

    await repository.record(input);

    expect(create).toHaveBeenCalledWith({ data: input });
  });
});
