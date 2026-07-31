import { z } from 'zod';

/**
 * Identidade básica de um usuário autenticado — shape compartilhado entre
 * o corpo de resposta do login e do `/admin/auth/me` (AUTH-004/CTR-002),
 * pra não duplicar os mesmos três campos em dois schemas. Nunca inclui
 * `passwordHash` nem qualquer segredo.
 */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().nullable(),
});

export type AuthUser = z.infer<typeof authUserSchema>;
