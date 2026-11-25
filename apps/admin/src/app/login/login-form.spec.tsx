import type { ContextType } from 'react';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { LoginForm } from './login-form';

/**
 * `NEXT_PUBLIC_API_URL` já vem fixado por `jest.setup.ts`
 * (`http://localhost:3000`) — mesmo padrão de `api-client.spec.ts`. Este
 * arquivo mocka `global.fetch` diretamente (não `apiRequest`), exercitando
 * a integração real entre `LoginForm` e `ADM-001`.
 *
 * `useRouter()` (`next/navigation`) não é mockado via `jest.mock` — sob o
 * transform SWC "server components aware" que `next/jest` usa para projetos
 * com `app/` (`serverComponents: true`), `jest.mock('next/navigation', ...)`
 * não intercepta o import feito de dentro de `login-form.tsx`: o factory
 * mockado nunca chega a ser chamado quando o módulo é importado por um
 * componente (confirmado isoladamente em sandbox), embora funcione se
 * chamado via `require` direto no próprio arquivo de teste — comportamento
 * específico desse pipeline, não do padrão documentado do Jest. Como
 * `useRouter()` internamente só lê `useContext(AppRouterContext)` e lança o
 * invariant "expected app router to be mounted" quando o contexto é `null`,
 * fornecer esse contexto real via `<AppRouterContext.Provider>` faz
 * `LoginForm` usar a implementação verdadeira de `useRouter`, sem precisar
 * mockar o módulo — mais robusto e não depende desse detalhe de transform.
 */
const mockReplace = jest.fn();

const mockRouter: ContextType<typeof AppRouterContext> = {
  back: jest.fn(),
  forward: jest.fn(),
  refresh: jest.fn(),
  push: jest.fn(),
  replace: mockReplace,
  prefetch: jest.fn(),
};

function renderLoginForm() {
  return render(
    <AppRouterContext.Provider value={mockRouter}>
      <LoginForm />
    </AppRouterContext.Provider>,
  );
}

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = jest.fn<typeof fetch>().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response);
}

const validLoginResponse = {
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'ana@fastcompre.com', name: 'Ana' },
};

describe('LoginForm', () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renderiza os campos de e-mail/senha e o botão de envio', () => {
    renderLoginForm();

    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('e-mail inválido: mostra erro de campo, não chama fetch', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>();
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'nao-e-email');
    await user.type(screen.getByLabelText('Senha'), 'senha-valida');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/e-?mail/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('senha vazia: mostra erro de campo, não chama fetch', async () => {
    const user = userEvent.setup();
    global.fetch = jest.fn<typeof fetch>();
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('submit válido e bem-sucedido: chama a API com credentials "include" e redireciona para "/"', async () => {
    const user = userEvent.setup();
    mockFetchOnce(200, validLoginResponse);
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-correta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));

    expect(global.fetch).toHaveBeenCalledWith('http://localhost:3000/admin/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ana@fastcompre.com', password: 'senha-correta' }),
    });
  });

  it('durante o envio: botão fica desabilitado com rótulo "Entrando...", enquanto a requisição está pendente', async () => {
    const user = userEvent.setup();
    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    global.fetch = jest.fn<typeof fetch>().mockReturnValue(pending);
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-correta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const button = await screen.findByRole('button', { name: 'Entrando...' });
    expect(button).toBeDisabled();
    expect(screen.getByLabelText('E-mail')).toBeDisabled();
    expect(screen.getByLabelText('Senha')).toBeDisabled();

    resolveFetch({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(validLoginResponse)),
    } as Response);

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/'));
  });

  it('401: mostra a mensagem genérica recebida da API', async () => {
    const user = userEvent.setup();
    mockFetchOnce(401, {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      error: 'Unauthorized',
      message: 'Credenciais inválidas.',
    });
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-errada');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Credenciais inválidas.');
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('429: mostra mensagem amigável própria, não o texto cru da API', async () => {
    const user = userEvent.setup();
    mockFetchOnce(429, {
      statusCode: 429,
      code: 'TOO_MANY_REQUESTS',
      error: 'Too Many Requests',
      message: 'ThrottlerException: Too Many Requests',
    });
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-correta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Muitas tentativas seguidas. Aguarde um instante antes de tentar novamente.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('ThrottlerException: Too Many Requests')).not.toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('erro inesperado (500, corpo fora do formato): mostra mensagem genérica segura', async () => {
    const user = userEvent.setup();
    mockFetchOnce(500, { unexpected: 'shape' });
    renderLoginForm();

    await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
    await user.type(screen.getByLabelText('Senha'), 'senha-correta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(
      await screen.findByText('Não foi possível entrar. Tente novamente em instantes.'),
    ).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  describe('UXP-004 — redesign', () => {
    it('campos com nome e autocomplete para gerenciadores de senha, e ícones decorativos', () => {
      const { container } = renderLoginForm();
      const email = screen.getByLabelText('E-mail');
      const password = screen.getByLabelText('Senha');
      expect(email).toHaveAttribute('name', 'email');
      expect(email).toHaveAttribute('autocomplete', 'email');
      expect(password).toHaveAttribute('name', 'password');
      expect(password).toHaveAttribute('autocomplete', 'current-password');
      expect(password).toHaveAttribute('type', 'password');
      for (const svg of container.querySelectorAll('svg')) {
        expect(svg).toHaveAttribute('aria-hidden', 'true');
      }
    });

    it('mostrar/ocultar senha: nome acessível dinâmico, aria-controls, sem aria-pressed, foco permanece no controle', async () => {
      const user = userEvent.setup();
      renderLoginForm();
      const password = screen.getByLabelText('Senha');
      const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
      expect(toggle).toHaveAttribute('type', 'button');
      expect(toggle).toHaveAttribute('aria-controls', 'password');
      expect(toggle).not.toHaveAttribute('aria-pressed');

      await user.type(password, 'segredo');
      await user.click(toggle);
      expect(password).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveFocus();
      expect(password).toHaveAttribute('autocomplete', 'current-password');

      await user.keyboard('{Enter}');
      expect(password).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: 'Mostrar senha' })).toHaveFocus();
    });

    it('a senha volta a ficar oculta ao enviar (inclusive quando a validação falha)', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn<typeof fetch>();
      renderLoginForm();
      await user.type(screen.getByLabelText('Senha'), 'segredo');
      await user.click(screen.getByRole('button', { name: 'Mostrar senha' }));
      expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');

      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('foco vai para o primeiro campo inválido: e-mail antes de senha; só senha inválida foca a senha', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn<typeof fetch>();
      renderLoginForm();

      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(screen.getByLabelText('E-mail')).toHaveFocus();

      await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));
      expect(screen.getByLabelText('Senha')).toHaveFocus();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('durante o envio: formulário com aria-busy e controle de senha desabilitado', async () => {
      const user = userEvent.setup();
      global.fetch = jest.fn<typeof fetch>().mockReturnValue(new Promise<Response>(() => {}));
      const { container } = renderLoginForm();
      await user.type(screen.getByLabelText('E-mail'), 'ana@fastcompre.com');
      await user.type(screen.getByLabelText('Senha'), 'senha-correta');
      await user.click(screen.getByRole('button', { name: 'Entrar' }));

      await screen.findByRole('button', { name: 'Entrando...' });
      // O nome acessível do formulário vem do H1 da página (coberto em
      // `login-page.spec.tsx`); renderizado isolado, busca-se o <form>.
      expect(container.querySelector('form')).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByRole('button', { name: 'Mostrar senha' })).toBeDisabled();
    });
  });
});
