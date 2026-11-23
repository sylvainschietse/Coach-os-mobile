import { describe, expect, it } from 'vitest';

import { ilYa, pastille } from '../src/domain/cloche';

describe('cloche', () => {
  const maintenant = new Date('2026-11-09T21:00:00Z'); // 22h00 à Paris
  it('dit depuis quand', () => {
    expect(ilYa('2026-11-09T20:59:30Z', maintenant)).toBe('à l’instant');
    expect(ilYa('2026-11-09T20:35:00Z', maintenant)).toBe('il y a 25 min');
    expect(ilYa('2026-11-09T07:05:00Z', maintenant)).toBe('aujourd’hui à 08h05');
    expect(ilYa('2026-11-08T17:02:00Z', maintenant)).toBe('hier à 18h02');
    expect(ilYa('2026-11-06T17:02:00Z', maintenant)).toBe('vendredi à 18h02');
  });
  it('limite la pastille', () => {
    expect(pastille(3)).toBe('3');
    expect(pastille(12)).toBe('9+');
  });
});
