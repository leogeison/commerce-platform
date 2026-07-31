import { z } from 'zod';
import { roleSchema } from '../common/role';
import { authUserSchema } from './auth-user';

/**
 * Um Site ao qual o usuário autenticado tem acesso, com a Role nesse Site
 * (AUTH-008/AUTH-009 — Role é sempre por `SiteUser`, nunca global).
 */
export const meSiteMembershipSchema = z.object({
  siteId: z.string().uuid(),
  siteSlug: z.string(),
  siteName: z.string(),
  role: roleSchema,
});

export type MeSiteMembership = z.infer<typeof meSiteMembershipSchema>;

/**
 * Corpo de resposta de `GET /admin/auth/me`. `sites` vazio é estado válido
 * (AUTH-008/AUTH-011 — usuário sem nenhum `SiteUser` ainda autentica
 * normalmente) — o schema não impõe mínimo de itens no array.
 */
export const meResponseSchema = z.object({
  user: authUserSchema,
  sites: z.array(meSiteMembershipSchema),
});

export type MeResponse = z.infer<typeof meResponseSchema>;
