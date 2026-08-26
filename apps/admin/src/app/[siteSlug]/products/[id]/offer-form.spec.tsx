import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { AdminApiError } from '../../../../lib/api-error';
import { UnsavedChangesProvider } from '../../unsaved-changes-context';
import { OfferForm, type OfferFormInitialValues, type OfferFormValues } from './offer-form';

type SubmitFn = (values: OfferFormValues) => Promise<void>;

const initialValues: OfferFormInitialValues = {
  marketplace: 'MERCADO_LIVRE',
  price: '',
  currency: 'BRL',
  affiliateUrl: '',
  inStock: true,
};

/**
 * `OfferForm` chama `useSyncFormDirty` (UXA-014) incondicionalmente — todo
 * render precisa de `UnsavedChangesProvider` como ancestral, mesmo critério
 * já usado em `product-form.spec.tsx`/`category-form.spec.tsx`.
 */
function renderForm(props: Partial<Parameters<typeof OfferForm>[0]> = {}) {
  return render(
    <UnsavedChangesProvider>
      <OfferForm
        initialValues={initialValues}
        submitLabel="Criar"
        onSubmit={jest.fn<SubmitFn>()}
        onCancel={jest.fn()}
        {...props}
      />
    </UnsavedChangesProvider>,
  );
}

describe('OfferForm', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderiza os valores iniciais', () => {
    renderForm({ initialValues: { ...initialValues, price: '99.90', affiliateUrl: 'https://exemplo.com/produto' } });

    expect(screen.getByLabelText('Preço')).toHaveValue('99.90');
    expect(screen.getByLabelText('Moeda')).toHaveValue('BRL');
    expect(screen.getByLabelText('URL de afiliado')).toHaveValue('https://exemplo.com/produto');
    expect(screen.getByLabelText('Em estoque')).toBeChecked();
  });

  it('preço/URL inválidos: mostra erro de campo, não chama onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>();
    renderForm({ onSubmit });

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submit válido: chama onSubmit com os valores', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    renderForm({ onSubmit });

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
    renderForm({
      initialValues: { ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' },
      submitLabel: 'Salvar',
      onSubmit,
    });

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
    renderForm({
      initialValues: { ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' },
      submitLabel: 'Salvar',
      onSubmit,
    });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Oferta inválida.')).toBeInTheDocument();
  });

  it('erro inesperado: mostra mensagem genérica fixa', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockRejectedValue(new Error('network down'));
    renderForm({
      initialValues: { ...initialValues, price: '10.00', affiliateUrl: 'https://exemplo.com' },
      submitLabel: 'Salvar',
      onSubmit,
    });

    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText('Não foi possível salvar a Oferta. Tente novamente em instantes.'),
    ).toBeInTheDocument();
  });

  it('cancelar: chama onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = jest.fn();
    renderForm({ onCancel });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
  });

  // --- UXA-014 ---

  it('submit inválido: foco move para o primeiro campo inválido (shouldFocusError)', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(screen.getByLabelText('Preço')).toHaveFocus());
  });

  it('currency/inStock nascem definidos com os defaults canônicos do contrato (BRL/true), mesmo omitidos em initialValues', () => {
    const partialInitialValues: OfferFormInitialValues = {
      marketplace: 'MERCADO_LIVRE',
      price: '99.90',
      affiliateUrl: 'https://exemplo.com/produto',
    };
    renderForm({ initialValues: partialInitialValues });

    // O campo já nasce com o valor canônico ANTES de qualquer submit —
    // não é só o payload final que fica correto (isso é coberto pelo
    // teste seguinte).
    expect(screen.getByLabelText('Moeda')).toHaveValue('BRL');
    expect(screen.getByLabelText('Em estoque')).toBeChecked();
  });

  it('submit válido com initialValues sem currency/inStock: onSubmit recebe os defaults canônicos (BRL/true)', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn<SubmitFn>().mockResolvedValue(undefined);
    const partialInitialValues: OfferFormInitialValues = {
      marketplace: 'MERCADO_LIVRE',
      price: '',
      affiliateUrl: '',
    };
    renderForm({ initialValues: partialInitialValues, onSubmit });

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

  it('onDirtyChange: chamado com false no mount, true após alterar um campo, e false no desmonte', async () => {
    const user = userEvent.setup();
    const onDirtyChange = jest.fn();
    const { unmount } = renderForm({ onDirtyChange });

    expect(onDirtyChange).toHaveBeenCalledWith(false);
    onDirtyChange.mockClear();

    await user.type(screen.getByLabelText('Preço'), '9');

    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true));

    onDirtyChange.mockClear();
    unmount();

    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  it('não tem violação de acessibilidade (jest-axe)', async () => {
    const { container } = renderForm({
      initialValues: { ...initialValues, price: '99.90', affiliateUrl: 'https://exemplo.com/produto' },
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
