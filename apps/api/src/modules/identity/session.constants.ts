/**
 * Política de sessão administrativa (AUTH-005) — sem valor definido em
 * `Architecture.md`/`Implementation-Backlog.md`; decisão explícita tomada
 * nesta tarefa. Compartilhada entre `application/` (duração, usada por
 * `LoginUseCase` para calcular `expiresAt`) e `presentation/` (nome do
 * cookie, usado por `AuthController` agora; reaproveitado por AUTH-006 e
 * AUTH-007 depois — guard de sessão e logout precisam do mesmo nome).
 */
export const ADMIN_SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 horas
export const ADMIN_SESSION_COOKIE_NAME = 'admin_session';
