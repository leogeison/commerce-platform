import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

export interface SetSessionCookieOptions {
  /**
   * Duração do cookie em milissegundos. Não tem valor padrão de propósito:
   * a política de expiração da sessão é decidida por quem chama (Fase 5 —
   * AUTH-003), não por este helper.
   */
  maxAgeMs: number;
}

/**
 * Helper de cookie de sessão (INF-004) — só fixa os atributos de segurança
 * exigidos pelo Architecture.md (Seção 15, "Configuração do cookie
 * (produção)"). Nenhuma lógica de sessão aqui: gerar ou validar o token é
 * fora de escopo desta tarefa (Fase 5 — AUTH-003/AUTH-005).
 *
 * Atributos sempre aplicados, tanto no set quanto no clear:
 * - `httpOnly: true` — inacessível via JavaScript no navegador.
 * - `secure: true` — só trafega em HTTPS.
 * - `sameSite: 'lax'` — primeira linha de defesa contra CSRF.
 * - `path: '/'`.
 * - Nunca define `domain` — cookie host-only por omissão (nunca vira
 *   `.fastcompre.com`; fica restrito ao host exato da API).
 */
@Injectable()
export class SessionCookieHelper {
  setCookie(
    res: Response,
    name: string,
    value: string,
    options: SetSessionCookieOptions,
  ): void {
    res.cookie(name, value, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: options.maxAgeMs,
    });
  }

  clearCookie(res: Response, name: string): void {
    res.clearCookie(name, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
  }
}
