import { describe, expect, it } from 'vitest';

import { enregistrerBooster, terminerBooster, type Carnet } from '../src/domain/crm';
import { basculerObservation, choisirResultat, choisirRpe, evaluationVide, syntheseEvaluation, testsRenseignes } from '../src/domain/evaluation';

describe('évaluation du Booster', () => {
  it('distingue un test non renseigné d’un test « Non réalisé »', () => {
    let e = choisirResultat(evaluationVide(), 'poussee', 'Non réalisé');
    const lignes = syntheseEvaluation(e).split('\n');
    expect(lignes[0]).toBe('POUSSÉE — Non réalisé');
    expect(lignes[1]).toBe('TIRAGE — non renseigné');
    e = choisirResultat(e, 'poussee', 'Non réalisé');
    expect(e.tests.poussee?.resultat).toBeUndefined();
  });

  it('suit le format attendu par le compte rendu', () => {
    let e = choisirResultat(evaluationVide(), 'cardio', 'Essoufflement marqué');
    e = choisirRpe(e, 'cardio', 8);
    e = basculerObservation(e, 'cardio', 'Récupération lente');
    e = basculerObservation(e, 'cardio', 'Rythme stable');
    e = { ...e, douleur: 'Oui', douleurPrecision: 'Genou gauche en fente', notes: 'À revoir dans 6 semaines' };
    const s = syntheseEvaluation(e);
    // Observations rangées dans l'ordre de la liste, pas dans l'ordre des touches.
    expect(s).toContain('CARDIO — Essoufflement marqué | RPE 8/10 | Rythme stable, Récupération lente');
    expect(s).toContain('DOULEUR / GÊNE — oui | Genou gauche en fente');
    expect(s.split('\n').at(-1)).toBe('NOTES — À revoir dans 6 semaines');
    expect(testsRenseignes(e)).toBe(1);
  });

  it('enregistre en cours de séance sans clore, puis termine une seule fois', () => {
    const carnet: Carnet = {
      contacts: [{ id: 'c', prenom: 'Karim', nom: '', statut: 'booster_prevu', creeLe: '2026-10-10T10:00:00Z' }],
      questionnaires: [],
      boosters: [{ id: 'b', contactId: 'c', date: '2026-10-20T16:30:00Z', statut: 'prevu', priorites: [] }],
      relances: [],
    };
    const ctx = { nouvelId: () => `id${Math.random()}`, maintenant: new Date('2026-10-20T18:00:00') };
    const e = choisirResultat(evaluationVide(), 'jambes', 'Correct');
    const brouillon = enregistrerBooster(carnet, 'b', { evaluation: e, entretien: { freins: 'Horaires' } });
    expect(brouillon.boosters[0]).toMatchObject({ statut: 'prevu', entretien: { freins: 'Horaires' } });
    expect(brouillon.boosters[0].tests).toContain('JAMBES — Correct');
    const fini = terminerBooster(brouillon, 'b', { evaluation: e, priorites: ['Mobilité', ' ', 'Cardio'] }, ctx);
    expect(fini.boosters[0]).toMatchObject({ statut: 'fait', priorites: ['Mobilité', '', 'Cardio'] });
    expect(fini.relances.filter((r) => r.modele === 'suivi_booster')).toHaveLength(1);
    // Compléter la séance après coup ne relance pas une deuxième fois.
    const complete = terminerBooster(fini, 'b', { priorites: ['Mobilité', 'Cardio', 'Sommeil'] }, ctx);
    expect(complete.relances.filter((r) => r.modele === 'suivi_booster')).toHaveLength(1);
  });
});
