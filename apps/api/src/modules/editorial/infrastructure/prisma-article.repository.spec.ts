import { PrismaArticleRepository } from './prisma-article.repository';
import type { PrismaService } from '../../../shared/database/prisma.service';

/**
 * Primeiro spec de repository do projeto (UXF-012) — decisão explícita:
 * nenhum outro método de repository é testado diretamente contra um Prisma
 * mockado (todo o resto só é provado via e2e com Postgres real). Aqui a
 * cobertura existe porque o critério de aceite exige comprovar a cláusula
 * `orderBy` de fato montada (`chamada com updatedAt desc retorna a ordem
 * esperada`) — o repasse do parâmetro já é coberto no nível do use case
 * por `article-crud-use-cases.spec.ts`.
 *
 * `$transaction` mockado como a forma "array" real do Prisma usada por
 * `findManyBySite`: `this.prisma.article.findMany(...)` e
 * `this.prisma.article.count(...)` já são chamados (suas Promises já
 * existem) antes de `$transaction` receber o array — o mock só precisa
 * resolver as duas via `Promise.all`, sem reimplementar semântica de
 * transação real.
 */
function buildFakePrisma() {
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  const $transaction = jest.fn((ops: Promise<unknown>[]) => Promise.all(ops));

  const prisma = {
    article: { findMany, count },
    $transaction,
  } as unknown as PrismaService;

  return { prisma, findMany, count, $transaction };
}

const SITE_ID = 'site-1';

describe('PrismaArticleRepository.findManyBySite — orderBy (UXF-012)', () => {
  it('sem orderBy: usa createdAt desc + id asc, preservando where/skip/take', async () => {
    const { prisma, findMany, count } = buildFakePrisma();
    const repository = new PrismaArticleRepository(prisma);

    await repository.findManyBySite({ siteId: SITE_ID, page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith({
      where: { siteId: SITE_ID },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
    expect(count).toHaveBeenCalledWith({ where: { siteId: SITE_ID } });
  });

  it('orderBy updatedAt_desc: usa updatedAt desc + id asc, preservando where/skip/take', async () => {
    const { prisma, findMany, count } = buildFakePrisma();
    const repository = new PrismaArticleRepository(prisma);

    await repository.findManyBySite({
      siteId: SITE_ID,
      page: 2,
      pageSize: 10,
      orderBy: 'updatedAt_desc',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { siteId: SITE_ID },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(count).toHaveBeenCalledWith({ where: { siteId: SITE_ID } });
  });

  it('orderBy updatedAt_desc combinado com filtros: where continua completo, orderBy não interfere em filtros/tenancy', async () => {
    const { prisma, findMany } = buildFakePrisma();
    const repository = new PrismaArticleRepository(prisma);

    await repository.findManyBySite({
      siteId: SITE_ID,
      page: 1,
      pageSize: 20,
      status: 'DRAFT',
      categoryId: 'category-1',
      orderBy: 'updatedAt_desc',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { siteId: SITE_ID, status: 'DRAFT', categoryId: 'category-1' },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 20,
    });
  });

  /**
   * UXA-018 — mesma cobertura de tradução de `orderBy`, agora para
   * `publishedAt_desc` (extensão mínima autorizada nesta tarefa, seção
   * "Publicados recentemente" do Dashboard). Sem validação cruzada de
   * `status` aqui — combinado com `status: 'PUBLISHED'` só porque é como o
   * Dashboard de fato usa, não porque o repository exige essa combinação.
   */
  it('orderBy publishedAt_desc: usa publishedAt desc + id asc, preservando where/skip/take', async () => {
    const { prisma, findMany, count } = buildFakePrisma();
    const repository = new PrismaArticleRepository(prisma);

    await repository.findManyBySite({
      siteId: SITE_ID,
      page: 1,
      pageSize: 5,
      status: 'PUBLISHED',
      orderBy: 'publishedAt_desc',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { siteId: SITE_ID, status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }],
      skip: 0,
      take: 5,
    });
    expect(count).toHaveBeenCalledWith({ where: { siteId: SITE_ID, status: 'PUBLISHED' } });
  });
});
