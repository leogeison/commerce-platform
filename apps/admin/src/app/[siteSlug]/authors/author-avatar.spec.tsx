import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { AuthorAvatar } from './author-avatar';

describe('AuthorAvatar', () => {
  it('nome com duas palavras: mostra iniciais da primeira e da última palavra, maiúsculas', () => {
    render(<AuthorAvatar name="Ana Silva" avatarUrl={null} />);

    const fallback = screen.getByText('AS');
    expect(fallback.closest('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('espaços extras entre/ao redor das palavras não alteram as iniciais', () => {
    render(<AuthorAvatar name="  Ana   Silva  " avatarUrl={null} />);

    expect(screen.getByText('AS')).toBeInTheDocument();
  });

  it('nome de uma única palavra: usa somente sua primeira letra', () => {
    render(<AuthorAvatar name="Madonna" avatarUrl={null} />);

    expect(screen.getByText('M')).toBeInTheDocument();
  });

  it('nome vazio: o fallback permanece montado (mesmo footprint reservado), sem texto', () => {
    const { container } = render(<AuthorAvatar name="" avatarUrl={null} />);

    const fallback = container.querySelector('[aria-hidden="true"]');
    expect(fallback).toBeInTheDocument();
    expect(fallback).toHaveTextContent('');
    expect(fallback).toHaveClass('w-40', 'aspect-square');
  });

  it('avatarUrl presente: renderiza uma imagem real com alt igual ao nome do Autor, sem o fallback', () => {
    render(<AuthorAvatar name="Ana Silva" avatarUrl="https://exemplo.com/avatar.jpg" />);

    const img = screen.getByRole('img', { name: 'Ana Silva' });
    expect(img).toHaveAttribute('src', 'https://exemplo.com/avatar.jpg');
    expect(screen.queryByText('AS')).not.toBeInTheDocument();
  });

  it('imagem real e fallback compartilham a mesma geometria (mesmo footprint, imagem sem distorção)', () => {
    const { rerender, container } = render(<AuthorAvatar name="Ana Silva" avatarUrl={null} />);

    const fallback = container.querySelector('[aria-hidden="true"]')!;
    expect(fallback).toHaveClass('w-40', 'max-w-full', 'aspect-square');

    rerender(<AuthorAvatar name="Ana Silva" avatarUrl="https://exemplo.com/avatar.jpg" />);

    const img = screen.getByRole('img', { name: 'Ana Silva' });
    expect(img).toHaveClass('w-40', 'max-w-full', 'aspect-square', 'object-cover');
  });
});
