import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { CategoryReadOnly } from './category-read-only';

const baseCategory = {
  id: '11111111-1111-4111-8111-111111111111',
  siteId: '22222222-2222-4222-8222-222222222222',
  name: 'Eletrônicos',
  slug: 'eletronicos',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('CategoryReadOnly', () => {
  it('categoria ativa: mostra nome, slug e status "Ativa", sem nenhum campo editável', () => {
    render(<CategoryReadOnly category={baseCategory} />);

    expect(screen.getByRole('heading', { name: 'Eletrônicos' })).toBeInTheDocument();
    expect(screen.getByText('eletronicos')).toBeInTheDocument();
    expect(screen.getByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('categoria arquivada: mostra status "Arquivada"', () => {
    render(<CategoryReadOnly category={{ ...baseCategory, archivedAt: '2026-01-02T00:00:00.000Z' }} />);

    expect(screen.getByText('Arquivada')).toBeInTheDocument();
  });
});
