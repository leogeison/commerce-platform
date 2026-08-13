'use client';

import { useEffect, useState } from 'react';
import type { ArticleAdmin, AuthorAdmin, CategoryAdmin } from '@commerce-platform/contracts';
import { fetchAllAuthors } from '../../../../lib/fetch-all-authors';
import { fetchAllCategories } from '../../../../lib/fetch-all-categories';
import { STATUS_LABELS, TYPE_LABELS } from '../../../../lib/article-labels';
import styles from './article-read-only.module.css';

interface ArticleReadOnlyProps {
  siteSlug: string;
  article: ArticleAdmin;
}

type CategoriesState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: CategoryAdmin[] };
type AuthorsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; items: AuthorAdmin[] };

const GENERIC_CATEGORY_ERROR_MESSAGE = 'Não foi possível carregar a Categoria.';
const GENERIC_AUTHOR_ERROR_MESSAGE = 'Não foi possível carregar o Autor.';
const NO_CATEGORY_LABEL = 'Sem categoria';
const NO_AUTHOR_LABEL = 'Sem autor';
const NO_META_DESCRIPTION_LABEL = 'Sem meta description';
const NO_COVER_IMAGE_LABEL = 'Sem capa';
const LOADING_LABEL = 'Carregando...';

/**
 * Apresentação simples e consistente para valores nulos (`categoryId`/
 * `authorId`/`metaDescription`/`coverImageUrl`) — só rótulo de exibição,
 * nenhuma regra de domínio nova (decisão fechada no desenho técnico da
 * ADM-010).
 */
function resolveCategoryLabel(article: ArticleAdmin, state: CategoriesState): string {
  if (article.categoryId === null) {
    return NO_CATEGORY_LABEL;
  }
  if (state.status === 'loading') {
    return LOADING_LABEL;
  }
  if (state.status === 'error') {
    return GENERIC_CATEGORY_ERROR_MESSAGE;
  }
  const category = state.items.find((item) => item.id === article.categoryId);
  return category ? `${category.name}${category.archivedAt ? ' (arquivada)' : ''}` : article.categoryId;
}

function resolveAuthorLabel(article: ArticleAdmin, state: AuthorsState): string {
  if (article.authorId === null) {
    return NO_AUTHOR_LABEL;
  }
  if (state.status === 'loading') {
    return LOADING_LABEL;
  }
  if (state.status === 'error') {
    return GENERIC_AUTHOR_ERROR_MESSAGE;
  }
  const author = state.items.find((item) => item.id === article.authorId);
  return author ? author.name : article.authorId;
}

/**
 * Composição somente leitura do conteúdo do Artigo (ADM-010), usada quando
 * `status !== 'DRAFT'` — estrutural e visualmente distinta de `ArticleForm`
 * (Architecture.md §32: "nunca a mesma tela com campos simplesmente
 * desabilitados — são composições visuais diferentes"): nenhum
 * `<input>`/`<textarea>`/`<select>` neste componente.
 *
 * Resolve Categoria/Autor com os mesmos `fetchAllCategories`/
 * `fetchAllAuthors` já usados por `ArticleForm` (ADM-009) — mesmo critério
 * de "dono único do dado": busca só o que precisa exibir, sem receber
 * essas listas prontas de `ArticleDetail`. Enquanto pendente, mostra
 * "Carregando..." só naquele campo, sem bloquear o restante da composição
 * (título/tipo/status/meta description/capa/corpo não dependem de nenhuma
 * chamada de rede — vêm direto de `article`).
 *
 * `bodyMdx` exibido como texto puro, preservando quebras de linha via CSS
 * (`white-space: pre-wrap`) — nenhum parser/renderizador de Markdown/MDX,
 * nenhuma nova dependência (decisão fechada no desenho técnico da ADM-010).
 */
export function ArticleReadOnly({ siteSlug, article }: ArticleReadOnlyProps) {
  const [categoriesState, setCategoriesState] = useState<CategoriesState>({ status: 'loading' });
  const [authorsState, setAuthorsState] = useState<AuthorsState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    fetchAllCategories(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setCategoriesState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCategoriesState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  useEffect(() => {
    let cancelled = false;

    fetchAllAuthors(siteSlug)
      .then((items) => {
        if (!cancelled) {
          setAuthorsState({ status: 'ready', items });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthorsState({ status: 'error' });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [siteSlug]);

  return (
    <div className={styles.view}>
      <h1>{article.title}</h1>

      <dl className={styles.summary}>
        <dt>Tipo</dt>
        <dd>{TYPE_LABELS[article.type]}</dd>

        <dt>Status</dt>
        <dd>{STATUS_LABELS[article.status]}</dd>

        <dt>Categoria</dt>
        <dd>{resolveCategoryLabel(article, categoriesState)}</dd>

        <dt>Autor</dt>
        <dd>{resolveAuthorLabel(article, authorsState)}</dd>

        <dt>Meta description</dt>
        <dd>{article.metaDescription ?? NO_META_DESCRIPTION_LABEL}</dd>
      </dl>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Capa</span>
        {article.coverImageUrl ? (
          <img src={article.coverImageUrl} alt="Capa do Artigo" className={styles.cover} />
        ) : (
          <p className={styles.status}>{NO_COVER_IMAGE_LABEL}</p>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Corpo (Markdown)</span>
        <p className={styles.body}>{article.bodyMdx}</p>
      </div>
    </div>
  );
}
