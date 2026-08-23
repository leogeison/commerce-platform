import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminApiError } from '../../../lib/api-error';
import { CategoryForm } from './category-form';

type SubmitFn = (values: { name: string; slug: string }) => Promise<void>;

describe('CategoryForm', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderiza os campos com os valores iniciais', () => {
    render(
      <CategoryForm
        initialValues={{ name: 'Eletrônicos', slug: 'eletronicos' }}
        submitLabel="Salvar"
        onSubmit={jest.fn<SubmitFn>()}
      />,
    );

    expect(screen.getByLabelText('Nome')).toHaveValue('Eletrônicos');
    expect(screen.getByLabelText('Slug')).toHaveValue('eletronicos');
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
  });

  it('campos vazios: mostra erro em cada campo, não chama onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>();
    render(<CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit válido: chama onSubmit com os valores digitados', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(<CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ name: 'Eletrônicos', slug: 'eletronicos' }));
  });

  it('durante o envio: desabilita campos e botão enquanto onSubmit está pendente', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = jest.fn<SubmitFn>().mockReturnValue(pending);
    render(<CategoryForm initialValues={{ name: 'Nome', slug: 'slug' }} submitLabel="Salvar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();
    expect(screen.getByLabelText('Nome')).toBeDisabled();
    expect(screen.getByLabelText('Slug')).toBeDisabled();

    resolveSubmit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled());
  });

  it('erro de negócio (status estruturado, ex.: 409): mostra a mensagem vinda da API', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(
        new AdminApiError('Já existe uma categoria com este slug neste Site.', {
          statusCode: 409,
          code: 'CONFLICT',
        }),
      );
    render(<CategoryForm initialValues={{ name: 'Nome', slug: 'slug' }} submitLabel="Salvar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Já existe uma categoria com este slug neste Site.')).toBeInTheDocument();
  });

  it('erro inesperado (rede/500): mostra mensagem genérica fixa, não o texto da API', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockRejectedValue(new Error('network down'));
    render(<CategoryForm initialValues={{ name: 'Nome', slug: 'slug' }} submitLabel="Salvar" onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a Categoria. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  // --- UXA-002: react-hook-form + zodResolver ---

  it('UXA-002: submissão inválida move o foco para o primeiro campo inválido (Nome)', async () => {
    const user = userEvent.setup();
    render(<CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveFocus());
  });

  it('UXA-002: submissão inválida marca aria-invalid e aria-describedby nos dois campos', async () => {
    const user = userEvent.setup();
    render(<CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    const nameInput = await screen.findByLabelText('Nome');
    const slugInput = screen.getByLabelText('Slug');

    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(nameInput).toHaveAttribute('aria-describedby', 'category-name-error');
    expect(document.getElementById('category-name-error')).toBeInTheDocument();
    expect(document.getElementById('category-slug-error')).toBeInTheDocument();

    expect(slugInput).toHaveAttribute('aria-invalid', 'true');
    expect(slugInput).toHaveAttribute('aria-describedby', 'category-slug-error');
  });

  it('UXA-002: estado inválido sem violação de acessibilidade (jest-axe)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} />,
    );

    await user.click(screen.getByRole('button', { name: 'Criar' }));
    await screen.findAllByRole('alert');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('UXA-002: falha na submissão ao servidor preserva os valores digitados (não reseta o formulário)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(new AdminApiError('Já existe uma categoria com este slug neste Site.', {
        statusCode: 409,
        code: 'CONFLICT',
      }));
    render(<CategoryForm initialValues={{ name: '', slug: '' }} submitLabel="Criar" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText('Nome'), 'Eletrônicos Portáteis');
    await user.type(screen.getByLabelText('Slug'), 'eletronicos-portateis');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await screen.findByText('Já existe uma categoria com este slug neste Site.');

    expect(screen.getByLabelText('Nome')).toHaveValue('Eletrônicos Portáteis');
    expect(screen.getByLabelText('Slug')).toHaveValue('eletronicos-portateis');
  });
});
