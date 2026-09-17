import { RevalidateCategoryUseCase } from './revalidate-category.use-case';
import type { RevalidationPort } from '../../revalidation/domain/revalidation.port';

describe('RevalidateCategoryUseCase', () => {
  function build(revalidateImpl: () => Promise<void>) {
    const revalidationPort = {
      revalidate: jest.fn().mockImplementation(revalidateImpl),
    } as unknown as jest.Mocked<RevalidationPort>;

    const useCase = new RevalidateCategoryUseCase(revalidationPort);

    return { useCase, revalidationPort };
  }

  const input = {
    siteId: 'site-1',
    siteSlug: 'fastcompre',
    categoryId: 'category-1',
  };

  it('sucesso: chama RevalidationPort.revalidate uma vez, só com siteSlug (sem articleSlug)', async () => {
    const { useCase, revalidationPort } = build(() => Promise.resolve());

    await useCase.execute(input);

    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
    expect(revalidationPort.revalidate).toHaveBeenCalledWith({ siteSlug: 'fastcompre' });
  });

  it('falha do RevalidationPort: captura, loga, e ainda assim resolve sem lançar', async () => {
    const { useCase, revalidationPort } = build(() =>
      Promise.reject(new Error('revalidação indisponível')),
    );

    await expect(useCase.execute(input)).resolves.toBeUndefined();
    expect(revalidationPort.revalidate).toHaveBeenCalledTimes(1);
  });
});
