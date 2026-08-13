import { describe, expect, it } from '@jest/globals';
import type { Role } from '@commerce-platform/contracts';
import { roleMeetsMinimum } from './role-hierarchy';

describe('roleMeetsMinimum', () => {
  const cases: Array<{ actual: Role; minimum: Role; expected: boolean }> = [
    { actual: 'VIEWER', minimum: 'VIEWER', expected: true },
    { actual: 'VIEWER', minimum: 'EDITOR', expected: false },
    { actual: 'VIEWER', minimum: 'OWNER', expected: false },
    { actual: 'EDITOR', minimum: 'VIEWER', expected: true },
    { actual: 'EDITOR', minimum: 'EDITOR', expected: true },
    { actual: 'EDITOR', minimum: 'OWNER', expected: false },
    { actual: 'OWNER', minimum: 'VIEWER', expected: true },
    { actual: 'OWNER', minimum: 'EDITOR', expected: true },
    { actual: 'OWNER', minimum: 'OWNER', expected: true },
  ];

  it.each(cases)('$actual satisfaz mínimo $minimum? $expected', ({ actual, minimum, expected }) => {
    expect(roleMeetsMinimum(actual, minimum)).toBe(expected);
  });
});
