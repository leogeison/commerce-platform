'use client';

import { Text } from '@commerce-platform/ui';
import type { AuthorAdmin } from '@commerce-platform/contracts';
import { AuthorAvatar } from '../author-avatar';

interface AuthorReadOnlyProps {
  author: AuthorAdmin;
}

const NO_BIO_LABEL = 'Sem bio';

/**
 * Composição somente leitura de Autor (ADM-012), usada quando a Role do
 * usuário no Site atual é `VIEWER` — mesmo princípio de `CategoryReadOnly`/
 * `ProductReadOnly`: nenhum `<input>`/`<textarea>`, nenhum botão de ciclo
 * de vida. Sem status de arquivamento (Author não tem esse ciclo de vida).
 *
 * `author` já vem carregado por `AuthorDetail` — sem fetch próprio.
 *
 * UXA-015 — apresentação migrada de CSS Module para Tailwind v4 + tokens
 * do design system + `Text` (`packages/ui`). O rótulo textual "Sem avatar"
 * que existia antes desta tarefa é removido: `AuthorAvatar` sempre mostra
 * algo (imagem real ou o fallback de iniciais), então não existe mais um
 * estado "nada para mostrar" que precise de rótulo próprio.
 */
export function AuthorReadOnly({ author }: AuthorReadOnlyProps) {
  return (
    <div className="flex max-w-xs flex-col gap-6">
      <h1 className="m-0 font-ui text-lg">{author.name}</h1>

      <div className="flex flex-col gap-1">
        <span className="font-ui text-body-sm font-action">Bio</span>
        <Text className="m-0 whitespace-pre-wrap">{author.bio ?? NO_BIO_LABEL}</Text>
      </div>

      <div className="flex flex-col gap-1">
        <span className="font-ui text-body-sm font-action">Avatar</span>
        <AuthorAvatar name={author.name} avatarUrl={author.avatarUrl} />
      </div>
    </div>
  );
}
