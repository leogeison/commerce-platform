import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import ArticleNotFound from './not-found';

/**
 * Componente puro (sem `fetch`/props) — renderizado diretamente, sem
 * `jest.doMock`/import dinâmico. Não testa internals do Next.js (roteamento
 * de `not-found.tsx`, status HTTP): isso é comportamento do framework, fora
 * do escopo desta tarefa.
 */
describe('ArticleNotFound', () => {
  it('mostra título, mensagem e link para a Home', () => {
    const html = renderToStaticMarkup(<ArticleNotFound />);

    expect(html).toContain('Artigo não encontrado');
    expect(html).toContain('não existe ou não está mais disponível');
    expect(html).toContain('href="/"');
    expect(html).toContain('Voltar para a Home');
  });
});
