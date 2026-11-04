import { describe, expect, it } from 'vitest';

import { peutPasserA, prorataChangement, type Abonnement } from '../src/domain/abonnements';
import { OFFRES_DEMO } from '../src/domain/offres';

const [appli, nutrition, leger] = OFFRES_DEMO;
const abonne: Abonnement = {
  accesAppli: true,
  optionNutrition: false,
  offre: appli,
  offrePrix: 59,
  paiement: 'stripe',
  statutStripe: 'active',
  prochaineEcheance: '2026-12-01',
} as Abonnement;

describe('passer à une offre supérieure', () => {
  it('seulement vers une offre plus chère, prélevée par carte et au même rythme', () => {
    expect(peutPasserA(abonne, nutrition)).toBe(true);
    expect(peutPasserA(abonne, appli)).toBe(false);
    expect(peutPasserA({ ...abonne, offre: leger, offrePrix: 149 }, nutrition)).toBe(false);
    expect(peutPasserA({ ...abonne, paiement: 'manuel' }, nutrition)).toBe(false);
    expect(peutPasserA({ ...abonne, statutStripe: 'past_due' }, nutrition)).toBe(false);
    expect(peutPasserA(abonne, { ...nutrition, periodicite: 'annee' })).toBe(false);
    expect(peutPasserA(abonne, { ...nutrition, active: false })).toBe(false);
  });

  it('estime la différence au prorata des jours restants', () => {
    // De 59 € à 99 € le 16 novembre, prochain prélèvement le 1er décembre : 15 jours sur 30.
    expect(prorataChangement(abonne, nutrition, '2026-11-16')).toBe(20);
    expect(prorataChangement(abonne, nutrition, '2026-11-01')).toBe(40);
    expect(prorataChangement({ ...abonne, prochaineEcheance: undefined }, nutrition, '2026-11-16')).toBeUndefined();
  });
});
