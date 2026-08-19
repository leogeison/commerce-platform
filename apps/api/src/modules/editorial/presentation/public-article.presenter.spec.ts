import { toPublicArticle } from './public-article.presenter';
import type { PublishedArticleWithProducts } from '../infrastructure/prisma-article.repository';

/**
 * Primeiro spec de presenter deste projeto (não há precedente em
 * `apps/api` — presenters eram cobertos só via e2e até aqui). Criado por
 * decisão explícita da UXF-011: `toPublicArticleAuthor` é mapping novo de
 * fato (Autor vinculado vs. ausente), não cópia 1:1 de campo, e a tarefa
 * tem um critério explícito de teste unitário.
 *
 * Cobre só o campo `author` — o restante de `toPublicArticle`/
 * `toPublicArticleSummary` (campos de `category`/`products`) já não muda
 * nesta tarefa e não tem precedente de teste unitário no projeto.
 *
 * `author` do fake sempre tem exatamente a forma `{ name, avatarUrl } |
 * null` — o mesmo shape que `findOnePublishedBySite` já entrega via
 * `select: { name: true, avatarUrl: true } }` (UXF-011). Nenhum campo
 * interno (`id`/`siteId`/`userId`/`bio`) é fabricado via cast aqui: a
 * proteção real contra esse vazamento fica no e2e
 * (`get-public-article.e2e-spec.ts`), com um Author real no banco.
 */
function buildArticle(
  author: { name: string; avatarUrl: string | null } | null,
): PublishedArticleWithProducts {
  return {
    id: 'article-1',
    category: { slug: 'categoria-1' },
    type: 'REVIEW',
    title: 'Título do Artigo',
    slug: 'artigo-1',
    metaDescription: null,
    coverImageUrl: null,
    publishedAt: new Date('2026-01-01T00:00:00.000Z'),
    bodyMdx: '# Corpo',
    products: [],
    author,
  } as unknown as PublishedArticleWithProducts;
}

describe('toPublicArticle — author (UXF-011)', () => {
  it('Autor com avatar: author com name/avatarUrl exatamente como devolvido pelo repository', () => {
    const article = buildArticle({
      name: 'Autora Exemplo',
      avatarUrl: 'https://cdn.test.com/avatar.jpg',
    });

    const result = toPublicArticle(article);

    expect(result.author).toEqual({
      name: 'Autora Exemplo',
      avatarUrl: 'https://cdn.test.com/avatar.jpg',
    });
  });

  it('Autor sem avatar: avatarUrl null', () => {
    const article = buildArticle({ name: 'Autor Sem Avatar', avatarUrl: null });

    const result = toPublicArticle(article);

    expect(result.author).toEqual({ name: 'Autor Sem Avatar', avatarUrl: null });
  });

  it('sem Autor vinculado: author null', () => {
    const article = buildArticle(null);

    const result = toPublicArticle(article);

    expect(result.author).toBeNull();
  });
});
