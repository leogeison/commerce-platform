/**
 * Normalização de e-mail (Architecture.md, Seção 15: "e-mails sempre
 * normalizados para minúsculas antes de salvar/consultar — evita
 * duplicidade lógica por diferença de capitalização").
 *
 * Função compartilhada, único lugar onde esta regra é escrita: reaproveitada
 * por `PrismaUserRepository` (AUTH-001) e `ProvisionTenantUseCase`
 * (DB-013/AUTH-013) — os dois pontos que criam `User` diretamente. Antes da
 * AUTH-013, `ProvisionTenantUseCase` não normalizava (só era exercitado por
 * testes com e-mails já em minúsculas); corrigido aqui pra que o invariante
 * valha pra qualquer consumidor, não só o novo.
 *
 * `.trim()` além de `.toLowerCase()`: espaço nas extremidades (comum em
 * copy-paste ou digitação manual, como no prompt da AUTH-013) também
 * criaria duplicidade lógica se não removido.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
