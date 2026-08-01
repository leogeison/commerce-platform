import { normalizeEmail } from './email';

describe('normalizeEmail', () => {
  it('converte para minúsculas', () => {
    expect(normalizeEmail('Admin@Email.com')).toBe('admin@email.com');
  });

  it('remove espaços nas extremidades', () => {
    expect(normalizeEmail('  admin@email.com  ')).toBe('admin@email.com');
  });

  it('combina trim e lowercase juntos', () => {
    expect(normalizeEmail('  Admin@Email.com  ')).toBe('admin@email.com');
  });

  it('não altera um e-mail já normalizado', () => {
    expect(normalizeEmail('admin@email.com')).toBe('admin@email.com');
  });
});
