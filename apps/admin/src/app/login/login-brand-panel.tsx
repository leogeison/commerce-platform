import { Layers } from 'lucide-react';
import styles from './login.module.css';

/**
 * apps/admin/src/app/login/login-brand-panel.tsx
 *
 * UXP-004 — identidade da plataforma no login do Admin. "Commerce
 * Platform", não FastCompre: o Admin é multi-site. Local a `/login` (único
 * consumidor), Server Component, sem estado e sem nenhum elemento
 * focável — por isso a reordenação visual dos painéis (CSS `order`) nunca
 * altera a ordem de foco.
 */

/** Marca: ícone `Layers` (decorativo) + nome da plataforma. */
export function LoginBrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const tile = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className={`${tile} inline-flex shrink-0 items-center justify-center rounded-control bg-accent-subtle text-accent-subtle-fg`}
      >
        <Layers className="h-5 w-5" />
      </span>
      <span className="font-ui text-body font-semibold text-fg-inverse">Commerce Platform</span>
    </div>
  );
}

/**
 * Ilustração abstrata e decorativa (SVG inline, sem imagem externa): um
 * "documento" e um "gráfico" de barras sem rótulos nem valores — nenhum
 * dado ou métrica fictícia. Cores só por tokens (`fill-*`/`stroke-*`).
 */
function EditorialIllustration() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 520 190" className="h-auto w-full max-w-[30rem]">
      <rect x="1" y="45" width="230" height="140" rx="14" className="fill-fg-inverse/5 stroke-fg-inverse/15" strokeWidth="1.5" />
      <rect x="22" y="68" width="46" height="34" rx="6" className="fill-fg-inverse/15" />
      <rect x="82" y="72" width="110" height="7" rx="3.5" className="fill-fg-inverse/25" />
      <rect x="82" y="90" width="80" height="7" rx="3.5" className="fill-fg-inverse/15" />
      <rect x="22" y="128" width="180" height="7" rx="3.5" className="fill-fg-inverse/15" />
      <rect x="22" y="148" width="140" height="7" rx="3.5" className="fill-fg-inverse/10" />

      <rect x="262" y="1" width="250" height="168" rx="14" className="fill-fg-inverse/5 stroke-fg-inverse/15" strokeWidth="1.5" />
      <rect x="290" y="117" width="18" height="30" rx="3" className="fill-accent-subtle/30" />
      <rect x="322" y="95" width="18" height="52" rx="3" className="fill-accent-subtle/40" />
      <rect x="354" y="105" width="18" height="42" rx="3" className="fill-accent-subtle/40" />
      <rect x="386" y="75" width="18" height="72" rx="3" className="fill-accent-subtle/55" />
      <rect x="418" y="55" width="18" height="92" rx="3" className="fill-accent-subtle/70" />
      <rect x="450" y="35" width="18" height="112" rx="3" className="fill-accent-subtle/85" />
    </svg>
  );
}

/** Painel institucional do desktop (≥ lg). No mobile, só a faixa com a marca. */
export function LoginBrandPanel({ year }: { year: number }) {
  return (
    <aside
      aria-label="Commerce Platform"
      className={`${styles.brandPanel} relative hidden overflow-hidden px-12 py-10 lg:order-1 lg:flex lg:w-[48%] lg:flex-col`}
    >
      {/* Coluna de conteúdo centralizada no painel: marca, textos, ilustração
          e copyright compartilham a mesma margem esquerda; o texto continua
          alinhado à esquerda. */}
      <div className="relative mx-auto flex w-full max-w-[34rem] flex-1 flex-col">
        <LoginBrandMark />

        <div className="my-auto flex flex-col gap-5 py-12">
          <p className="m-0 font-ui text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-accent-subtle">
            Gestão editorial
          </p>
          <p className="m-0 max-w-[30rem] font-ui text-[2.75rem] font-semibold leading-[1.1] tracking-tight text-fg-inverse">
            Sua operação editorial em um só lugar.
          </p>
          <p className="m-0 max-w-md font-ui text-body text-fg-inverse/80">
            Gerencie conteúdos, produtos e ofertas com simplicidade e eficiência.
          </p>
          <div className="mt-6">
            <EditorialIllustration />
          </div>
        </div>

        <p className="m-0 font-ui text-body-sm text-fg-inverse/75">© {year} Commerce Platform</p>
      </div>
    </aside>
  );
}
