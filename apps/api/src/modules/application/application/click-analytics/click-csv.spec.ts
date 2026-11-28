import { csvCell, toCsv } from './click-csv';

describe('click-csv (UXP-006)', () => {
  it('neutraliza valores que planilhas interpretariam como fórmula', () => {
    for (const value of ['=1+1', '+cmd', '-2', '@SUM(A1)', '\tx', '\rx']) {
      expect(csvCell(value).startsWith(`"'`)).toBe(true);
    }
    expect(csvCell('Relógio = bom')).toBe('"Relógio = bom"');
  });

  it('aspas duplicadas, nulos vazios, BOM e CRLF', () => {
    expect(csvCell('diz "olá"')).toBe('"diz ""olá"""');
    expect(csvCell(null)).toBe('""');
    expect(toCsv(['a', 'b'], [['1', null]])).toBe('﻿"a","b"\r\n"1",""\r\n');
  });
});
