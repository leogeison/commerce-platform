import type { Response } from 'express';
import { SessionCookieHelper } from './session-cookie.helper';

function createMockResponse() {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  };
}

describe('SessionCookieHelper', () => {
  let helper: SessionCookieHelper;

  beforeEach(() => {
    helper = new SessionCookieHelper();
  });

  it('setCookie aplica os atributos de segurança exigidos (HttpOnly, Secure, SameSite=Lax, Path=/)', () => {
    const res = createMockResponse();

    helper.setCookie(
      res as unknown as Response,
      'session_token',
      'raw-token-value',
      { maxAgeMs: 1000 * 60 * 60 * 24 * 7 },
    );

    expect(res.cookie).toHaveBeenCalledWith('session_token', 'raw-token-value', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });
  });

  it('setCookie nunca define domain (cookie host-only)', () => {
    const res = createMockResponse();

    helper.setCookie(res as unknown as Response, 'session_token', 'v', {
      maxAgeMs: 1,
    });

    const [, , options] = res.cookie.mock.calls[0];
    expect(options).not.toHaveProperty('domain');
  });

  it('clearCookie usa os mesmos atributos de segurança, garantindo que o navegador remova o cookie certo', () => {
    const res = createMockResponse();

    helper.clearCookie(res as unknown as Response, 'session_token');

    expect(res.clearCookie).toHaveBeenCalledWith('session_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  });
});
