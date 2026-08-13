import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminApiError } from '../../../../lib/api-error';
import { OfferForm, type OfferFormValues } from './offer-form';

type SubmitFn = (values: OfferFormValues) => Promise<void>;

const initialValues: OfferFormValues = {
  marketplace: 'MERCADO_LIVRE',
  price: '',
  currency: 'BRL',
  affiliateUrl: '',
  inStock: true,
};

describe('OfferForm', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderiza os valores iniciais', () => {
    render(
      <OfferForm
        initialValues={{ ...initialValues, price: '99.90', affiliateUrl: 'https://exemplo.com/produto' }}
        submitLabel="Criar"
        onSubmit={jest.fn<SubmitFn>()}
        onCancel={jest.fn()}
      />,
    );

    expect(screen.getByLabelText('Preço')).toHaveValue('99.90');
    expect(screen.getByLabelText('Moeda')).toHaveValue('BRL');
    expect(screen.getByLabelText('URL de afiliado')).toHaveValue('https://exemplo.com/produto');
    expect(screen.getByLabelText('Em estoque')).toBeChecked();
  });

  it('preço/URL inválidos: mostra erro de campo, não chama onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>();
    render(<OfferForm initialValues={initialValues} submitLabel="Criar" onSubmit={onSubmit} onCancel={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit válido: chama onSubmit com os valores', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    render(<OfferForm initialValues={initialValues} submitLabel="Criar" onSubmit={onSubmit} onCancel={jest.fn()} />);

    await user.type(screen.getByLabelText('Preço'), '99.90');
    await user.type(screen.getByLabelText('URL de afiliado'), 'https://exemplo.com/produto');
    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        marketplace: 'MERCADO_LIVRE',
        price: '99.90',
        currency: 'BRL',
        affiliateUrl: 'https://exemplo.com/produto',
        inStock: true,
      }),
    );
  });

  it('durante o envio: desabilita campos e botão', async () => {
    const user = userEvent.setup();
    let resolveSubmit!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    });
    const onSubmit = jest.fn<SubmitFn>().mockReturnValue(pending);
    render(
      <OfferForm
        initialValues={{ ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('button', { name: 'Salvando...' })).toBeDisabled();
    expect(screen.getByLabelText('Preço')).toBeDisabled();

    resolveSubmit();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Salvar' })).not.toBeDisabled());
  });

  it('erro de negócio: mostra a mensagem da API', async () => {
    const user = userEvent.setup();
    const onSubmit = jest
      .fn<SubmitFn>()
      .mockRejectedValue(new AdminApiError('Oferta inválida.', { statusCode: 422 }));
    render(
      <OfferForm
        initialValues={{ ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Oferta inválida.')).toBeInTheDocument();
  });

  it('erro inesperado: mostra mensagem genérica fixa', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockRejectedValue(new Error('network down'));
    render(
      <OfferForm
        initialValues={{ ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' }}
        submitLabel="Salvar"
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a Oferta. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('cancelar: chama onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    render(<OfferForm initialValues={initialValues} submitLabel="Criar" onSubmit={jest.fn<SubmitFn>()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
