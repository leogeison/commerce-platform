import type { Metadata } from 'next';
import { LoginForm } from './login-form';
import styles from './login.module.css';

export const metadata: Metadata = {
  title: 'Login — Commerce Platform Admin',
};

/**
 * `/login` (ADM-002; Architecture.md §32, mapa de páginas). Server Component
 * puro — só estrutura e `metadata`, nenhuma lógica/estado. `LoginForm`
 * (`"use client"`) concentra toda a interatividade, mantendo a fronteira
 * client a mais estreita possível.
 *
 * Sem guarda de "usuário já autenticado": fora de escopo desta tarefa
 * (decisão explícita) — fica para quando o layout autenticado (`ADM-004`)
 * existir.
 */
export default function LoginPage() {
  return (
    <main className={styles.page}>
      <LoginForm />
    </main>
  );
}
