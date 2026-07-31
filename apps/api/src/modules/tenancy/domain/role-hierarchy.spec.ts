import type { Role } from '@commerce-platform/contracts';
import { roleMeetsMinimum } from './role-hierarchy';

describe('roleMeetsMinimum', () => {
  // Matriz completa 3x3 (AUTH-009): toda combinação de actual/minimum entre
  // VIEWER, EDITOR e OWNER, documentando a política de hierarquia por
  // inteiro em teste unitário — os e2e cobrem o isolamento multi-tenant,
  // não a matriz da função pura em si.
  const cases: Array<[actual: Role, minimum: Role, expected: boolean]> = [
    ['VIEWER', 'VIEWER', true],
    ['VIEWER', 'EDITOR', false],
    ['VIEWER', 'OWNER', false],

    ['EDITOR', 'VIEWER', true],
    ['EDITOR', 'EDITOR', true],
    ['EDITOR', 'OWNER', false],

    ['OWNER', 'VIEWER', true],
    ['OWNER', 'EDITOR', true],
    ['OWNER', 'OWNER', true],
  ];

  it.each(cases)(
    'actual=%s, minimum=%s -> %s',
    (actual, minimum, expected) => {
      expect(roleMeetsMinimum(actual, minimum)).toBe(expected);
    },
  );
});
