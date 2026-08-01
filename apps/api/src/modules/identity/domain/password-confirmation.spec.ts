import { validatePasswordConfirmation } from './password-confirmation';

describe('validatePasswordConfirmation', () => {
  it('rejeita senha vazia, mesmo com confirmação igualmente vazia', () => {
    expect(validatePasswordConfirmation('', '')).toEqual({
      ok: false,
      reason: 'EMPTY',
    });
  });

  it('rejeita senha vazia quando a confirmação não é vazia', () => {
    expect(validatePasswordConfirmation('', 'algo')).toEqual({
      ok: false,
      reason: 'EMPTY',
    });
  });

  it('rejeita quando a confirmação diverge da senha', () => {
    expect(validatePasswordConfirmation('senha-correta', 'senha-diferente')).toEqual({
      ok: false,
      reason: 'MISMATCH',
    });
  });

  it('aceita quando senha e confirmação são iguais e não vazias', () => {
    expect(validatePasswordConfirmation('senha-correta', 'senha-correta')).toEqual({
      ok: true,
    });
  });
});
