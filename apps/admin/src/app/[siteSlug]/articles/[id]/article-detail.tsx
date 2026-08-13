'use client';

import { useEffect, useState } from 'react';
import { articleAdminSchema, type ArticleAdmin, type UpdateArticleRequest } from '@commerce-platform/contracts';
import { apiRequest } from '../../../../lib/api-client';
import { AdminApiError } from '../../../../lib/api-error';
import { ArticleForm, type ArticleFormValues } from '../article-form';
import { ArticleProductsReadOnly } from './article-products-read-only';
import { ArticleProductsSection } from './article-products-section';
import { ArticleReadOnly } from './article-read-only';
import { ArticleTransitionPanel } from './article-transition-panel';
import styles from './article-detail.module.css';

interface ArticleDetailProps {
  siteSlug: string;
  id: string;
}

type DetailState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; article: ArticleAdmin };

const GENERIC_LOAD_ERROR_MESSAGE = 'Não foi possível carregar este Artigo. Tente novamente em instantes.';
const BUSINESS_ERROR_STATUS_CODES = new Set([403, 404, 409, 422]);

function resolveErrorMessage(error: unknown, generic: string): string {
  if (
    error instanceof AdminApiError &&
    error.statusCode !== undefined &&
    BUSINESS_ERROR_STATUS_CODES.has(error.statusCode)
  ) {
    return error.message;
  }
  return generic;
}

function articlePath(siteSlug: string, id: string): string {
  return `/admin/sites/${encodeURIComponent(siteSlug)}/articles/${encodeURIComponent(id)}`;
}

/**
 * `/:siteSlug/articles/:id` (ADM-009) — carrega o Artigo e escolhe a
 * composição visual pelo `status`, nunca o mesmo formulário desabilitado
 * (Architecture.md §32: "Nunca a mesma tela com campos simplesmente
 * desabilitados — são composições visuais diferentes").
 *
 * `status === 'DRAFT'`: `ArticleForm` (edição completa) + `ArticleProductsSection`
 * (vínculo de Produtos, `EDT-010`) — as duas únicas peças do modo DRAFT
 * definidas em Architecture.md §32.
 *
 * `status !== 'DRAFT'` (ADM-010): `ArticleReadOnly` (conteúdo em modo
 * leitura) + `ArticleProductsReadOnly` (Produtos vinculados, sem mutação) +
 * `ArticleTransitionPanel` (ações válidas para o status atual) —
 * composição inteiramente diferente da de `DRAFT`, nunca o mesmo
 * formulário desabilitado (Architecture.md §32). Nenhum `/health`,
 * nenhuma leitura de Role do usuário atual aqui — isso é ADM-011/ADM-012.
 *
 * `DRAFT` ganha, além do já existente, `ArticleTransitionPanel` só com a
 * ação externa "Enviar para revisão" — orquestrada por este componente via
 * `handleTransition`, nunca pelo próprio `ArticleForm` (que continua
 * responsável só pelos campos editáveis/salvamento, sem conhecer a máquina
 * de estados).
 *
 * `handleTransition` é o único callback usado pelas 5 transições
 * possíveis: recebe o `ArticleAdmin` já retornado pela própria API e
 * substitui `state.article` com ele — o próximo render escolhe a
 * composição certa pelo novo `status`, sem nenhum novo `GET /:id`.
 *
 * `handleUpdate` sempre envia todos os campos do `ArticleForm`, inclusive
 * `bodyMdx` quando vazio (`''`) — apagar o corpo inteiro é uma atualização
 * válida, diferente do `CREATE` (`CreateArticle`), que omite `bodyMdx`
 * vazio. Nunca envia `status`/`publishedAt`.
 */
export function ArticleDetail({ siteSlug, id }: ArticleDetailProps) {
  const [state, setState] = useState<DetailState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest(articlePath(siteSlug, id), articleAdminSchema)
      .then((article) => {
        if (!cancelled) {
          setState({ status: 'ready', article });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: resolveErrorMessage(error, GENERIC_LOAD_ERROR_MESSAGE) });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug, id]);

  async function handleUpdate(values: ArticleFormValues) {
    const body: UpdateArticleRequest = {
      type: values.type,
      title: values.title,
      slug: values.slug,
      categoryId: values.categoryId,
      authorId: values.authorId,
      metaDescription: values.metaDescription,
      coverImageUrl: values.coverImageUrl,
      bodyMdx: values.bodyMdx,
    };

    const article = await apiRequest(articlePath(siteSlug, id), articleAdminSchema, {
      method: 'PATCH',
      body,
    });
    setState({ status: 'ready', article });
  }

  function handleTransition(article: ArticleAdmin) {
    setState({ status: 'ready', article });
  }

  if (state.status === 'loading') {
    return <p className={styles.status}>Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className={styles.status}>
        {state.message}
      </p>
    );
  }

  const { article } = state;

  if (article.status !== 'DRAFT') {
    return (
      <div className={styles.readOnly}>
        <ArticleReadOnly siteSlug={siteSlug} article={article} />
        <ArticleProductsReadOnly siteSlug={siteSlug} articleId={id} />
        <ArticleTransitionPanel
          siteSlug={siteSlug}
          articleId={id}
          status={article.status}
          onTransition={handleTransition}
        />
      </div>
    );
  }

  return (
    <div className={styles.detail}>
      <ArticleForm
        siteSlug={siteSlug}
        initialValues={{
          type: article.type,
          title: article.title,
          slug: article.slug,
          categoryId: article.categoryId,
          authorId: article.authorId,
          metaDescription: article.metaDescription,
          bodyMdx: article.bodyMdx,
          coverImageUrl: article.coverImageUrl,
        }}
        submitLabel="Salvar"
        onSubmit={handleUpdate}
      />

      <ArticleProductsSection siteSlug={siteSlug} articleId={id} />

      <ArticleTransitionPanel
        siteSlug={siteSlug}
        articleId={id}
        status={article.status}
        onTransition={handleTransition}
      />
    </div>
  );
}
