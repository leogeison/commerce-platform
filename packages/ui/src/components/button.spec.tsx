import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('Button', () => {
  it('renders with accessible name from children', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('calls onClick on interaction', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Salvar</Button>);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled and not interactive when disabled prop is set', async () => {
    const onClick = jest.fn();
    const user = userEvent.setup();
    render(
      <Button disabled onClick={onClick}>
        Salvar
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Salvar' });
    expect(btn).toBeDisabled();
    await user.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('defaults to type="button"', () => {
    render(<Button>Salvar</Button>);
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveAttribute('type', 'button');
  });

  it('allows overriding type explicitly to "submit"', () => {
    render(<Button type="submit">Enviar</Button>);
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveAttribute('type', 'submit');
  });

  it('preserves internal classes while appending consumer className', () => {
    render(<Button className="custom-extra">Salvar</Button>);
    const btn = screen.getByRole('button', { name: 'Salvar' });
    expect(btn).toHaveClass('rounded-control', 'bg-accent', 'font-ui', 'font-action', 'custom-extra');
  });
});
