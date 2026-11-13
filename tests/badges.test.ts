import { describe, expect, it } from 'vitest';

import { BADGES, GRADES, lundiDe, nouveaux, progression, type EntreeBadges } from '../src/domain/badges';

const base = (p: Partial<EntreeBadges> = {}): EntreeBadges => ({
  aujourdhui: '2026-11-12', // un jeudi
  seancesProgramme: [],
  activites: [],
  parSemaine: 2,
  nbRecords: 0,
  tonnageKg: 0,
  cycleTermine: false,
  joursNotes: [],
  ...p,
});

describe('badges', () => {
  it('trouve le lundi de la semaine', () => {
    expect(lundiDe('2026-11-12')).toBe('2026-11-09');
    expect(lundiDe('2026-11-09')).toBe('2026-11-09');
    expect(lundiDe('2026-11-15')).toBe('2026-11-09');
  });

  it('un nouveau client est Recrue, sans badge', () => {
    const p = progression(base());
    expect(p.gagnes).toEqual([]);
    expect(p.grade.nom).toBe('Recrue');
    expect(p.serie).toBe(0);
  });

  it('compte les semaines complètes d’affilée, la semaine en cours seulement si elle est complète', () => {
    const p = progression(
      base({
        seancesProgramme: ['2026-10-20', '2026-10-22', '2026-10-27', '2026-10-29', '2026-11-03', '2026-11-05', '2026-11-10'],
      }),
    );
    expect(p.serie).toBe(3);
    expect(p.semaine).toEqual({ faites: 1, objectif: 2 });
    expect(p.gagnes).toEqual(expect.arrayContaining(['premiere', 'semaine', 'feu']));
    const complete = progression(base({ seancesProgramme: ['2026-11-03', '2026-11-05', '2026-11-10', '2026-11-11'] }));
    expect(complete.serie).toBe(2);
  });

  it('une semaine ratée est couverte par le joker du mois, une deuxième casse la série', () => {
    // Semaines du 5, 12 et 26 octobre complètes, celle du 19 ratée : joker d'octobre.
    const joker = progression(base({ aujourdhui: '2026-10-29', seancesProgramme: ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-26', '2026-10-27'] }));
    expect(joker.serie).toBe(3);
    // Deux semaines ratées en octobre : la série repart.
    const casse = progression(base({ aujourdhui: '2026-10-29', seancesProgramme: ['2026-10-05', '2026-10-06', '2026-10-26', '2026-10-27'] }));
    expect(casse.serie).toBe(1);
    expect(casse.meilleureSerie).toBe(1);
  });

  it('les activités en plus comptent dans la semaine et donnent le badge bonus', () => {
    const p = progression(base({ seancesProgramme: ['2026-11-10'], activites: ['2026-11-11'] }));
    expect(p.semaine.faites).toBe(2);
    expect(p.gagnes).toContain('bonus');
    expect(p.gagnes).toContain('semaine');
  });

  it('records, tonnage, cycle et journées notées', () => {
    const jours = Array.from({ length: 7 }, (_, i) => `2026-11-0${i + 1}`);
    const p = progression(base({ nbRecords: 5, tonnageKg: 12_500, cycle: { semaine: 3, nbSemaines: 6 }, joursNotes: jours }));
    expect(p.gagnes).toEqual(expect.arrayContaining(['record', 'records5', 'tonnes10', 'mi_parcours', 'journee7']));
    expect(p.gagnes).not.toContain('tonnes50');
    expect(p.avancement.tonnes50).toEqual({ fait: 12, but: 50 });
    expect(progression(base({ cycleTermine: true })).gagnes).toEqual(expect.arrayContaining(['cycle', 'mi_parcours']));
  });

  it('le grade monte avec le nombre de badges et le dernier est atteignable', () => {
    expect(GRADES.at(-1)!.seuil).toBeLessThanOrEqual(BADGES.length);
    const p = progression(base({ seancesProgramme: ['2026-11-10'], activites: ['2026-11-11'], nbRecords: 1 }));
    expect(p.gagnes.length).toBe(4);
    expect(p.grade.nom).toBe('Challenger');
    expect(p.suivant?.nom).toBe('Athlète');
  });

  it('ne fête rien à la première visite, puis seulement les nouveaux', () => {
    expect(nouveaux(['premiere'], null)).toEqual([]);
    expect(nouveaux(['premiere', 'record'], ['premiere'])).toEqual(['record']);
  });
});

describe('badge carnet tenu', () => {
  it('se gagne avec 5 séances notées en entier', () => {
    expect(progression(base({ seancesDetaillees: 4 })).gagnes).not.toContain('carnet');
    const p = progression(base({ seancesDetaillees: 5 }));
    expect(p.gagnes).toContain('carnet');
    expect(progression(base({ seancesDetaillees: 3 })).avancement.carnet).toEqual({ fait: 3, but: 5 });
  });
});
