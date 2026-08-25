import type { ComponentProps } from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { Topbar } from './topbar';

const sites = [
  {
    siteId: '22222222-2222-4222-8222-222222222222',
    siteSlug: 'fastcompre',
    siteName: 'FastCompre',
    role: 'OWNER' as const,
  },
  {
    siteId: '33333333-3333-4333-8333-333333333333',
    siteSlug: 'outra-marca',
    siteName: 'Outra Marca',
    role: 'EDITOR' as const,
  },
];

function renderTopbar(overrides: Partial<ComponentProps<typeof Topbar>> = {}) {
  const onSiteChange = jest.fn();
  const onLogout = jest.fn();
  const onOpenPalette = jest.fn();
  const utils = render(
    <Topbar
      siteSlug="fastcompre"
      sites={sites}
      onSiteChange={onSiteChange}
      isLoggingOut={false}
      logoutError={false}
      onLogout={onLogout}
      isPaletteOpen={false}
      onOpenPalette={onOpenPalette}
      paletteId="command-palette-test"
      {...overrides}
    />,
  );
  return { ...utils, onSiteChange, onLogout, onOpenPalette };
}

describe('Topbar', () => {
  it('renderiza o seletor de Site com o valor atual e chama onSiteChange ao trocar', async () => {
    const user = userEvent.setup();
    const { onSiteChange } = renderTopbar();

    const select = screen.getByRole('combobox', { name: 'Site' });
    expect(select).toHaveValue('fastcompre');

    await user.selectOptions(select, 'Outra Marca');

    expect(onSiteChange).toHaveBeenCalled();
  });

  it('trigger da Command Palette é um botão real, habilitado, com aria-haspopup/aria-controls/aria-keyshortcuts', () => {
    renderTopbar();

    const trigger = screen.getByRole('button', { name: 'Busca rápida' });
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'command-palette-test');
    expect(trigger).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K');
  });

  it('clique no trigger da Command Palette chama onOpenPalette', async () => {
    const user = userEvent.setup();
    const { onOpenPalette } = renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Busca rápida' }));

    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it('isPaletteOpen=true reflete aria-expanded do trigger', () => {
    renderTopbar({ isPaletteOpen: true });

    expect(screen.getByRole('button', { name: 'Busca rápida' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('ordem de tabulação inclui o trigger da Command Palette (agora habilitado) antes do menu de usuário', async () => {
    const user = userEvent.setup();
    renderTopbar();

    screen.getByRole('combobox', { name: 'Site' }).focus();
    await user.tab();

    expect(screen.getByRole('button', { name: 'Busca rápida' })).toHaveFocus();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Menu do usuário' })).toHaveFocus();
  });

  it('menu de usuário fechado por padrão', () => {
    renderTopbar();

    expect(screen.getByRole('button', { name: 'Menu do usuário' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('abre ao clicar no gatilho, com foco indo para "Sair"', async () => {
    const user = userEvent.setup();
    renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));

    expect(screen.getByRole('button', { name: 'Menu do usuário' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toHaveFocus();
  });

  it('abre por teclado (Enter no gatilho), mesmo comportamento do clique', async () => {
    const user = userEvent.setup();
    renderTopbar();

    screen.getByRole('button', { name: 'Menu do usuário' }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sair' })).toHaveFocus();
  });

  it('Escape fecha o menu e devolve foco ao gatilho', async () => {
    const user = userEvent.setup();
    renderTopbar();

    const trigger = screen.getByRole('button', { name: 'Menu do usuário' });
    await user.click(trigger);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('clique fora fecha o menu', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Fora</button>
        <Topbar
          siteSlug="fastcompre"
          sites={sites}
          onSiteChange={jest.fn()}
          isLoggingOut={false}
          logoutError={false}
          onLogout={jest.fn()}
          isPaletteOpen={false}
          onOpenPalette={jest.fn()}
          paletteId="command-palette-test"
        />
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fora' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Tab para fora do menu fecha sem deixar foco inconsistente', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Topbar
          siteSlug="fastcompre"
          sites={sites}
          onSiteChange={jest.fn()}
          isLoggingOut={false}
          logoutError={false}
          onLogout={jest.fn()}
          isPaletteOpen={false}
          onOpenPalette={jest.fn()}
          paletteId="command-palette-test"
        />
        <button type="button">Depois</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    await user.tab();

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depois' })).toHaveFocus();
  });

  it('ativar "Sair" chama onLogout sem fechar o menu automaticamente', async () => {
    const user = userEvent.setup();
    const { onLogout } = renderTopbar();

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));
    await user.click(screen.getByRole('menuitem', { name: 'Sair' }));

    expect(onLogout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('isLoggingOut=true: item mostra "Saindo..." desabilitado, menu continua aberto', async () => {
    const user = userEvent.setup();
    renderTopbar({ isLoggingOut: true });

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));

    expect(screen.getByRole('menuitem', { name: 'Saindo...' })).toBeDisabled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('logoutError=true: mostra alerta com o menu ainda aberto', async () => {
    const user = userEvent.setup();
    renderTopbar({ logoutError: true });

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível sair. Tente novamente em instantes.');
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('sem violação de acessibilidade (jest-axe) — fechado e aberto', async () => {
    const user = userEvent.setup();
    const { container } = renderTopbar();

    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Menu do usuário' }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
