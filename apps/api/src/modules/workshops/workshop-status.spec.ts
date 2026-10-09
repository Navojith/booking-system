import { describe, expect, it } from 'vitest';
import { canTransition, isClosed } from './workshop-status.js';

describe('workshop status machine', () => {
  it.each([
    ['DRAFT', 'SCHEDULED', true],
    ['DRAFT', 'CANCELLED', true],
    ['DRAFT', 'COMPLETED', false],
    ['SCHEDULED', 'COMPLETED', true],
    ['SCHEDULED', 'CANCELLED', true],
    ['SCHEDULED', 'DRAFT', false],
    ['CANCELLED', 'SCHEDULED', false],
    ['COMPLETED', 'CANCELLED', false],
  ] as const)('%s -> %s is %s', (from, to, allowed) => {
    expect(canTransition(from, to)).toBe(allowed);
  });

  it('treats cancelled and completed as closed', () => {
    expect(isClosed('CANCELLED')).toBe(true);
    expect(isClosed('COMPLETED')).toBe(true);
    expect(isClosed('DRAFT')).toBe(false);
    expect(isClosed('SCHEDULED')).toBe(false);
  });
});
