import { describe, expect, it } from 'vitest';

import * as serveur from '../supabase/functions/_shared/abonnements';
import {
  CLES_FORMULES,
  droitsFormule,
  FORMULES,
  libelleRemise,
  lireRemise,
  mensualite,
  prixAvecRemise,
  statutOuvreAcces,
  type StatutStripe,
} from '../src/domain/abonnements';

describe('les 4 formules du site', () => {
  it('reprennent les prix et le contenu affichés sur le site', () => {
    expect(CLES_FORMULES.map((c) => [FORMULES[c].nom, FORMULES[c].prix])).toEqual([
      ['Appli', 59],
      ['Appli + nutrition', 99],
      ['Hybride léger', 149],
      ['Hybride complet', 269],
    ]);
    expect(droitsFormule('appli')).toEqual({ formule: 'appli', accesAppli: true, optionNutrition: false, videosMois: 0 });
    expect(droitsFormule('hybride_complet')).toEqual({ formule: 'hybride_complet', accesAppli: true, optionNutrition: true, videosMois: 2 });
    expect(FORMULES.hybride_leger.seancesMois).toBe(1);
  });

  it('les fonctions serveur appliquent les mêmes formules que l’appli', () => {
    for (const c of CLES_FORMULES) {
      const { nom, prix, optionNutrition, seancesMois, videosMois } = FORMULES[c];
      expect(serveur.FORMULES[c]).toEqual({ nom, prix, optionNutrition, seancesMois, videosMois });
    }
    const statuts: StatutStripe[] = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
    for (const s of statuts) expect(serveur.statutOuvreAcces(s)).toBe(statutOuvreAcces(s));
  });
});

describe('remise exceptionnelle', () => {
  const jour = '2026-11-03';

  it('100 % : offert, le prix normal reste visible', () => {
    expect(prixAvecRemise(99, { type: 'pourcent', valeur: 100 }, jour)).toEqual({ prix: 99, remise: 99, aPayer: 0, offert: true });
  });

  it('un pourcentage ou un montant au choix, jamais sous 0 €', () => {
    expect(prixAvecRemise(149, { type: 'pourcent', valeur: 20 }, jour)).toMatchObject({ remise: 29.8, aPayer: 119.2, offert: false });
    expect(prixAvecRemise(59, { type: 'montant', valeur: 20 }, jour)).toMatchObject({ remise: 20, aPayer: 39 });
    expect(prixAvecRemise(59, { type: 'montant', valeur: 80 }, jour)).toMatchObject({ remise: 59, aPayer: 0, offert: true });
  });

  it('s’arrête après sa date de fin', () => {
    const r = { type: 'pourcent' as const, valeur: 100, jusquAu: '2026-12-31' };
    expect(prixAvecRemise(99, r, '2026-12-31').aPayer).toBe(0);
    expect(prixAvecRemise(99, r, '2027-01-01').aPayer).toBe(99);
  });

  it('la mensualité suit la formule et la remise', () => {
    expect(mensualite({ accesAppli: true, optionNutrition: true, formule: 'hybride_leger' }, jour)).toBe(149);
    expect(mensualite({ accesAppli: true, optionNutrition: true, formule: 'hybride_leger', remise: { type: 'pourcent', valeur: 100 } }, jour)).toBe(0);
    expect(mensualite({ accesAppli: false, optionNutrition: false, formule: 'appli' }, jour)).toBe(0);
  });

  it('lit la saisie du coach et refuse ce qui n’a pas de sens', () => {
    expect(lireRemise('pourcent', '100', ' Merci d’être testeur ', '31/12/2026')).toEqual({
      type: 'pourcent',
      valeur: 100,
      motif: 'Merci d’être testeur',
      jusquAu: '2026-12-31',
    });
    expect(lireRemise('montant', '19,90', '', '')).toEqual({ type: 'montant', valeur: 19.9, motif: undefined, jusquAu: undefined });
    expect(lireRemise('pourcent', '120', '', '')).toMatch(/100 %/);
    expect(lireRemise('montant', '0', '', '')).toMatch(/illisible/);
    expect(lireRemise('pourcent', '50', '', 'demain')).toMatch(/Date/);
  });

  it('s’affiche simplement', () => {
    expect(libelleRemise({ type: 'pourcent', valeur: 100 })).toBe('offert (−100 %)');
    expect(libelleRemise({ type: 'montant', valeur: 20, jusquAu: '2026-12-31' })).toBe('−20 € par mois jusqu’au 31/12/2026');
  });
});

describe('remise envoyée à Stripe', () => {
  const fiche = { remise_type: 'pourcent', remise_valeur: 100, remise_motif: 'Merci d’être testeur', remise_jusqu_au: null };

  it('100 % pour toujours, avec le message du coach sur la facture', () => {
    expect(serveur.coupon(fiche, '2026-11-03')).toEqual({ name: 'Merci d’être testeur', percent_off: 100, duration: 'forever' });
  });

  it('un montant en centimes, pour le nombre de mois jusqu’à la date de fin', () => {
    expect(serveur.coupon({ ...fiche, remise_type: 'montant', remise_valeur: '20.00', remise_motif: null, remise_jusqu_au: '2027-01-31' }, '2026-11-03')).toEqual({
      name: 'Remise de ton coach',
      amount_off: 2000,
      currency: 'eur',
      duration: 'repeating',
      duration_in_months: 3,
    });
  });

  it('rien quand il n’y a pas de remise ou qu’elle est finie', () => {
    expect(serveur.coupon({ ...fiche, remise_type: null, remise_valeur: null }, '2026-11-03')).toBeUndefined();
    expect(serveur.coupon({ ...fiche, remise_jusqu_au: '2026-10-31' }, '2026-11-03')).toBeUndefined();
  });
});
