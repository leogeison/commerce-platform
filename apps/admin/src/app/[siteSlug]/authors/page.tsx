import type { Metadata } from 'next';
import { AuthorList } from './author-list';

interface AuthorsPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Autores — Commerce Platform Admin',
};

/**
 * `/:siteSlug/authors` (ADM-007; Architecture.md §32). Server Component
 * fino — só resolve `params` e repassa `siteSlug`. Toda a lógica fica em
 * `AuthorList` (`"use client"`), mesma fronteira estreita já usada nas
 * demais páginas do Admin.
 */
export default async function AuthorsPage({ params }: AuthorsPageProps) {
  const { siteSlug } = await params;

  return <AuthorList siteSlug={siteSlug} />;
}
