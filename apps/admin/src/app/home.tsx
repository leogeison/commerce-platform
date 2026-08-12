'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { meResponseSchema, type MeResponse } from '@commerce-platform/contracts';
import { apiRequest } from '../lib/api-client';
import { AdminApiError } from '../lib/api-error';
import styles from './home.module.css';

type HomeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: MeResponse };

const GENERIC_ERROR_MESSAGE = 'Não foi possível carregar seus Sites. Tente novamente em instantes.';

/**
 * `siteSlug` (`meResponseSchema`) é `z.string()` puro — sem regex/formato
 * garantido no contrato (ADM-003). `encodeURIComponent` aqui não é
 * validação nova, só a mesma cautela que qualquer segmento dinâmico de URL
 * já precisaria ter para não quebrar a rota com caracteres especiais.
 */
function categoriesHref(siteSlug: string): string {
  return `/${encodeURIComponent(siteSlug)}/categories`;
}

/**
 * Único Client Component da página raiz (ADM-003). Chama exclusivamente
 * `GET /admin/auth/me` via `apiRequest` (mesmo mecanismo browser →
 * `credentials: 'include'` da ADM-001/ADM-002 — o cookie de sessão
 * continua host-only da API, nunca lido/copiado aqui).
 *
 * Fluxo do seletor de Site (Architecture.md §32): zero Sites é estado
 * válido (mensagem, sem redirect); exatamente um Site redireciona direto
 * para `/:siteSlug/categories` (painel "de fato" ainda não existe como
 * página própria — mesma situação temporária que `/` teve após a ADM-002,
 * até a ADM-005 implementar essa rota); múltiplos Sites mostra a lista
 * inicial, sem nenhum componente de troca pensando na ADM-004.
 *
 * `401` em `/admin/auth/me` é comportamento mínimo desta própria tarefa
 * (não uma guarda global): `router.replace('/login')`. Qualquer outro erro
 * (rede, 500, corpo fora do contrato) vira mensagem genérica local — nunca
 * redireciona para login nesse caso.
 */
export function Home() {
  const router = useRouter();
  const [state, setState] = useState<HomeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    apiRequest('/admin/auth/me', meResponseSchema)
      .then((data) => {
        if (cancelled) {
          return;
        }
        if (data.sites.length === 1) {
          router.replace(categoriesHref(data.sites[0].siteSlug));
          return;
        }
        setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AdminApiError && error.statusCode === 401) {
          router.replace('/login');
          return;
        }
        setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return <main className={styles.page}>{renderContent(state)}</main>;
}

function renderContent(state: HomeState) {
  if (state.status === 'loading') {
    return <p className={styles.status}>Carregando...</p>;
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className={styles.status}>
        {GENERIC_ERROR_MESSAGE}
      </p>
    );
  }

  const { sites } = state.data;

  if (sites.length === 0) {
    return <p className={styles.status}>Você não tem acesso a nenhum Site.</p>;
  }

  return (
    <ul className={styles.list}>
      {sites.map((site) => (
        <li key={site.siteId}>
          <Link href={categoriesHref(site.siteSlug)}>{site.siteName}</Link>
        </li>
      ))}
    </ul>
  );
}
