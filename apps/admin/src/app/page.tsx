import type { Metadata } from 'next';
import { Home } from './home';

export const metadata: Metadata = {
  title: 'Meus Sites — Commerce Platform Admin',
};

/**
 * `/` pós-login (ADM-003; Architecture.md §32, "Seletor de Site"). Server
 * Component puro — só estrutura e `metadata`, nenhuma lógica/estado. `Home`
 * (`"use client"`) concentra toda a interatividade (chamada a
 * `/admin/auth/me`, loading/erro, zero/um/múltiplos Sites), mesma fronteira
 * client estreita da `LoginForm` (ADM-002).
 */
export default function HomePage() {
  return <Home />;
}
