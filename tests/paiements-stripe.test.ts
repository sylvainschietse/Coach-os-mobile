import { describe, expect, it } from 'vitest';

import * as serveur from '../supabase/functions/_shared/abonnements';
import { libelleRemise, lireRemise, mensualite, prixAvecRemise, statutOuvreAcces, type StatutStripe } from '../src/domain/abonnements';
import { contenuOffre, droitsOffre, libellePrix, lireOffre, MODELES, OFFRES_DEMO, type Offre } from '../src/domain/offres';

const hybride: Offre = { ...MODELES.hybride.base, id: 'o1', nom: 'Hybride léger', prix: 149, videosMois: 0, seances: 1, ordre: 1, enLigne: true };

describe('offres du coach', () => {
  it('les offres de Sylvain sont recréées avec leurs prix', () => {
    expect(OFFRES_DEMO.map((o) => [o.nom, o.prix, o.periodicite])).toEqual([
      ['Appli', 59, 'mois'],
      ['Appli + nutrition', 99, 'mois'],
      ['Hybride léger', 149, 'mois'],
      ['Hybride complet', 269, 'mois'],
    ]);
  });

  it('l’offre ouvre ce qui est coché, et un pack ne touche pas aux accès', () => {
    expect(droitsOffre(hybride)).toEqual({ accesAppli: true, optionNutrition: true, videosMois: 0 });
    expect(droitsOffre({ ...hybride, accesAppli: false })).toEqual({ accesAppli: false, optionNutrition: false, videosMois: 0 });
    expect(droitsOffre(MODELES.seances.base)).toEqual({});
  });

  it('les fonctions serveur appliquent les mêmes droits que l’appli', () => {
    for (const o of [hybride, { ...hybride, accesAppli: false }, { ...hybride, nutrition: false, videosMois: 4 }, MODELES.seances.base]) {
      const d = droitsOffre(o);
      const s = serveur.droitsOffre({ periodicite: o.periodicite, acces_appli: o.accesAppli, nutrition: o.nutrition, videos_mois: o.videosMois });
      expect(s).toEqual('accesAppli' in d ? { acces_appli: d.accesAppli, option_nutrition: d.optionNutrition, videos_mois: d.videosMois } : {});
    }
    const statuts: StatutStripe[] = ['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];
    for (const s of statuts) expect(serveur.statutOuvreAcces(s)).toBe(statutOuvreAcces(s));
  });

  it('un prix Stripe par montant et par rythme : changer le prix crée un nouveau tarif', () => {
    expect(serveur.tarifStripe({ prix: '149.00', periodicite: 'mois' })).toEqual({ centimes: 14900, recurring: { interval: 'month', interval_count: 1 }, cle: '14900_mois' });
    expect(serveur.tarifStripe({ prix: 390, periodicite: 'trimestre' }).recurring).toEqual({ interval: 'month', interval_count: 3 });
    expect(serveur.tarifStripe({ prix: 990, periodicite: 'annee' }).recurring).toEqual({ interval: 'year', interval_count: 1 });
    expect(serveur.tarifStripe({ prix: 550, periodicite: 'unique' }).recurring).toBeUndefined();
    expect(serveur.tarifStripe({ prix: 159, periodicite: 'mois' }).cle).not.toBe(serveur.tarifStripe({ prix: 149, periodicite: 'mois' }).cle);
  });

  it('s’affiche comme le client la lit', () => {
    expect(libellePrix(hybride)).toBe('149 € / mois');
    expect(libellePrix(MODELES.seances.base)).toBe('550 € en une fois');
    expect(contenuOffre(hybride)).toEqual([
      '1 séance avec ton coach par mois',
      'Ton programme et ton suivi dans l’appli',
      'Nutrition complète : recettes, plan de repas, photo d’assiette',
      'Messagerie avec ton coach',
    ]);
    expect(contenuOffre({ ...MODELES.en_ligne.base, essaiJours: 14 })).toContain('14 jours d’essai offerts');
  });

  it('sur la fiche du client, le coach lit « avec toi »', () => {
    expect(contenuOffre(hybride, 'coach')).toEqual([
      '1 séance avec toi par mois',
      'Programme et suivi dans l’appli',
      'Nutrition complète : recettes, plan de repas, photo d’assiette',
      'Messagerie avec toi',
    ]);
  });

  it('lit la saisie du coach et refuse ce qui n’a pas de sens', () => {
    const base = { ...MODELES.en_ligne.base, prix: '79,90' };
    expect(lireOffre({ ...base, nom: '  Suivi  ' })).toMatchObject({ nom: 'Suivi', prix: 79.9 });
    expect(lireOffre({ ...base, nom: '' })).toMatch(/nom/);
    expect(lireOffre({ ...base, prix: 'abc' })).toMatch(/Prix/);
    expect(lireOffre({ ...MODELES.seances.base, prix: '550', seances: 0 })).toMatch(/séance/);
    // Un pack payé en une fois n'ouvre pas l'appli, même si la case était cochée avant.
    expect(lireOffre({ ...MODELES.seances.base, prix: '550', accesAppli: true, videosMois: 3 })).toMatchObject({ accesAppli: false, videosMois: 0 });
  });

  it('le client garde son prix quand le coach change celui de l’offre', () => {
    expect(mensualite({ accesAppli: true, optionNutrition: true, offre: { ...hybride, prix: 169 }, offrePrix: 149 }, '2026-11-03')).toBe(149);
    expect(mensualite({ accesAppli: true, optionNutrition: true, offre: hybride }, '2026-11-03')).toBe(149);
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

  it('la mensualité suit l’offre et la remise', () => {
    expect(mensualite({ accesAppli: true, optionNutrition: true, offre: hybride }, jour)).toBe(149);
    expect(mensualite({ accesAppli: true, optionNutrition: true, offre: hybride, remise: { type: 'pourcent', valeur: 100 } }, jour)).toBe(0);
    expect(mensualite({ accesAppli: true, optionNutrition: false, offrePrix: 70 }, jour)).toBe(70);
    expect(mensualite({ accesAppli: false, optionNutrition: false }, jour)).toBe(0);
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
