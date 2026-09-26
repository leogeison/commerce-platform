import { describe, expect, it } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { Pagination } from './pagination';

/**
 * Testes de `resolvePageParam` (validação do parâmetro `page`) vivem em
 * `./pagination-window.spec.ts` — lógica pura, separada do componente
 * (ver comentário em `pagination-window.ts`). Este arquivo cobre só o
 * componente `Pagination` em si.
 */
describe('Pagination', () => {
  it('não renderiza nada quando há só uma página', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={1} totalPages={1} basePath="/" />);
    expect(html).toBe('');
  });

  it('não renderiza nada quando não há nenhuma página (totalPages 0)', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={1} totalPages={0} basePath="/" />);
    expect(html).toBe('');
  });

  it('gera href limpo (sem ?page=1) para a página 1, tanto na Home quanto na Categoria', () => {
    const home = renderToStaticMarkup(<Pagination currentPage={2} totalPages={3} basePath="/" />);
    expect(home).toContain('href="/"');
    expect(home).not.toContain('page=1');

    const category = renderToStaticMarkup(
      <Pagination currentPage={2} totalPages={3} basePath="/fones-bluetooth" />,
    );
    expect(category).toContain('href="/fones-bluetooth"');
    expect(category).not.toContain('page=1');
  });

  it('nenhum href gerado contém pageSize', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={3} totalPages={10} basePath="/fones-bluetooth" />);
    expect(html).not.toContain('pageSize');
  });

  it('marca a página atual com aria-current="page" e nunca como link', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={2} totalPages={3} basePath="/" />);
    expect(html).toContain('aria-current="page"');
    // A página atual (2) deve aparecer como <span>, não como <a href="/?page=2">.
    expect(html).not.toContain('href="/?page=2"');
    expect(html).toContain('aria-label="Página 2 de 3"');
  });

  it('renderiza os hrefs reais das demais páginas e de anterior/próxima', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={2} totalPages={3} basePath="/" />);
    expect(html).toContain('href="/"'); // página 1 (anterior e número 1, ambos limpos)
    expect(html).toContain('href="/?page=3"'); // próxima e número 3
  });

  it('janela truncada não duplica páginas nas bordas quando a janela central já as inclui', () => {
    // totalPages=3, currentPage=2: janela central (1..3) já cobre primeira e
    // última — não pode haver dois links para a página 1 nem para a 3.
    const html = renderToStaticMarkup(<Pagination currentPage={2} totalPages={3} basePath="/" />);
    const matchesPageOne = html.match(/>1<\/(a|span)>/g) ?? [];
    const matchesPageThree = html.match(/>3<\/(a|span)>/g) ?? [];
    expect(matchesPageOne).toHaveLength(1);
    expect(matchesPageThree).toHaveLength(1);
    expect(html).not.toContain('…');
  });

  it('insere reticências não focáveis quando há lacuna entre a janela central e as bordas', () => {
    const html = renderToStaticMarkup(<Pagination currentPage={5} totalPages={10} basePath="/" />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('…');
    // Reticências não podem ser um elemento focável/interativo.
    expect(html).not.toMatch(/<a[^>]*>…<\/a>/);
  });

  it('não renderiza o link "Anterior" na página 1 nem "Próxima" na última página', () => {
    const first = renderToStaticMarkup(<Pagination currentPage={1} totalPages={3} basePath="/" />);
    expect(first).not.toContain('Anterior');
    expect(first).toContain('Próxima');

    const last = renderToStaticMarkup(<Pagination currentPage={3} totalPages={3} basePath="/" />);
    expect(last).toContain('Anterior');
    expect(last).not.toContain('Próxima');
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = render(<Pagination currentPage={5} totalPages={10} basePath="/fones-bluetooth" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
