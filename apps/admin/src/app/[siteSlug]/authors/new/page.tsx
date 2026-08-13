import type { Metadata } from 'next';
import { CreateAuthor } from './create-author';

interface NewAuthorPageProps {
  params: Promise<{ siteSlug: string }>;
}

export const metadata: Metadata = {
  title: 'Novo Autor — Commerce Platform Admin',
};

export default async function NewAuthorPage({ params }: NewAuthorPageProps) {
  const { siteSlug } = await params;

  return <CreateAuthor siteSlug={siteSlug} />;
}
