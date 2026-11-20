import { describe, expect, it } from 'vitest';

import {
  caloriesDesMacros,
  erreursJournal,
  erreursMensuration,
  erreursPlan,
  erreursRecord,
  evolution,
  formaterRecord,
  lireNombre,
  meilleuresChargesDesSeances,
  meilleursRecords,
  resumeJournal,
} from '../src/domain/suivi';
import type { RealisationDetail, RecordPerso } from '../src/domain/types';

describe('mensurations', () => {
  it('une case vide n’est pas un zéro, une virgule est acceptée', () => {
    expect(lireNombre('')).toBeUndefined();
    expect(lireNombre('72,5')).toBe(72.5);
    expect(lireNombre('abc')).toBeNaN();
  });

  it('demande au moins une mesure et des valeurs plausibles', () => {
    expect(erreursMensuration({})).toEqual(['Renseigne au moins une mesure.']);
    expect(erreursMensuration({ poidsKg: 7 })).toEqual(['Poids : entre 20 et 400 kg.']);
    expect(erreursMensuration({ tourTailleCm: 80 })).toEqual([]);
  });

  it('calcule l’évolution depuis la première mesure', () => {
    const e = evolution(
      [
        { id: '2', clientId: 'c', date: '2026-10-19', poidsKg: 64.8 },
        { id: '1', clientId: 'c', date: '2026-09-21', poidsKg: 66.2 },
        { id: '3', clientId: 'c', date: '2026-10-01', tourTailleCm: 74 },
      ],
      'poidsKg',
    );
    expect(e).toMatchObject({ premier: { valeur: 66.2 }, dernier: { valeur: 64.8 }, ecart: -1.4 });
  });
});

describe('records', () => {
  const r = (id: string, valeur: number, date: string, extra: Partial<RecordPerso> = {}): RecordPerso => ({
    id,
    clientId: 'c',
    libelle: 'Squat',
    valeur,
    unite: 'kg',
    repetitions: 1,
    date,
    ...extra,
  });

  it('garde le meilleur par exercice et par nombre de répétitions', () => {
    const liste = meilleursRecords([r('1', 80, '2026-09-01'), r('2', 90, '2026-10-01'), r('3', 85, '2026-10-10'), r('4', 70, '2026-10-02', { repetitions: 5 })]);
    expect(liste.map((x) => [x.meilleur.id, x.historique.length])).toEqual([
      ['2', 3],
      ['4', 1],
    ]);
  });

  it('écrit les records lisiblement', () => {
    expect(formaterRecord({ valeur: 102.5, unite: 'kg', repetitions: 3 })).toBe('102,5 kg × 3');
    expect(formaterRecord({ valeur: 118, unite: 's' })).toBe('1 min 58');
    expect(erreursRecord({ libelle: '', valeur: undefined })).toEqual(['Choisis ou écris l’exercice.', 'Indique ta performance.']);
  });

  it('repère la meilleure charge de chaque exercice dans les séances faites', () => {
    const realisation = (fin: string, charge: number, reps: number): RealisationDetail => ({
      id: fin,
      seanceId: 's',
      clientId: 'c',
      debut: fin,
      fin,
      seanceTitre: 'S',
      exercices: { dc: 'Développé couché' },
      series: [{ id: `${fin}-1`, ligneId: 'l', exerciceId: 'dc', index: 0, valeurs: { charge, repetitions: reps }, suggestion: {} }],
    });
    expect(meilleuresChargesDesSeances([realisation('2026-10-01T10:00:00Z', 40, 10), realisation('2026-10-08T10:00:00Z', 45, 8)])).toEqual([
      { exerciceId: 'dc', nom: 'Développé couché', charge: 45, repetitions: 8, date: '2026-10-08' },
    ]);
  });
});

describe('nutrition', () => {
  it('vérifie le plan et recalcule les calories des macros', () => {
    expect(erreursPlan({})).toEqual(['Renseigne au moins un objectif ou un conseil.']);
    expect(erreursPlan({ calories: 300 })).toEqual(['Calories : entre 800 et 8000.']);
    expect(erreursPlan({ conseils: 'Légumes à chaque repas' })).toEqual([]);
    expect(caloriesDesMacros({ proteinesG: 110, glucidesG: 210, lipidesG: 65 })).toBe(1865);
  });

  it('un jour sans saisie ne compte pas comme un mauvais jour', () => {
    expect(erreursJournal({})).toEqual(['Remplis au moins une case.']);
    const resume = resumeJournal(
      [
        { id: '1', clientId: 'c', date: '2026-10-20', respect: 4, eauL: 2 },
        { id: '2', clientId: 'c', date: '2026-10-18', respect: 3 },
        { id: '3', clientId: 'c', date: '2026-10-01', respect: 1 },
      ],
      7,
      '2026-10-20',
    );
    expect(resume).toEqual({ joursNotes: 2, respect: 3.5, eauL: 2 });
  });
});
