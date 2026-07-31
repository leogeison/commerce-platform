import { z } from 'zod';

/**
 * Role de um `SiteUser` — acesso de um usuário a um Site específico
 * (Architecture.md, Seção 16). Não é um papel global do usuário: a mesma
 * pessoa pode ter Roles diferentes em Sites diferentes.
 *
 * Fica em `admin/common/`, não em `admin/auth/`, porque representa acesso
 * a um Site — reutilizável por qualquer contrato administrativo que
 * precise expor Role (hoje só `admin/auth`; futuras superfícies de gestão
 * de membros, fora do MVP, reaproveitam o mesmo schema em vez de duplicar).
 */
export const roleSchema = z.enum(['OWNER', 'EDITOR', 'VIEWER']);

export type Role = z.infer<typeof roleSchema>;
