'use client';

import { useId, useState } from 'react';
import { formatCount, formatShare } from './click-format';

/**
 * UXP-006 — gráficos do dashboard de cliques, sem dependência nova:
 * colunas em SVG inline e barras horizontais em HTML, só com tokens do
 * design system. Acessibilidade:
 * - o gráfico é uma imagem com resumo textual (`role="img"` +
 *   `aria-label`) — maior valor, total, período;
 * - "Ver como tabela" (`aria-expanded`/`aria-controls`) revela a tabela
 *   equivalente com todos os valores (representação tabular completa);
 * - nenhuma informação só por cor; sem animação.
 */

export interface ChartDatum {
  key: string;
  label: string;
  value: number;
}

function summarize(data: ChartDatum[], unit: string): string {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  if (total === 0) {
    return `Nenhum ${unit} no período.`;
  }
  const max = data.reduce((best, datum) => (datum.value > best.value ? datum : best), data[0]!);
  return `Total de ${formatCount(total)} ${unit}s; maior valor: ${formatCount(max.value)} em ${max.label}.`;
}

function DataTableToggle({ caption, data, valueHeader }: { caption: string; data: ChartDatum[]; valueHeader: string }) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={tableId}
        onClick={() => setOpen((value) => !value)}
        className="rounded-control px-1 font-ui text-body-sm font-action text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        {open ? 'Ocultar tabela' : 'Ver como tabela'}
      </button>
      {/* Rola internamente (até 24 linhas): região nomeada e focável para rolagem por teclado (WCAG 2.1.1). */}
      <div
        id={tableId}
        hidden={!open}
        role="region"
        aria-label={`Tabela: ${caption}`}
        tabIndex={0}
        className="mt-2 max-h-72 overflow-auto rounded-control border border-outline-subtle focus-visible:outline-none focus-visible:ring-2 ring-focus"
      >
        <table className="w-full border-collapse font-ui text-body-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-subtle-surface">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-action text-fg">
                Item
              </th>
              <th scope="col" className="px-3 py-2 text-right font-action text-fg">
                {valueHeader}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-action text-fg">
                Participação
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.key} className="border-t border-outline-subtle">
                <th scope="row" className="px-3 py-1.5 text-left font-normal text-fg">
                  {datum.label}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg">{formatCount(datum.value)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-fg-muted">
                  {total > 0 ? formatShare(datum.value / total) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Colunas verticais (série temporal, horário). Rótulos do eixo X espaçados para caber. */
export function ColumnChart({
  title,
  data,
  unit = 'evento',
  maxXLabels = 8,
}: {
  title: string;
  data: ChartDatum[];
  unit?: string;
  maxXLabels?: number;
}) {
  const max = Math.max(1, ...data.map((datum) => datum.value));
  const slot = 10;
  const width = Math.max(1, data.length) * slot;
  const height = 100;
  const step = Math.max(1, Math.ceil(data.length / maxXLabels));
  const summary = `${title}. ${summarize(data, unit)}`;

  return (
    <div>
      <div className="flex gap-2">
        {/* `pb-5` = linha de rótulos do eixo X (mt-1 + h-4): o "0" fica na base do gráfico, não ao lado de "00h". */}
        <div aria-hidden="true" className="flex w-8 shrink-0 flex-col justify-between pb-5 pt-0.5 text-right font-ui text-[0.7rem] tabular-nums text-fg-muted">
          <span>{formatCount(max)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            role="img"
            aria-label={summary}
            viewBox={`0 0 ${width} ${height}`}
            preserveAspectRatio="none"
            className="block h-40 w-full border-b border-l border-outline-subtle"
          >
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                x1="0"
                x2={width}
                y1={height * fraction}
                y2={height * fraction}
                className="stroke-outline-subtle"
                strokeWidth="0.4"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            {data.map((datum, index) => {
              const barHeight = (datum.value / max) * (height - 2);
              return (
                <rect
                  key={datum.key}
                  x={index * slot + slot * 0.15}
                  y={height - barHeight}
                  width={slot * 0.7}
                  height={barHeight}
                  rx="1"
                  className="fill-accent"
                />
              );
            })}
          </svg>
          <div aria-hidden="true" className="relative mt-1 h-4 font-ui text-[0.7rem] text-fg-muted">
            {data.map((datum, index) =>
              index % step === 0 ? (
                <span
                  key={datum.key}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${((index + 0.5) / Math.max(1, data.length)) * 100}%` }}
                >
                  {datum.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <DataTableToggle caption={title} data={data} valueHeader="Eventos" />
    </div>
  );
}

/** Barras horizontais com valor e participação visíveis (marketplace, dispositivo). */
export function BarList({ title, data }: { title: string; data: ChartDatum[] }) {
  const total = data.reduce((sum, datum) => sum + datum.value, 0);
  const max = Math.max(1, ...data.map((datum) => datum.value));
  if (data.length === 0 || total === 0) {
    return <p className="m-0 font-ui text-body-sm text-fg-muted">Nenhum evento no período.</p>;
  }
  return (
    <div>
      <div role="img" aria-label={`${title}. ${summarize(data, 'evento')}`} className="flex flex-col gap-2">
        {data.map((datum) => (
          <div key={datum.key} className="font-ui text-body-sm">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-fg">{datum.label}</span>
              <span className="shrink-0 tabular-nums text-fg-secondary">
                {formatCount(datum.value)} · {formatShare(datum.value / total)}
              </span>
            </div>
            <div className="mt-1 h-2 rounded-pill bg-subtle-surface">
              <div className="h-2 rounded-pill bg-accent" style={{ width: `${(datum.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
      <DataTableToggle caption={title} data={data} valueHeader="Eventos" />
    </div>
  );
}
