// Minuteurs de l'espace client (lib/timer.ts d'origine) : durées, étapes, pause et relecture après verrouillage.
import { describe, expect, it } from 'vitest';

import { CONFIG_DEFAUT, configValide, duree, ecoule, etape, horloge, mettreEnPause, relireMarche, reprendre, type Marche } from '../src/domain/minuteurs';

describe('minuteurs', () => {
  it('Tabata 20/10 sur 8 exercices : 5 s de préparation, dernier repos inclus', () => {
    expect(duree(CONFIG_DEFAUT)).toBe(245);
    expect(etape(CONFIG_DEFAUT, 0)).toMatchObject({ type: 'prepare', restant: 5 });
    expect(etape(CONFIG_DEFAUT, 5000)).toMatchObject({ type: 'work', restant: 20, exercice: 1, tour: 1, cle: 'work:0' });
    expect(etape(CONFIG_DEFAUT, 26000)).toMatchObject({ type: 'rest', restant: 9, cle: 'rest:0' });
    expect(etape({ ...CONFIG_DEFAUT, tours: 2 }, (5 + 8 * 30) * 1000)).toMatchObject({ type: 'work', exercice: 1, tour: 2 });
    expect(etape(CONFIG_DEFAUT, 245000).type).toBe('done');
  });

  it('repos simple : au moins 1 seconde, sans préparation', () => {
    const r = { ...CONFIG_DEFAUT, mode: 'rest' as const, repos: 90, preparation: 0, libelle: 'Squat' };
    expect(configValide(r)).toBe(true);
    expect(configValide({ ...r, repos: 0 })).toBe(false);
    expect(etape(r, 1000)).toMatchObject({ type: 'rest', restant: 89 });
    expect(configValide({ ...CONFIG_DEFAUT, exercices: 31 })).toBe(false);
  });

  it('pause, reprise et relecture après un écran verrouillé', () => {
    const m: Marche = { config: CONFIG_DEFAUT, statut: 'running', ecouleMs: 0, departLe: 1000 };
    const p = mettreEnPause(m, 11000);
    expect(p).toMatchObject({ statut: 'paused', ecouleMs: 10000 });
    expect(ecoule(p, 99999)).toBe(10000);
    expect(ecoule(reprendre(p, 20000), 25000)).toBe(15000);
    expect(relireMarche(m, 1000 + 300000)?.statut).toBe('done');
    expect(relireMarche({ ...m, ecouleMs: -1 }, 0)).toBeNull();
    expect(horloge(65)).toBe('01:05');
  });
});
