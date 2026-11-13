import { describe, expect, it } from 'vitest';

import { aParis, MAX_RAPPELS, planifierRappels, PREFERENCES_PAR_DEFAUT, rappelsAFaire, type ContexteRappels } from '@/domain/rappels';

// Mardi 3 novembre 2026, 7 h à Paris (6 h UTC).
const maintenant = new Date('2026-11-03T06:00:00Z');
const base: ContexteRappels = { maintenant, prenom: 'Inès', seances: [], rendezVous: [], repasDuJour: [], bilanFait: false, journalRepas: true };
const rien = { ...PREFERENCES_PAR_DEFAUT, seances: false, repas: false, motivation: false, bilan: false };

describe('heure de Paris', () => {
  it('convertit l’heure de Paris en instant, été comme hiver', () => {
    expect(aParis('2026-11-03', '08:00').toISOString()).toBe('2026-11-03T07:00:00.000Z');
    expect(aParis('2026-07-01', '08:00').toISOString()).toBe('2026-07-01T06:00:00.000Z');
    // Jour du passage à l'heure d'hiver (25 octobre 2026).
    expect(aParis('2026-10-25', '18:00').toISOString()).toBe('2026-10-25T17:00:00.000Z');
  });
});

describe('rappels du client', () => {
  it('rappelle une séance prévue le matin même, sauf si elle est déjà faite', () => {
    const r = planifierRappels(
      { ...rien, seances: true },
      {
        ...base,
        seances: [
          { id: 's1', titre: 'Haut du corps', datePrevue: '2026-11-03' },
          { id: 's2', titre: 'Bas du corps', datePrevue: '2026-11-05', derniereRealisation: '2026-11-05T17:00:00Z' },
          { id: 's3', titre: 'Cardio', datePrevue: '2026-11-30' },
          { id: 's4', titre: 'Sans date' },
        ],
      },
    );
    expect(r.map((x) => [x.id, x.quand.toISOString()])).toEqual([['seance-s1-2026-11-03', '2026-11-03T07:00:00.000Z']]);
    expect(r[0].corps).toContain('Haut du corps');
  });

  it('rappelle un rendez-vous 2 h avant, sauf s’il est annulé', () => {
    const r = planifierRappels(
      { ...rien, seances: true },
      {
        ...base,
        rendezVous: [
          { id: 'r1', debut: '2026-11-04T17:00:00Z', lieu: 'Salle Fitness Park', statut: 'confirme' },
          { id: 'r2', debut: '2026-11-05T17:00:00Z', statut: 'annule' },
        ],
      },
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titre: 'Séance avec ton coach à 18:00', quand: new Date('2026-11-04T15:00:00Z') });
    expect(r[0].corps).toContain('Fitness Park');
  });

  it('rappelle les repas midi et soir, sauf ceux déjà notés aujourd’hui', () => {
    const r = planifierRappels({ ...rien, repas: true }, { ...base, repasDuJour: ['dejeuner'] });
    expect(r[0]).toMatchObject({ id: 'repas-diner-2026-11-03', quand: new Date('2026-11-03T20:00:00Z') });
    expect(r.filter((x) => x.id.endsWith('2026-11-04'))).toHaveLength(2);
    expect(r).toHaveLength(27);
  });

  it('envoie un mot de motivation le mardi et le vendredi à 9 h, avec le prénom', () => {
    const r = planifierRappels({ ...rien, motivation: true }, base);
    expect(r.map((x) => x.id)).toEqual(['motivation-2026-11-03', 'motivation-2026-11-06', 'motivation-2026-11-10', 'motivation-2026-11-13']);
    expect(r[0].corps).toContain('Inès');
    expect(new Set(r.map((x) => x.corps)).size).toBe(4);
  });

  it('rappelle le bilan le dimanche à 18 h, sauf s’il est déjà rempli cette semaine', () => {
    expect(planifierRappels({ ...rien, bilan: true }, base).map((x) => x.id)).toEqual(['bilan-2026-11-08', 'bilan-2026-11-15']);
    expect(planifierRappels({ ...rien, bilan: true }, { ...base, bilanFait: true }).map((x) => x.id)).toEqual(['bilan-2026-11-15']);
  });

  it('ne programme rien de passé, reste sous la limite du téléphone et respecte les choix', () => {
    const tard = { ...base, maintenant: new Date('2026-11-03T13:30:00Z') };
    const r = planifierRappels(PREFERENCES_PAR_DEFAUT, tard);
    expect(r.every((x) => x.quand > tard.maintenant)).toBe(true);
    expect(r.length).toBeLessThanOrEqual(MAX_RAPPELS);
    expect(r.map((x) => x.quand.getTime())).toEqual([...r.map((x) => x.quand.getTime())].sort((a, b) => a - b));
    expect(planifierRappels(rien, base)).toEqual([]);
  });
});

describe('cloche du client : à faire aujourd’hui', () => {
  it('garde les rappels du jour déjà passés et pas encore faits', () => {
    // Dimanche 8 novembre 2026, 21 h 30 à Paris.
    const soir = new Date('2026-11-08T20:30:00Z');
    const ctx: ContexteRappels = {
      ...base,
      maintenant: soir,
      seances: [
        { id: 's1', titre: 'Haut du corps', datePrevue: '2026-11-08' },
        { id: 's2', titre: 'Jambes', datePrevue: '2026-11-08', derniereRealisation: '2026-11-08T10:00:00Z' },
        { id: 's3', titre: 'Cardio', datePrevue: '2026-11-07' },
      ],
      repasDuJour: ['dejeuner'],
      rendezVous: [{ id: 'r1', debut: '2026-11-08T19:00:00Z', statut: 'confirme' }],
    };
    expect(rappelsAFaire(PREFERENCES_PAR_DEFAUT, ctx).map((r) => r.id)).toEqual(['repas-diner-2026-11-08', 'bilan-2026-11-08', 'seance-s1-2026-11-08']);
    // Bilan rempli, dîner noté, réglage des séances coupé : plus rien.
    expect(rappelsAFaire({ ...PREFERENCES_PAR_DEFAUT, seances: false }, { ...ctx, bilanFait: true, repasDuJour: ['dejeuner', 'diner'] })).toEqual([]);
  });

  it('ne montre rien avant l’heure', () => {
    expect(rappelsAFaire(PREFERENCES_PAR_DEFAUT, { ...base, seances: [{ id: 's1', titre: 'Haut du corps', datePrevue: '2026-11-03' }] })).toEqual([]);
  });
});
