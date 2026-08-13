import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { SiteRoleProvider, useSiteRole } from './site-role-context';

function RoleConsumer() {
  const role = useSiteRole();
  return <p>Role atual: {role}</p>;
}

describe('site-role-context', () => {
  it('useSiteRole fora do Provider lança erro', () => {
    // React loga o erro do render no console; suprimido aqui de propósito,
    // mesma técnica usada em testes de error boundary.
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => render(<RoleConsumer />)).toThrow('useSiteRole só pode ser usado dentro de AuthenticatedShell.');

    spy.mockRestore();
  });

  it('useSiteRole dentro do Provider devolve o valor fornecido', () => {
    render(
      <SiteRoleProvider value="EDITOR">
        <RoleConsumer />
      </SiteRoleProvider>,
    );

    expect(screen.getByText('Role atual: EDITOR')).toBeInTheDocument();
  });
});
