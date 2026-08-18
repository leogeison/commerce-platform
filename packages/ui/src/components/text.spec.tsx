import { render, screen } from '@testing-library/react';
import { Text } from './text';

describe('Text', () => {
  it('renders as <p> by default', () => {
    render(<Text>Conteúdo</Text>);
    const el = screen.getByText('Conteúdo');
    expect(el.tagName).toBe('P');
  });

  it('renders as the element passed via "as"', () => {
    render(<Text as="span">Página 1 de 3</Text>);
    expect(screen.getByText('Página 1 de 3').tagName).toBe('SPAN');
  });

  it('applies the variant class', () => {
    render(<Text variant="body-sm">Erro</Text>);
    expect(screen.getByText('Erro')).toHaveClass('text-body-sm');
  });

  it('applies the tone class', () => {
    render(<Text tone="danger">Erro</Text>);
    expect(screen.getByText('Erro')).toHaveClass('text-fg-danger');
  });

  it('preserves internal classes while appending consumer className', () => {
    render(<Text className="custom-extra">Conteúdo</Text>);
    const el = screen.getByText('Conteúdo');
    expect(el).toHaveClass('text-fg', 'text-body', 'font-ui', 'font-body', 'custom-extra');
  });
});
