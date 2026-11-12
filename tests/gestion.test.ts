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
  reglerPaiements,
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

describe('paiements par mois et par client', () => {
  it('regroupe par client, totalise et garde le reste à encaisser', async () => {
    const { parClient, moisDe, moisLisible } = await import('@/domain/gestion');
    expect(moisLisible('2026-10')).toBe('Octobre 2026');
    expect(moisDe('2026-10-15')).toBe('2026-10');
    expect(moisDe(undefined)).toBe('sans-date');
    const noms: Record<string, string> = { a: 'Romain', b: 'Benjamin' };
    const g = parClient(
      [
        { contactId: 'a', date: '2026-10-02', montant: 40, statut: 'Payé' },
        { contactId: 'b', date: '2026-10-06', montant: 20, statut: 'En attente' },
        { contactId: 'a', date: '2026-10-20', montant: 20, statut: 'En attente' },
        { date: '2026-10-21', montant: 10, statut: 'Payé' },
      ],
      (id) => (id ? noms[id]! : 'Contact non lié'),
    );
    expect(g.map((x) => [x.nom, x.total, x.enAttente, x.lignes.length])).toEqual([
      ['Benjamin', 20, 20, 1],
      ['Romain', 60, 20, 2],
      ['Contact non lié', 10, 0, 1],
    ]);
    expect(g[1]!.lignes[0]!.date).toBe('2026-10-20');
  });
});

describe('détail des séances d’une ligne du mois', () => {
  it('lit, modifie et réécrit les notes au format de la facture', async () => {
    const { lireSeances, ecrireSeances, totalSeances, nombreSeances, titreSeances, estJourMois, jourMois } = await import('@/domain/gestion');
    const g = lireSeances('Seul (40 €) : 02/10, 09/10, 16/10 · Avec Romain (20 €) : 06/10')!;
    expect(g).toEqual([
      { libelle: 'Seul', prix: 40, dates: ['02/10', '09/10', '16/10'] },
      { libelle: 'Avec Romain', prix: 20, dates: ['06/10'] },
    ]);
    expect(totalSeances(g)).toBe(140);
    g[0]!.dates = ['16/10', '01/10'];
    g[1]!.dates = [];
    expect(ecrireSeances(g)).toBe('Seul (40 €) : 01/10, 16/10');
    const s = lireSeances('15/10, 19/10 · 50 € la séance')!;
    expect(s).toEqual([{ libelle: '', prix: 50, dates: ['15/10', '19/10'] }]);
    s[0]!.dates.push('29/10');
    expect(ecrireSeances(s)).toBe('15/10, 19/10, 29/10 · 50 € la séance');
    expect(nombreSeances(s)).toBe(3);
    expect(ecrireSeances([{ libelle: '', prix: 47.5, dates: ['01/10'] }])).toBe('01/10 · 47,50 € la séance');
    expect(lireSeances('payé en liquide')).toBeUndefined();
    expect(titreSeances('Séances d’octobre 2026 · Maria (3 séances)', 1)).toBe('Séances d’octobre 2026 · Maria (1 séance)');
    expect(estJourMois('3/10')).toBe(true);
    expect(estJourMois('32/10')).toBe(false);
    expect(jourMois('3/9')).toBe('03/09');
  });
});

describe('pack partagé', () => {
  it('compte les séances de chacun seul, à deux et hors agenda', async () => {
    const { detailPack, detailPackLisible } = await import('@/domain/abonnements');
    const d = detailPack(
      5,
      [
        { rendezVousId: 'r1', clientId: 'b' },
        { rendezVousId: 'r1', clientId: 'r' },
        { rendezVousId: 'r2', clientId: 'b' },
        { rendezVousId: 'r3', clientId: 'r' },
        { rendezVousId: 'r4', clientId: 'b' },
      ],
      new Map([['b', 'Benjamin'], ['r', 'Romain']]),
    );
    expect(d).toEqual({ seuls: [{ clientId: 'b', prenom: 'Benjamin', n: 2 }, { clientId: 'r', prenom: 'Romain', n: 1 }], aDeux: 1, horsAgenda: 1 });
    expect(detailPackLisible(d)).toBe('Benjamin seul : 2 · Romain seul : 1 · à deux : 1 · hors agenda : 1');
  });
});

describe('plusieurs séances réglées d’un coup', () => {
  const carnet: Carnet = {
    ...base,
    paiements: [
      { id: 'p1', titre: 'Séance du 06/11 · Inès', contactId: 'c', date: '2026-11-06', montant: 50, statut: 'En attente', devise: 'EUR', creeLe: '2026-11-06T10:00:00Z' },
      { id: 'p2', titre: 'Séance du 10/11 · Inès', contactId: 'c', date: '2026-11-10', montant: 50, statut: 'En attente', devise: 'EUR', creeLe: '2026-11-10T10:00:00Z' },
      { id: 'p3', titre: 'Séance du 11/11 · Inès', contactId: 'c', date: '2026-11-11', montant: 50, statut: 'Payé', moyen: 'Virement', devise: 'EUR', creeLe: '2026-11-11T10:00:00Z' },
      { id: 'p4', titre: 'Séance Zoé', contactId: 'z', date: '2026-11-10', montant: 40, statut: 'En attente', devise: 'EUR', creeLe: '2026-11-10T10:00:00Z' },
    ],
  };

  it('passe les lignes choisies « Payé » avec le moyen choisi, sans toucher leur date ni les autres', () => {
    const r = reglerPaiements(carnet, ['p1', 'p2'], 'Espèces');
    expect(r.paiements.find((p) => p.id === 'p1')).toMatchObject({ statut: 'Payé', moyen: 'Espèces', date: '2026-11-06', montant: 50 });
    expect(r.paiements.find((p) => p.id === 'p2')).toMatchObject({ statut: 'Payé', moyen: 'Espèces', date: '2026-11-10' });
    expect(r.paiements.find((p) => p.id === 'p4')).toMatchObject({ statut: 'En attente' });
  });

  it('refuse une ligne déjà réglée, une liste vide ou deux clients mélangés', () => {
    expect(() => reglerPaiements(carnet, ['p1', 'p3'], 'Espèces')).toThrow(/plus en attente/);
    expect(() => reglerPaiements(carnet, [], 'Espèces')).toThrow(/au moins une/);
    expect(() => reglerPaiements(carnet, ['p1', 'p4'], 'Virement')).toThrow(/même client/);
    expect(() => reglerPaiements(carnet, ['p1', 'inconnu'], 'Virement')).toThrow(/introuvable/);
  });
});
