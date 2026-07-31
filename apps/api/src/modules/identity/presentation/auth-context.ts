/**
 * Tipos do contexto de autenticação anexado à requisição por
 * `SessionAuthGuard` (AUTH-006; Architecture.md, Seção 15).
 *
 * Em arquivo separado do guard de propósito: AUTH-007 (logout), AUTH-008
 * (`GET /admin/auth/me`) e AUTH-009 (resolução de `SiteUser`/Role) vão
 * reutilizar `AuthContext`/`AuthenticatedUser` e a augmentação de
 * `Express.Request` abaixo, sem precisar importar o arquivo do guard em si.
 *
 * `AuthenticatedUser` é montado campo a campo pelo guard a partir do `User`
 * do Prisma — nunca é o modelo inteiro, para nunca carregar `passwordHash`
 * para dentro da requisição.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- augmentação de `Express.Request` (de @types/express) exige exatamente esta sintaxe; não é organização de código próprio em namespace.
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}
