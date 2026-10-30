import { describe, expect, it } from 'vitest';

import { mensualite, packADecompter, soldeSeances, type PackSeances } from '../src/domain/abonnements';

const pack = (id: string, total: number, faites: number, acheteLe: string): PackSeances => ({ id, clientId: 'c', seancesTotal: total, seancesFaites: faites, acheteLe });

describe('abonnements', () => {
  it('59 € pour l’appli, 99 € avec l’option nutrition, rien sans accès', () => {
    expect(mensualite({ accesAppli: true, optionNutrition: false })).toBe(59);
    expect(mensualite({ accesAppli: true, optionNutrition: true })).toBe(99);
    expect(mensualite({ accesAppli: false, optionNutrition: true })).toBe(0);
  });

  it('compte les séances restantes sur les packs entamés seulement', () => {
    const packs = [pack('ancien', 11, 11, '2026-01-01'), pack('pack', 11, 4, '2026-09-01'), pack('unite', 1, 0, '2026-10-01')];
    expect(soldeSeances(packs)).toEqual({ restantes: 8, total: 12 });
    expect(soldeSeances([])).toEqual({ restantes: 0, total: 0 });
  });

  it('décompte d’abord le pack le plus ancien qui a encore des séances', () => {
    const packs = [pack('unite', 1, 0, '2026-10-01'), pack('pack', 11, 4, '2026-09-01'), pack('fini', 11, 11, '2026-01-01')];
    expect(packADecompter(packs)?.id).toBe('pack');
    expect(packADecompter([pack('fini', 1, 1, '2026-01-01')])).toBeUndefined();
  });
});
