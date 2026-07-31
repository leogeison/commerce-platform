import { z } from 'zod';
import { authUserSchema } from './auth-user.js';

/**
 * Corpo de resposta do login (Architecture.md, Seção 32 — "Seletor de
 * Site (pós-login) vem de `/admin/auth/me`"): só a identidade básica do
 * usuário. A lista de Sites/Roles não vem daqui — a tela pós-login busca
 * isso separadamente via `meResponseSchema`.
 */
export const loginResponseSchema = z.object({
  user: authUserSchema,
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;
