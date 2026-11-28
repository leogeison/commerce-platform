/**
 * UXP-006 — geração do CSV de eventos de clique.
 *
 * - Todos os campos entre aspas; aspas internas duplicadas (RFC 4180).
 * - Proteção contra CSV/formula injection: qualquer valor que comece com
 *   `=`, `+`, `-`, `@`, tabulação ou retorno de carro recebe um apóstrofo
 *   inicial, para planilhas nunca interpretarem o conteúdo (títulos, UTMs)
 *   como fórmula.
 * - BOM UTF-8 para acentuação correta ao abrir no Excel.
 * - Sem User-Agent, referer, IP ou identificadores internos.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '""';
  }
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: string[], rows: Array<Array<string | number | null>>): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
