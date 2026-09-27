import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import NotFound from './not-found';

/**
 * Componente puro (sem `fetch`/props) — mesma disciplina de teste do
 * `not-found.tsx` de Artigo (`[categorySlug]/[articleSlug]/not-found.spec.tsx`):
 * renderizado diretamente, sem `jest.doMock`/import dinâmico. Não testa
 * internals do Next.js (roteamento de `not-found.tsx`, status HTTP) — isso é
 * comportamento do framework, fora do escopo desta tarefa; os specs de
 * `page.spec.tsx` de Home/Categoria já cobrem que `notFound()` é chamado nos
 * casos corretos (mockado), sem renderizar este boundary real.
 */
describe('NotFound', () => {
  it('mostra título, mensagem e link para a Home', () => {
    const html = renderToStaticMarkup(<NotFound />);

    expect(html).toContain('Página não encontrada');
    expect(html).toContain('não existe ou não está mais disponível');
    expect(html).toContain('href="/"');
    expect(html).toContain('Voltar para a Home');
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<NotFound />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
