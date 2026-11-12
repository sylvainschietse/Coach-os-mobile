import { describe, expect, it } from 'vitest';

import { bilanCalories, dureeSeance, texteBalance } from '../src/domain/bilan-calories';

describe('bilan des calories du jour', () => {
  it('additionne métabolisme, digestion, pas, séances et activités', () => {
    const b = bilanCalories({
      metabolisme: 1600,
      poidsKg: 80,
      pas: 10000,
      seances: [{ titre: 'Jambes', debut: '2026-11-12T10:00:00Z', fin: '2026-11-12T11:00:00Z' }],
      activites: [{ sport: 'marche', titre: 'Marche', dureeS: 1800, calories: 150 }],
      mange: 2300,
      objectif: 2200,
    });
    expect(b.lignes.map((l) => l.libelle)).toEqual(['Métabolisme de base', 'Digestion', 'Pas', 'Jambes', 'Marche']);
    expect(b.lignes[1].kcal).toBe(160);
    expect(b.lignes[2].kcal).toBe(400);
    const seance = b.lignes[3].kcal;
    expect(seance).toBeGreaterThan(200);
    expect(b.mouvement).toBe(400 + seance + 150);
    expect(b.depense).toBe(1600 + 160 + 400 + seance + 150);
    expect(b.balance).toBe(2300 - b.depense!);
    expect(b.objectif).toBe(2200);
  });

  it('sans métabolisme, pas de total ni de balance', () => {
    const b = bilanCalories({ seances: [], activites: [{ sport: 'course', titre: '', dureeS: 1800 }], mange: 1800 });
    expect(b.depense).toBeUndefined();
    expect(b.balance).toBeUndefined();
    expect(b.mouvement).toBeGreaterThan(0);
    expect(b.lignes[0].libelle).toBe('Course');
  });

  it('borne la durée d’une séance', () => {
    expect(dureeSeance({ debut: '2026-11-12T10:00:00Z', fin: '2026-11-12T10:02:00Z' })).toBe(600);
    expect(dureeSeance({ debut: '2026-11-12T10:00:00Z', fin: '2026-11-12T18:00:00Z' })).toBe(3600);
    expect(dureeSeance({ debut: '', fin: '' })).toBe(3600);
  });

  it('écrit la balance', () => {
    expect(texteBalance(-320)).toBe('Déficit de 320 kcal');
    expect(texteBalance(150)).toBe('Surplus de 150 kcal');
    expect(texteBalance(20)).toBe('À l’équilibre');
  });
});
