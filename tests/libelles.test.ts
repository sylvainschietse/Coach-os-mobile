import { describe, expect, it } from 'vitest';

import { corpsLisible, sansCode } from '@/domain/libelles';

describe('libellés lisibles', () => {
  it('retire le code du modèle de séance', () => {
    expect(sansCode('MOD-SAL-V3-PM4-4-S2 · Bas du corps A · Squat')).toBe('Bas du corps A · Squat');
    expect(sansCode('Haut du corps')).toBe('Haut du corps');
    expect(sansCode('Séance HIIT · 20 min')).toBe('Séance HIIT · 20 min');
  });

  it('retire une durée aberrante de la notification', () => {
    expect(corpsLisible('MOD-SAL-V3-PM4-4-S1 · Haut du corps A · Développé couché · 14471 min')).toBe('Haut du corps A · Développé couché');
    expect(corpsLisible('MOD-SAL-V3-PM4-4-S2 · Bas du corps A · Squat · 3 min · Séance faite.')).toBe('Bas du corps A · Squat · 3 min · Séance faite.');
  });
});
