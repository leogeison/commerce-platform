'use client';

import { useRouter } from 'next/navigation';
import { articleAdminSchema, type CreateArticleRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { ArticleForm, type ArticleFormValues } from '../article-form';

interface CreateArticleProps {
  siteSlug: string;
}

const EMPTY_VALUES: ArticleFormValues = {
  type: 'REVIEW',
  title: '',
  slug: '',
  categoryId: null,
  authorId: null,
  metaDescription: null,
  bodyMdx: '',
  coverImageUrl: null,
};

/**
 * `POST /admin/sites/:siteSlug/articles` (EDT-006; ADM-009).
 * `createArticleRequestSchema` não aceita `null` em `categoryId`/`authorId`/
 * `metaDescription`/`coverImageUrl`/`bodyMdx` — só omitido ou valor — então
 * campos vazios vindos do `ArticleForm` são removidos do body aqui, nunca
 * enviados como `null`/`''` na criação (mesmo critério de `CreateProduct`/
 * `CreateAuthor`).
 *
 * `bodyMdx === ''` é tratado como os demais campos opcionais: omitido do
 * body, deixando o default `''` do schema Prisma prevalecer — decisão
 * fechada no desenho técnico da ADM-009, diferente do `PATCH`
 * (`ArticleDetail.handleUpdate`), que sempre envia `bodyMdx`, inclusive
 * vazio.
 *
 * Nunca envia `status`/`publishedAt` — Artigo sempre nasce `DRAFT`.
 */
export function CreateArticle({ siteSlug }: CreateArticleProps) {
  const router = useRouter();

  async function handleSubmit(values: ArticleFormValues) {
    const body: CreateArticleRequest = {
      type: values.type,
      title: values.title,
      slug: values.slug,
      ...(values.categoryId !== null ? { categoryId: values.categoryId } : {}),
      ...(values.authorId !== null ? { authorId: values.authorId } : {}),
      ...(values.metaDescription !== null ? { metaDescription: values.metaDescription } : {}),
      ...(values.coverImageUrl !== null ? { coverImageUrl: values.coverImageUrl } : {}),
      ...(values.bodyMdx !== '' ? { bodyMdx: values.bodyMdx } : {}),
    };

    const article = await apiRequest(
      `/admin/sites/${encodeURIComponent(siteSlug)}/articles`,
      articleAdminSchema,
      { method: 'POST', body },
    );

    router.replace(`/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(article.id)}`);
  }

  return <ArticleForm siteSlug={siteSlug} initialValues={EMPTY_VALUES} submitLabel="Criar" onSubmit={handleSubmit} />;
}
