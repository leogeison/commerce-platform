/**
 * Regra de confirmação de senha do prompt interativo da AUTH-013
 * (`bootstrap-admin.ts`) — extraída em função pura e testável de propósito,
 * já que a interação real do `readline`/raw mode não é (e não deveria ser)
 * coberta por teste automatizado.
 */
export type PasswordConfirmationFailureReason = 'EMPTY' | 'MISMATCH';

export type PasswordConfirmationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PasswordConfirmationFailureReason };

/**
 * Vazia é verificada antes de divergente: uma senha vazia confirmada "com
 * sucesso" por uma confirmação igualmente vazia ainda deve ser rejeitada —
 * `''` nunca é uma senha válida, não importa a confirmação.
 */
export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): PasswordConfirmationResult {
  if (password.length === 0) {
    return { ok: false, reason: 'EMPTY' };
  }

  if (password !== confirmation) {
    return { ok: false, reason: 'MISMATCH' };
  }

  return { ok: true };
}
