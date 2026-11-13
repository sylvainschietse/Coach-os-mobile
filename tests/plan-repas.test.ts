import { describe, expect, it } from 'vitest';

import {
  changerPortions,
  dateDuJour,
  decalerSemaine,
  ecartJour,
  erreursPlan,
  estUnLundi,
  lundiDe,
  planVide,
  repasDepuisRecette,
  totalJour,
} from '@/domain/plan-repas';
import type { Recette } from '@/domain/types';

const recette: Recette = {
  id: 'r1',
  titre: 'Bol de quinoa',
  portions: 2,
  statut: 'approuvee',
  regimesConfirmes: [],
  ingredients: [],
  macrosPortion: { kcal: 450, proteines: 20, glucides: 60, lipides: 12 },
  variantes: [
    { id: 'v1', libelle: 'Végane', regime: 'vegan', ingredients: [], macrosPortion: { kcal: 400, proteines: 15, glucides: 62, lipides: 10 } },
  ],
};

describe('plan alimentaire de la semaine', () => {
  it('ramène un jour à son lundi, sans glissement de fuseau', () => {
    expect(lundiDe('2026-10-24')).toBe('2026-10-19');
    expect(lundiDe('2026-10-19')).toBe('2026-10-19');
    expect(lundiDe('2026-10-25')).toBe('2026-10-19');
    expect(lundiDe('2026-03-29')).toBe('2026-03-23');
    expect(decalerSemaine('2026-10-19', 1)).toBe('2026-10-26');
    expect(decalerSemaine('2026-03-23', 1)).toBe('2026-03-30');
    expect(dateDuJour('2026-10-19', 6)).toBe('2026-10-25');
    expect(estUnLundi('2026-10-20')).toBe(false);
  });

  it('calcule les macros des portions choisies, variante comprise', () => {
    const r = repasDepuisRecette(recette, { id: 'a', moment: 'dejeuner', portions: 1.5 });
    expect(r.macros).toEqual({ kcal: 675, proteines: 30, glucides: 90, lipides: 18 });
    const v = repasDepuisRecette(recette, { id: 'b', moment: 'diner', portions: 1, varianteId: 'v1' });
    expect(v.titre).toBe('Bol de quinoa (Végane)');
    expect(v.macros.kcal).toBe(400);
    // Changer les portions repart des macros d'une portion : pas d'arrondis cumulés.
    expect(changerPortions(changerPortions(r, 0.125), 1).macros).toEqual({ kcal: 450, proteines: 20, glucides: 60, lipides: 12 });
  });

  it('additionne la journée et montre l’écart à la cible', () => {
    const jour = [
      repasDepuisRecette(recette, { id: 'a', moment: 'dejeuner', portions: 1 }),
      repasDepuisRecette(recette, { id: 'b', moment: 'diner', portions: 1, varianteId: 'v1' }),
    ];
    expect(totalJour(jour).kcal).toBe(850);
    expect(ecartJour(totalJour(jour), { kcal: 1700, proteines: 0, glucides: 0, lipides: 0 })).toEqual({ kcal: -850, pourcent: -50 });
    expect(ecartJour(totalJour(jour), undefined)).toBeUndefined();
  });

  it('refuse une semaine qui ne commence pas un lundi et des portions hors bornes', () => {
    expect(erreursPlan(planVide('c', '2026-10-19'))).toEqual([]);
    expect(erreursPlan(planVide('c', '2026-10-20'))).toContain('La semaine doit commencer un lundi.');
    const p = planVide('c', '2026-10-19');
    p.jours[0].push({ ...repasDepuisRecette(recette, { id: 'a', moment: 'dejeuner', portions: 1 }), portions: 5 });
    expect(erreursPlan(p)[0]).toMatch(/^Lundi : portions/);
  });
});
