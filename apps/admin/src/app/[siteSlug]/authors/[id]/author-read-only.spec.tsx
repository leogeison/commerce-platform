import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { AuthorReadOnly } from './author-read-only';

const baseAuthor = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  userId: null,
  name: 'Ana Souza',
  bio: 'Editora-chefe',
  avatarUrl: 'https://cdn.example.com/ana.jpg',
};

describe('AuthorReadOnly', () => {
  it('autor completo: mostra nome, bio e avatar (com alt igual ao nome), sem nenhum campo editável', () => {
    render(<AuthorReadOnly author={baseAuthor} />);

    expect(screen.getByRole('heading', { name: 'Ana Souza' })).toBeInTheDocument();
    expect(screen.getByText('Editora-chefe')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toHaveAttribute('src', 'https://cdn.example.com/ana.jpg');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('bio nula: mostra o rótulo "Sem bio"; avatar nulo: mostra o fallback de iniciais em vez de imagem', () => {
    render(<AuthorReadOnly author={{ ...baseAuthor, bio: null, avatarUrl: null }} />);

    expect(screen.getByText('Sem bio')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    const fallback = screen.getByText('AS');
    expect(fallback.closest('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = render(<AuthorReadOnly author={baseAuthor} />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
