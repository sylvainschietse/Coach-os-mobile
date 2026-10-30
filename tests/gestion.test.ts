// Lot 6 : règles Coachings, Tâches, Paiements et Bilans (domain/gestion.ts).
import { describe, expect, it } from 'vitest';

import { CARNET_VIDE, relancesDuJour, type Carnet } from '../src/domain/crm';
import {
  coachingDepuisBooster,
  creerBilan,
  creerPaiement,
  creerTache,
  ecartPrecedent,
  encaissementsDuMois,
  modifierBilan,
  modifierPaiement,
  modifierTache,
  sectionsBilan,
  statutTache,
  supprimerCoaching,
  tachesEchues,
} from '../src/domain/gestion';

let n = 0;
const ctx = { nouvelId: () => `id${++n}`, maintenant: new Date('2026-10-25T10:00:00') };
const base: Carnet = {
  ...CARNET_VIDE,
  contacts: [
    { id: 'c', prenom: 'Inès', nom: 'Roux', statut: 'booster_fait', creeLe: '2026-10-01T10:00:00Z', objectifPrincipal: 'Remise en forme' },
    { id: 'z', prenom: 'Zoé', nom: '', statut: 'archive', creeLe: '2026-10-01T10:00:00Z' },
  ],
  boosters: [{ id: 'b', contactId: 'c', date: '2026-10-20T16:30:00Z', statut: 'fait', priorites: [], offreRecommandee: 'Coaching Premium – 250 €' }],
};

describe('coaching depuis un Booster', () => {
  it('crée un seul coaching, Booster vendu et contact client actif', () => {
    const r = coachingDepuisBooster(base, 'b', ctx);
    expect(r.existant).toBe(false);
    expect(r.carnet.coachings[0]).toMatchObject({ nom: 'Coaching · Inès Roux', statut: 'À démarrer', formule: 'Premium', objectif: 'Remise en forme', boosterId: 'b' });
    expect(r.carnet.boosters[0].resultatCommercial).toBe('Vendu');
    expect(r.carnet.contacts[0].statutCrm).toBe('Client actif');
    const encore = coachingDepuisBooster(r.carnet, 'b', ctx);
    expect(encore).toMatchObject({ existant: true, id: r.id });
    expect(encore.carnet.coachings).toHaveLength(1);
  });
  it('exige une offre choisie dans le Booster', () => {
    const sans = { ...base, boosters: [{ ...base.boosters[0], offreRecommandee: 'Aucune' }] };
    expect(() => coachingDepuisBooster(sans, 'b', ctx)).toThrow(/offre/);
  });
});

describe('tâches', () => {
  it('une tâche fermée sort de la journée, rouverte elle y revient', () => {
    const t = creerTache(base, { titre: 'Appeler', contactId: 'c', echeance: '2026-10-24', statut: 'À faire', priorite: 'Haute' }, ctx);
    expect(relancesDuJour(t.carnet, ctx.maintenant)).toHaveLength(1);
    expect(tachesEchues(t.carnet, ctx.maintenant)).toHaveLength(1);
    const fermee = modifierTache(t.carnet, t.id, { titre: 'Appeler', contactId: 'c', echeance: '2026-10-24', statut: 'Annulée' }, ctx);
    expect(statutTache(fermee.relances[0])).toBe('Annulée');
    expect(relancesDuJour(fermee, ctx.maintenant)).toHaveLength(0);
    const rouverte = modifierTache(fermee, t.id, { titre: 'Appeler', contactId: 'c', echeance: '2026-10-24', statut: 'En cours' }, ctx);
    expect(rouverte.relances[0].faiteLe).toBeUndefined();
    expect(tachesEchues(rouverte, ctx.maintenant)).toHaveLength(1);
  });
  it('refuse une tâche sans titre, sans contact ou avec une date impossible', () => {
    expect(() => creerTache(base, { titre: ' ', contactId: 'c', echeance: '2026-10-24', statut: 'À faire' }, ctx)).toThrow();
    expect(() => creerTache(base, { titre: 'X', contactId: '', echeance: '2026-10-24', statut: 'À faire' }, ctx)).toThrow(/contact/);
    expect(() => creerTache(base, { titre: 'X', contactId: 'c', echeance: '2026-02-30', statut: 'À faire' }, ctx)).toThrow(/date/);
  });
});

describe('paiements', () => {
  it('garde montant, devise, date et statut ; seuls les « Payé » du mois comptent', () => {
    let r = creerPaiement(base, { titre: 'Mois 1', contactId: 'c', date: '2026-10-03', montant: 150, moyen: 'Stripe', statut: 'En attente' }, ctx);
    expect(r.carnet.paiements[0]).toMatchObject({ montant: 150, devise: 'EUR', date: '2026-10-03', statut: 'En attente' });
    expect(encaissementsDuMois(r.carnet, ctx.maintenant)).toBe(0);
    const c = modifierPaiement(r.carnet, r.id, { ...r.carnet.paiements[0], statut: 'Payé' });
    expect(encaissementsDuMois(c, ctx.maintenant)).toBe(150);
    r = creerPaiement(c, { titre: 'Mois précédent', contactId: 'c', date: '2026-09-28', montant: 99, statut: 'Payé' }, ctx);
    expect(encaissementsDuMois(r.carnet, ctx.maintenant)).toBe(150);
  });
  it('un montant vide reste non renseigné, un montant négatif est refusé', () => {
    const r = creerPaiement(base, { titre: 'À préciser' }, ctx);
    expect(r.carnet.paiements[0].montant).toBeUndefined();
    expect(() => creerPaiement(base, { titre: 'X', montant: -1 }, ctx)).toThrow(/Montant/);
  });
});

describe('bilans', () => {
  it('garde « Non évalué » (null), calcule l’écart avec le bilan précédent et refuse la modification d’un bilan envoyé', () => {
    const a = creerBilan(base, { contactId: 'c', date: '2026-09-01', poids: 66, piliers: { Force: 6 }, synthese: '', priorites: [] }, ctx);
    const b = creerBilan(a.carnet, { contactId: 'c', date: '2026-10-25', poids: 64.8, piliers: { Force: 7, Sommeil: null }, synthese: 'Belle progression', priorites: ['Dormir'] }, ctx);
    const bilan = b.carnet.bilans.find((x) => x.id === b.id)!;
    expect(bilan.piliers.Sommeil).toBeNull();
    expect(bilan.piliers.Stress).toBeNull();
    expect(bilan.priorites).toEqual(['Dormir', '', '']);
    expect(ecartPrecedent(b.carnet, bilan, 'poids')).toBe(-1.2);
    expect(sectionsBilan(bilan).find((s) => s.titre === 'Les dix piliers')!.texte).toContain('Sommeil : Non évalué');
    expect(() => modifierBilan(b.carnet, b.id, { ...bilan }, ctx, true)).toThrow(/déjà été envoyé/);
    expect(() => creerBilan(base, { contactId: 'c', date: '2026-10-25', piliers: { Force: 0 }, synthese: '', priorites: [] }, ctx)).toThrow();
  });
});

describe('suppression d’un coaching', () => {
  it('garde paiements, tâches et bilans sans lien', () => {
    const r = coachingDepuisBooster(base, 'b', ctx);
    let c = creerPaiement(r.carnet, { titre: 'P', contactId: 'c', coachingId: r.id }, ctx).carnet;
    c = creerTache(c, { titre: 'T', contactId: 'c', coachingId: r.id, echeance: '2026-10-30', statut: 'À faire' }, ctx).carnet;
    const apres = supprimerCoaching(c, r.id);
    expect(apres.coachings).toHaveLength(0);
    expect(apres.paiements[0].coachingId).toBeUndefined();
    expect(apres.relances[0].coachingId).toBeUndefined();
    expect(apres.contacts).toHaveLength(2);
  });
});
