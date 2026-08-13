'use client';

import type { AuthorAdmin } from '@commerce-platform/contracts';
import styles from './author-read-only.module.css';

interface AuthorReadOnlyProps {
  author: AuthorAdmin;
}

const NO_BIO_LABEL = 'Sem bio';
const NO_AVATAR_LABEL = 'Sem avatar';

/**
 * Composição somente leitura de Autor (ADM-012), usada quando a Role do
 * usuário no Site atual é `VIEWER` — mesmo princípio de `CategoryReadOnly`/
 * `ProductReadOnly`/`ArticleReadOnly`: nenhum `<input>`/`<textarea>`,
 * nenhum botão de ciclo de vida. Sem status de arquivamento (Author não
 * tem esse ciclo de vida — mesma observação já registrada em
 * `AuthorDetail`).
 *
 * `author` já vem carregado por `AuthorDetail` — sem fetch próprio.
 */
export function AuthorReadOnly({ author }: AuthorReadOnlyProps) {
  return (
    <div className={styles.view}>
      <h1>{author.name}</h1>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Bio</span>
        <p className={styles.body}>{author.bio ?? NO_BIO_LABEL}</p>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Avatar</span>
        {author.avatarUrl ? (
          <img src={author.avatarUrl} alt="Avatar do Autor" className={styles.avatar} />
        ) : (
          <p className={styles.status}>{NO_AVATAR_LABEL}</p>
        )}
      </div>
    </div>
  );
}
