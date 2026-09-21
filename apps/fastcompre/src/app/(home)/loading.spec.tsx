import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import Loading from './loading';

/**
 * apps/fastcompre/src/app/(home)/loading.spec.tsx
 *
 * `Loading` é um Server Component estático (sem fetch, sem estado) — não
 * precisa de mock nem de `jest.doMock`, `renderToStaticMarkup` direto
 * basta, mesmo padrão de `page.spec.tsx` para os casos sem dependência
 * externa.
 */
describe('Loading (Home)', () => {
  it('anuncia o carregamento a tecnologia assistiva sem depender dos blocos placeholder', () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toContain('role="status"');
    expect(html).toContain('Carregando artigos');
  });

  it('marca os blocos placeholder como decorativos (aria-hidden) e sem nenhum elemento interativo', () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
  });

  it('não usa nenhuma classe de animação (decisão fechada: loading estático, sem animação)', () => {
    const html = renderToStaticMarkup(<Loading />);

    expect(html).not.toContain('animate-pulse');
    expect(html).not.toContain('animate-spin');
  });
});
