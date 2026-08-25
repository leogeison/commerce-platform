import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { EmptyState, ErrorState, LoadingState } from './async-state';

describe('LoadingState', () => {
  it('renderiza o conteúdo recebido', () => {
    render(<LoadingState>Carregando...</LoadingState>);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
  });

  it('não é um live region assertivo nem um elemento com foco preso (não bloqueia navegação por teclado)', () => {
    render(<LoadingState>Carregando...</LoadingState>);
    const node = screen.getByText('Carregando...');
    expect(node).not.toHaveAttribute('role', 'alert');
    expect(node).not.toHaveAttribute('tabindex');
  });

  it('sem violação de acessibilidade (jest-axe)', async () => {
    const { container } = render(<LoadingState>Carregando...</LoadingState>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('ErrorState', () => {
  it('renderiza o conteúdo recebido com role="alert"', () => {
    render(<ErrorState>Não foi possível carregar.</ErrorState>);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar.');
  });

  it('sem violação de acessibilidade (jest-axe)', async () => {
    const { container } = render(<ErrorState>Não foi possível carregar.</ErrorState>);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('EmptyState', () => {
  it('renderiza o conteúdo recebido', () => {
    render(<EmptyState>Nenhum item encontrado.</EmptyState>);
    expect(screen.getByText('Nenhum item encontrado.')).toBeInTheDocument();
  });

  it('sem violação de acessibilidade (jest-axe)', async () => {
    const { container } = render(<EmptyState>Nenhum item encontrado.</EmptyState>);
    expect(await axe(container)).toHaveNoViolations();
  });
});
