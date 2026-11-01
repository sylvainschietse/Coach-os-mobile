import { describe, expect, it } from 'vitest';

import type { Planification, RealisationLue } from '@/domain/entrainement-etat';
import { assiduite, bilanParSemaine, courbesExercices, detailSeance, ressentiMoyen, semainesDuCycle } from '@/domain/suivi-entrainement';

const serie = (ligneId: string, index: number, charge: number | undefined, repetitions: number, exerciceId = `exo-${ligneId}`) => ({
  id: `${ligneId}-${index}-${charge}`,
  ligneId,
  exerciceId,
  index,
  valeurs: charge === undefined ? { repetitions } : { charge, repetitions },
  suggestion: {},
});

const real = (id: string, jour: string, series: RealisationLue['series'], extra: Partial<RealisationLue> = {}): RealisationLue => ({
  id,
  clientId: 'c',
  seanceId: 'seance-a',
  cycleId: 'cy',
  debut: `${jour}T09:00:00.000Z`,
  fin: `${jour}T10:00:00.000Z`,
  series,
  seanceTitre: 'Bas du corps',
  noms: { squat: 'Squat', pompes: 'Pompes' },
  ...extra,
});

const creneau = (id: string, date: string, statut: Planification['statut'] = 'Prévue', extra: Partial<Planification> = {}): Planification => ({
  id,
  clientId: 'c',
  cycleId: 'cy',
  seanceId: 'seance-a',
  seanceTitre: 'Bas du corps',
  date,
  statut,
  envoiId: id,
  ...extra,
});

describe('semaines du cycle', () => {
  const cycle = { debut: '2026-10-05', fin: '2026-10-25' };

  it('colore les séances : faite, manquée (créneau passé), prévue (à venir)', () => {
    const semaines = semainesDuCycle({
      cycle,
      jour: '2026-10-14',
      realisations: [real('r1', '2026-10-06', [], { planificationId: 'p1' })],
      planifications: [
        creneau('p1', '2026-10-06', 'Réalisée', { realisationId: 'r1' }),
        creneau('p2', '2026-10-08'),
        creneau('p3', '2026-10-15'),
        creneau('p4', '2026-10-16', 'Annulée'),
      ],
    });
    expect(semaines.map((s) => s.numero)).toEqual([1, 2, 3]);
    expect(semaines[0].pastilles.map((p) => p.statut)).toEqual(['faite', 'manquee']);
    expect(semaines[0].pastilles[0].realisationId).toBe('r1');
    expect(semaines[1].enCours).toBe(true);
    expect(semaines[1].pastilles.map((p) => p.statut)).toEqual(['prevue']);
  });

  it('complète avec la fréquence du programme quand rien n’est planifié', () => {
    const semaines = semainesDuCycle({ cycle, jour: '2026-10-14', realisations: [real('r1', '2026-10-07', [])], planifications: [], seancesParSemaine: 3 });
    expect(semaines[0].pastilles.map((p) => p.statut)).toEqual(['faite', 'manquee', 'manquee']);
    expect(semaines[1].pastilles.map((p) => p.statut)).toEqual(['prevue', 'prevue', 'prevue']);
    expect(assiduite(semaines)).toEqual({ faites: 1, manquees: 2, aVenir: 6, taux: 33 });
  });

  it('ne compte pas deux fois une séance faite hors créneau', () => {
    const semaines = semainesDuCycle({ cycle, jour: '2026-10-14', realisations: [real('r1', '2026-10-07', [])], planifications: [], seancesParSemaine: 1 });
    expect(semaines[0].pastilles).toHaveLength(1);
  });
});

describe('détail d’une séance', () => {
  it('compare la meilleure série à la fois précédente', () => {
    const avant = real('r1', '2026-10-06', [serie('squat', 0, 40, 10), serie('pompes', 1, undefined, 12)]);
    const apres = real('r2', '2026-10-13', [serie('squat', 0, 45, 10), serie('squat', 1, 45, 8), serie('pompes', 2, undefined, 10)]);
    const d = detailSeance(apres, [avant, apres], { squat: { series: 3, repetitions: '10' } });
    expect(d.map((x) => [x.nom, x.series.length, x.evolution])).toEqual([
      ['Squat', 2, 'hausse'],
      ['Pompes', 1, 'baisse'],
    ]);
    expect(d[0].prescription).toEqual({ series: 3, repetitions: '10' });
    expect(d[0].precedente?.valeurs).toEqual({ charge: 40, repetitions: 10 });
  });

  it('sans séance précédente, pas de tendance', () => {
    const r = real('r1', '2026-10-06', [serie('squat', 0, 40, 10)]);
    expect(detailSeance(r, [r], {})[0].evolution).toBeUndefined();
  });
});

describe('évolutions', () => {
  const r1 = real('r1', '2026-10-06', [serie('squat', 0, 40, 10), serie('squat', 1, 42, 8)], { note: 6 });
  const r2 = real('r2', '2026-10-13', [serie('squat', 0, 45, 10)], { note: 8 });

  it('une courbe par exercice : charge max, 1RM estimé, tonnage', () => {
    const [squat] = courbesExercices([r2, r1]);
    expect(squat.nom).toBe('Squat');
    expect(squat.points).toEqual([
      { date: '2026-10-06', chargeMax: 42, rm: 53.3, volume: 736, repetitions: 10, duree: undefined },
      { date: '2026-10-13', chargeMax: 45, rm: 60, volume: 450, repetitions: 10, duree: undefined },
    ]);
  });

  it('bilan par semaine et ressenti moyen', () => {
    const semaines = semainesDuCycle({ cycle: { debut: '2026-10-05', fin: '2026-10-18' }, jour: '2026-10-14', realisations: [r1, r2], planifications: [] });
    expect(bilanParSemaine(semaines, [r1, r2])).toEqual([
      { debut: '2026-10-05', seances: 1, volume: 736, ressenti: 6 },
      { debut: '2026-10-12', seances: 1, volume: 450, ressenti: 8 },
    ]);
    expect(ressentiMoyen([r1, r2])).toBe(7);
    expect(ressentiMoyen([r1, r2], '2026-10-10')).toBe(8);
  });
});
