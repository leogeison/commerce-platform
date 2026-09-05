import { describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ArticlePreview } from './article-preview';

/**
 * apps/admin/src/app/[siteSlug]/articles/article-preview-error.spec.tsx
 *
 * UXE-009 — Preview do Artigo.
 *
 * `article-preview.spec.tsx` também mocka `./compile-article-body` (mesma
 * técnica: `jest.mock()` estático, hoisted, sem `jest.resetModules`/import
 * dinâmico do componente) — os fakes lá resolvem com sucesso, com
 * conteúdo controlado por teste. Este arquivo fica separado por
 * organização (um arquivo por família de resultado: sucesso vs. rejeição),
 * não porque seja o único a mockar: não há entrada real conhecida, dentro
 * do subconjunto de Markdown aceito, que faça `evaluate()` real rejeitar
 * (CommonMark é permissivo por natureza) — o cenário de erro só é
 * exercitável mockando a rejeição diretamente.
 *
 * `ArticlePreview` é importado estaticamente, uma única vez — igual a
 * qualquer outro componente testado neste diretório. Nenhuma duplicação de
 * instância de `react` é possível aqui: nada recarrega módulos em nenhum
 * momento.
 */
// `jest.mock()` é hoisted pelo transform do Jest (babel-plugin-jest-hoist/
// equivalente do SWC) para antes de qualquer import deste arquivo, incluindo
// o `import { ArticlePreview }` acima — a posição textual abaixo dos imports
// segue a convenção usual (compatível com `eslint import/first`) e não
// afeta a ordem real de execução.
jest.mock('./compile-article-body', () => ({
  compileArticleBody: jest.fn(() => Promise.reject(new Error('falha simulada'))),
}));

describe('ArticlePreview — erro de compilação', () => {
  it('mostra erro genérico, sem quebrar, quando a compilação rejeita', async () => {
    render(<ArticlePreview bodyMdx={'Conteúdo qualquer.'} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ver preview' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível gerar o preview deste conteúdo.');
    });
  });
});
