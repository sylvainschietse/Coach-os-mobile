// Activités sportives : heures de Paris, sommeil de la nuit, allure et totaux.
import { describe, expect, it } from 'vitest';

import { allure, erreursActivite, heuresDeSommeil, heureParis, plageJourParis, rythme, sportHealthConnect, totauxParSemaine } from '../src/domain/activites';
import { jourParis, lundiDe } from '../src/domain/entrainement';

describe('heures de Paris', () => {
  it('minuit en hiver et en été', () => {
    expect(heureParis('2026-01-15', 0)).toBe('2026-01-14T23:00:00.000Z');
    expect(heureParis('2026-07-15', 0)).toBe('2026-07-14T22:00:00.000Z');
  });
  it('les jours de changement d’heure font 23 h et 25 h', () => {
    const ete = plageJourParis('2026-03-29');
    expect((Date.parse(ete.fin) - Date.parse(ete.debut)) / 3600e3).toBe(23);
    const hiver = plageJourParis('2026-10-25');
    expect((Date.parse(hiver.fin) - Date.parse(hiver.debut)) / 3600e3).toBe(25);
  });
});

describe('sommeil', () => {
  const nuit = (debut: string, fin: string, origine = 'montre', eveils: { debut: string; fin: string }[] = []) => ({ debut, fin, origine, eveils });
  it('compte la nuit qui finit le matin, sans les éveils', () => {
    const h = heuresDeSommeil([nuit('2026-10-28T21:30:00Z', '2026-10-29T05:30:00Z', 'montre', [{ debut: '2026-10-29T02:00:00Z', fin: '2026-10-29T02:30:00Z' }])], '2026-10-29');
    expect(h).toBe(7.5);
  });
  it('ne cumule pas montre et téléphone, et ignore la nuit suivante', () => {
    const h = heuresDeSommeil(
      [nuit('2026-10-28T22:00:00Z', '2026-10-29T06:00:00Z'), nuit('2026-10-28T22:30:00Z', '2026-10-29T05:00:00Z', 'telephone'), nuit('2026-10-29T22:00:00Z', '2026-10-30T06:00:00Z')],
      '2026-10-29',
    );
    expect(h).toBe(8);
  });
  it('rien d’enregistré : null', () => expect(heuresDeSommeil([], '2026-10-29')).toBeNull());
});

describe('affichage', () => {
  it('allure, vitesse et natation', () => {
    expect(allure(10000, 3070)).toBe('5:07 /km');
    expect(rythme({ sport: 'velo', distanceM: 40000, dureeS: 5400 })).toBe('26,7 km/h');
    expect(rythme({ sport: 'natation', distanceM: 1500, dureeS: 1800 })).toBe('2:00 /100 m');
    expect(allure(undefined, 1000)).toBe('');
  });
  it('codes Health Connect', () => {
    expect(sportHealthConnect(56)).toBe('course');
    expect(sportHealthConnect(8)).toBe('velo');
    expect(sportHealthConnect(999)).toBe('autre');
  });
  it('totaux par semaine', () => {
    const t = totauxParSemaine(
      [
        { sport: 'course', debut: '2026-10-26T07:00:00Z', dureeS: 1800, distanceM: 5000, deniveleM: 20 },
        { sport: 'velo', debut: '2026-10-28T07:00:00Z', dureeS: 3600, distanceM: 10000 },
        { sport: 'course', debut: '2026-10-20T07:00:00Z', dureeS: 1200, distanceM: 3000 },
      ],
      (i) => lundiDe(jourParis(i)),
    );
    expect(t.map((x) => [x.lundi, x.nombre, x.distanceM])).toEqual([
      ['2026-10-26', 2, 15000],
      ['2026-10-19', 1, 3000],
    ]);
    expect(t[0].distanceParSport).toEqual({ course: 5000, velo: 10000 });
  });
  it('contrôles', () => {
    expect(erreursActivite({ source: 'health_connect', idExterne: 'a', sport: 'course', titre: '', debut: '2026-10-28T07:00:00Z', dureeS: 1800, fcMoy: 300 })).toEqual(['Fréquence cardiaque invalide.']);
  });
});
