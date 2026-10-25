import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import * as regles from '@/domain/crm';
import * as gestion from '@/domain/gestion';
import type { Booster, Carnet, Contact, ContactResume, Doublon, FicheContact, ModeleMessage, Questionnaire, Relance, RelanceAFaire } from '@/domain/crm';
import type { BilanCoach, Coaching, Paiement } from '@/domain/gestion';
import { nouvelId } from '@/lib/identifiant';

import { carnetDemo } from './crm-demo';
import { supabase } from './supabase';

export type BoosterAVenir = Booster & { contact: Contact };
export type SaisieContact = Parameters<typeof regles.creerContact>[1];
export type CompteRendu = regles.SaisieBooster & { tests?: string; priorites: string[] };

/** L'accueil des clients côté coach, quelle que soit la source (démo locale ou Supabase). */
export interface DepotCrm {
  contacts(): Promise<ContactResume[]>;
  boosters(): Promise<regles.BoosterDossier[]>;
  fiche(id: string): Promise<FicheContact>;
  journee(): Promise<{ relances: RelanceAFaire[]; boosters: BoosterAVenir[] }>;
  creerContact(saisie: SaisieContact): Promise<{ contact: Contact } | { doublon: Doublon }>;
  modifierContact(id: string, patch: Parameters<typeof regles.modifierContact>[2]): Promise<void>;
  planifierBooster(contactId: string, date: string): Promise<void>;
  /** « Nouveau Booster » : renvoie l'identifiant pour ouvrir l'éditeur dessus. */
  creerBooster(contactId: string, saisie: regles.SaisieFicheBooster & { date: string }): Promise<string>;
  /** Enregistrement explicite de l'éditeur Booster (les 4 rubriques). */
  modifierBooster(boosterId: string, saisie: regles.SaisieFicheBooster): Promise<void>;
  supprimerBooster(boosterId: string): Promise<void>;
  /** Enregistre la saisie en cours de séance (évaluation, entretien, priorités) sans clore le Booster. */
  enregistrerBooster(boosterId: string, saisie: regles.SaisieBooster): Promise<void>;
  terminerBooster(boosterId: string, compteRendu: CompteRendu): Promise<void>;
  annulerBooster(boosterId: string): Promise<void>;
  ajouterRelance(contactId: string, echeance: string, modele: ModeleMessage, note?: string): Promise<void>;
  terminerRelance(id: string): Promise<void>;
  reporterRelance(id: string, echeance: string): Promise<void>;
  /** Ouvre l'espace client (programmes, séances) et clôt les relances commerciales. */
  devenirClient(contactId: string): Promise<void>;
  /**
   * « Préparer / Actualiser l'accès client » : ouvre la fiche client avec l'e-mail du contact,
   * ou recopie l'e-mail et le téléphone actuels sur la fiche client existante.
   */
  preparerAcces(contactId: string): Promise<void>;
  archiver(contactId: string): Promise<void>;
  reactiver(contactId: string): Promise<void>;
  /** Appelé par le questionnaire public, sans compte. */
  soumettreQuestionnaire(lien: string, reponses: Record<string, string>): Promise<void>;
  /** Identifiant public du questionnaire du coach connecté (/questionnaire/<lien>). */
  lienQuestionnaire(): Promise<string | null>;
  // Lot 6 · Coachings, Tâches, Paiements, Bilans (règles dans domain/gestion.ts).
  carnet(): Promise<Carnet>;
  creerCoaching(s: gestion.SaisieCoaching): Promise<string>;
  modifierCoaching(id: string, s: gestion.SaisieCoaching): Promise<void>;
  supprimerCoaching(id: string): Promise<void>;
  coachingDepuisBooster(boosterId: string): Promise<{ id: string; existant: boolean }>;
  creerTache(s: gestion.SaisieTache): Promise<string>;
  modifierTache(id: string, s: gestion.SaisieTache): Promise<void>;
  terminerTache(id: string): Promise<void>;
  supprimerTache(id: string): Promise<void>;
  creerPaiement(s: gestion.SaisiePaiement): Promise<string>;
  modifierPaiement(id: string, s: gestion.SaisiePaiement): Promise<void>;
  supprimerPaiement(id: string): Promise<void>;
  creerBilan(s: gestion.SaisieBilan): Promise<string>;
  modifierBilan(id: string, s: gestion.SaisieBilan, envoye: boolean): Promise<void>;
  lierDocumentBilan(id: string, documentId: string): Promise<void>;
  supprimerBilan(id: string): Promise<void>;
}

const contexte = (): regles.Contexte => ({ nouvelId, maintenant: new Date() });

// Prévient les écrans ouverts côte à côte (ordinateur) qu'une fiche a changé.
const abonnes = new Set<() => void>();
export function ecouterCrm(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
const prevenir = () => abonnes.forEach((fn) => fn());

/**
 * Les deux sources partagent la même mécanique : on lit le carnet, on applique
 * la règle métier pure, puis on enregistre ce qui a changé.
 */
function creerDepot(lire: () => Promise<Carnet>, ecrireBrut: (avant: Carnet, apres: Carnet) => Promise<void>, extra: {
  soumettreQuestionnaire: DepotCrm['soumettreQuestionnaire'];
  lienQuestionnaire: DepotCrm['lienQuestionnaire'];
  ouvrirEspaceClient: (contact: Contact) => Promise<string>;
  actualiserEspaceClient: (contact: Contact) => Promise<void>;
}): DepotCrm {
  async function ecrire(avant: Carnet, apres: Carnet) {
    await ecrireBrut(avant, apres);
    prevenir();
  }

  async function appliquer(regle: (c: Carnet, ctx: regles.Contexte) => Carnet) {
    const avant = await lire();
    await ecrire(avant, regle(avant, contexte()));
  }

  async function creer(regle: (c: Carnet, ctx: regles.Contexte) => { carnet: Carnet; id: string }) {
    const avant = await lire();
    const r = regle(avant, contexte());
    await ecrire(avant, r.carnet);
    return r.id;
  }

  return {
    async contacts() {
      return regles.listeContacts(await lire());
    },
    async boosters() {
      return regles.listeBoosters(await lire());
    },
    async fiche(id) {
      const f = regles.fiche(await lire(), id);
      if (!f) throw new Error('Contact introuvable');
      return f;
    },
    async journee() {
      const carnet = await lire();
      const maintenant = new Date();
      return { relances: regles.relancesDuJour(carnet, maintenant), boosters: regles.boostersAVenir(carnet, maintenant) };
    },
    async creerContact(saisie) {
      const avant = await lire();
      const r = regles.creerContact(avant, saisie, contexte());
      if ('doublon' in r) return { doublon: r.doublon };
      await ecrire(avant, r.carnet);
      return { contact: r.contact };
    },
    modifierContact: (id, patch) => appliquer((c) => regles.modifierContact(c, id, patch)),
    planifierBooster: (contactId, date) => appliquer((c, ctx) => regles.planifierBooster(c, contactId, date, ctx)),
    async creerBooster(contactId, saisie) {
      const avant = await lire();
      const r = regles.creerBooster(avant, contactId, saisie, contexte());
      await ecrire(avant, r.carnet);
      return r.id;
    },
    modifierBooster: (id, saisie) => appliquer((c, ctx) => regles.modifierBooster(c, id, saisie, ctx)),
    supprimerBooster: (id) => appliquer((c, ctx) => regles.supprimerBooster(c, id, ctx)),
    enregistrerBooster: (id, saisie) => appliquer((c) => regles.enregistrerBooster(c, id, saisie)),
    terminerBooster: (id, cr) => appliquer((c, ctx) => regles.terminerBooster(c, id, cr, ctx)),
    annulerBooster: (id) => appliquer((c, ctx) => regles.annulerBooster(c, id, ctx)),
    ajouterRelance: (contactId, echeance, modele, note) =>
      appliquer((c, ctx) => regles.ajouterRelance(c, contactId, echeance, modele, note, ctx)),
    terminerRelance: (id) => appliquer((c, ctx) => regles.terminerRelance(c, id, ctx)),
    reporterRelance: (id, echeance) => appliquer((c) => regles.reporterRelance(c, id, echeance)),
    async devenirClient(contactId) {
      const avant = await lire();
      const contact = avant.contacts.find((x) => x.id === contactId);
      if (!contact) throw new Error('Contact introuvable');
      const clientId = contact.clientId ?? (await extra.ouvrirEspaceClient(contact));
      await ecrire(avant, regles.devenirClient(avant, contactId, clientId, contexte()));
    },
    async preparerAcces(contactId) {
      const avant = await lire();
      const contact = avant.contacts.find((x) => x.id === contactId);
      if (!contact) throw new Error('Contact introuvable');
      if (contact.statut === 'archive') throw new Error('Réactivez d’abord ce dossier.');
      if (!contact.email) throw new Error('Ajoutez d’abord l’e-mail du client dans Coordonnées : il se connectera avec cette adresse.');
      if (contact.clientId) {
        await extra.actualiserEspaceClient(contact);
        prevenir();
        return;
      }
      const clientId = await extra.ouvrirEspaceClient(contact);
      await ecrire(avant, regles.devenirClient(avant, contactId, clientId, contexte()));
    },
    archiver: (id) => appliquer((c, ctx) => regles.archiver(c, id, ctx)),
    reactiver: (id) => appliquer((c) => regles.reactiver(c, id)),
    async soumettreQuestionnaire(lien, reponses) {
      await extra.soumettreQuestionnaire(lien, reponses);
      prevenir();
    },
    lienQuestionnaire: extra.lienQuestionnaire,
    carnet: lire,
    creerCoaching: (saisie) => creer((c, ctx) => gestion.creerCoaching(c, saisie, ctx)),
    modifierCoaching: (id, saisie) => appliquer((c) => gestion.modifierCoaching(c, id, saisie)),
    supprimerCoaching: (id) => appliquer((c) => gestion.supprimerCoaching(c, id)),
    async coachingDepuisBooster(boosterId) {
      const avant = await lire();
      const r = gestion.coachingDepuisBooster(avant, boosterId, contexte());
      if (!r.existant) await ecrire(avant, r.carnet);
      return { id: r.id, existant: r.existant };
    },
    creerTache: (saisie) => creer((c, ctx) => gestion.creerTache(c, saisie, ctx)),
    modifierTache: (id, saisie) => appliquer((c, ctx) => gestion.modifierTache(c, id, saisie, ctx)),
    terminerTache: (id) => appliquer((c, ctx) => gestion.terminerTache(c, id, ctx)),
    supprimerTache: (id) => appliquer((c) => gestion.supprimerTache(c, id)),
    creerPaiement: (saisie) => creer((c, ctx) => gestion.creerPaiement(c, saisie, ctx)),
    modifierPaiement: (id, saisie) => appliquer((c) => gestion.modifierPaiement(c, id, saisie)),
    supprimerPaiement: (id) => appliquer((c) => gestion.supprimerPaiement(c, id)),
    creerBilan: (saisie) => creer((c, ctx) => gestion.creerBilan(c, saisie, ctx)),
    modifierBilan: (id, saisie, envoye) => appliquer((c, ctx) => gestion.modifierBilan(c, id, saisie, ctx, envoye)),
    lierDocumentBilan: (id, documentId) => appliquer((c) => gestion.lierDocumentBilan(c, id, documentId)),
    supprimerBilan: (id) => appliquer((c) => gestion.supprimerBilan(c, id)),
  };
}

// ---------- Démo : tout reste dans ce téléphone ou ce navigateur ----------

const CLE_CARNET = 'coachos.demo.crm';
export const CLE_CLIENTS_DEMO = 'coachos.demo.clients-ajoutes';

async function lireDemo(): Promise<Carnet> {
  try {
    const brut = await AsyncStorage.getItem(CLE_CARNET);
    if (brut) return regles.completerCarnet(JSON.parse(brut) as Partial<Carnet>);
  } catch {
    // Stockage indisponible : on repart du carnet d'exemple.
  }
  return carnetDemo(new Date());
}

const ecrireDemo = (_avant: Carnet, apres: Carnet) => AsyncStorage.setItem(CLE_CARNET, JSON.stringify(apres));

export const crmDemo = creerDepot(lireDemo, ecrireDemo, {
  async soumettreQuestionnaire(_lien, reponses) {
    const avant = await lireDemo();
    if (!regles.normaliserTelephone(reponses.telephone) && !regles.normaliserEmail(reponses.email)) {
      throw new Error('Indique un téléphone ou un e-mail valide.');
    }
    await ecrireDemo(avant, regles.recevoirQuestionnaire(avant, reponses, contexte()).carnet);
  },
  lienQuestionnaire: async () => 'sylvain',
  async ouvrirEspaceClient(contact) {
    let ajoutes: { id: string; prenom: string; nom: string }[] = [];
    try {
      ajoutes = JSON.parse((await AsyncStorage.getItem(CLE_CLIENTS_DEMO)) ?? '[]');
    } catch {
      ajoutes = [];
    }
    const id = `client-${contact.id}`;
    await AsyncStorage.setItem(CLE_CLIENTS_DEMO, JSON.stringify([...ajoutes, { id, prenom: contact.prenom, nom: contact.nom }]));
    return id;
  },
  async actualiserEspaceClient(contact) {
    let ajoutes: { id: string; prenom: string; nom: string }[] = [];
    try {
      ajoutes = JSON.parse((await AsyncStorage.getItem(CLE_CLIENTS_DEMO)) ?? '[]');
    } catch {
      ajoutes = [];
    }
    const maj = ajoutes.map((a) => (a.id === contact.clientId ? { ...a, prenom: contact.prenom, nom: contact.nom } : a));
    await AsyncStorage.setItem(CLE_CLIENTS_DEMO, JSON.stringify(maj));
  },
});

export async function effacerCrmDemo() {
  await Promise.all([CLE_CARNET, CLE_CLIENTS_DEMO].map((c) => AsyncStorage.removeItem(c)));
}

// ---------- Supabase ----------

const n = <T>(v: T | undefined) => (v === undefined ? null : v);
const u = <T>(v: T | null) => (v === null ? undefined : v);
const num = (v: unknown) => (v === null || v === undefined ? undefined : Number(v));

type Ligne = Record<string, unknown>;

const versLigne = {
  contacts: (c: Contact): Ligne => ({
    id: c.id, prenom: c.prenom, nom: c.nom, telephone: n(c.telephone), email: n(c.email), date_naissance: n(c.dateNaissance),
    statut: c.statut, statut_avant_archive: n(c.statutAvantArchive), source: n(c.source), notes: n(c.notes),
    client_id: n(c.clientId), cree_le: c.creeLe, statut_crm: n(c.statutCrm), objectif_principal: n(c.objectifPrincipal),
    prochaine_action: n(c.prochaineAction), offre_vendue: n(c.offreVendue),
  }),
  questionnaires: (q: Questionnaire): Ligne => ({ id: q.id, contact_id: q.contactId, recu_le: q.recuLe, reponses: q.reponses, alertes: q.alertes }),
  boosters: (b: Booster): Ligne => ({
    id: b.id, contact_id: b.contactId, date: b.date, statut: b.statut, tests: n(b.tests), compte_rendu: n(b.compteRendu),
    priorites: b.priorites, paye: b.paye ?? false, evaluation: b.evaluation ?? null, entretien: b.entretien ?? null, plan_envoye_le: n(b.planEnvoyeLe),
    redaction: b.redaction ?? null, nom: n(b.nom), statut_crm: n(b.statutCrm), resume_ia: n(b.resumeIa), points_attention: n(b.pointsAttention),
    offre_recommandee: n(b.offreRecommandee), resultat_commercial: n(b.resultatCommercial), date_relance: n(b.dateRelance),
    notes_internes: n(b.notesInternes),
  }),
  relances: (r: Relance): Ligne => ({
    id: r.id, contact_id: r.contactId, echeance: r.echeance, modele: r.modele, note: n(r.note), faite_le: n(r.faiteLe), auto: r.auto ?? false,
    titre: n(r.titre), booster_id: n(r.boosterId), coaching_id: n(r.coachingId), responsable: n(r.responsable), priorite: n(r.priorite),
    statut_tache: n(r.statutTache),
  }),
  coachings: (x: Coaching): Ligne => ({
    id: x.id, contact_id: x.contactId, booster_id: n(x.boosterId), nom: x.nom, date_debut: n(x.dateDebut), date_fin_prevue: n(x.dateFinPrevue),
    statut: n(x.statut), formule: n(x.formule), objectif: n(x.objectif), commentaires: n(x.commentaires), cree_le: x.creeLe,
  }),
  paiements: (x: Paiement): Ligne => ({
    id: x.id, titre: x.titre, contact_id: n(x.contactId), coaching_id: n(x.coachingId), date: n(x.date), montant: n(x.montant), devise: x.devise,
    moyen: n(x.moyen), statut: n(x.statut), reference: n(x.reference), notes: n(x.notes), cree_le: x.creeLe,
  }),
  bilans: (x: BilanCoach): Ligne => ({
    id: x.id, contact_id: x.contactId, coaching_id: n(x.coachingId), date: x.date, poids: n(x.poids), taille: n(x.taille), tour_taille: n(x.tourTaille),
    tour_hanches: n(x.tourHanches), piliers: x.piliers, synthese: x.synthese, priorites: x.priorites, document_id: n(x.documentId), cree_le: x.creeLe,
    modifie_le: x.modifieLe,
  }),
};

const depuisLigne = {
  contacts: (l: any): Contact => ({
    id: l.id, prenom: l.prenom, nom: l.nom, telephone: u(l.telephone), email: u(l.email), dateNaissance: u(l.date_naissance),
    statut: l.statut, statutAvantArchive: u(l.statut_avant_archive), source: u(l.source), notes: u(l.notes),
    clientId: u(l.client_id), creeLe: l.cree_le, statutCrm: u(l.statut_crm), objectifPrincipal: u(l.objectif_principal),
    prochaineAction: u(l.prochaine_action), offreVendue: u(l.offre_vendue),
  }),
  questionnaires: (l: any): Questionnaire => ({ id: l.id, contactId: l.contact_id, recuLe: l.recu_le, reponses: l.reponses, alertes: l.alertes }),
  boosters: (l: any): Booster => ({
    id: l.id, contactId: l.contact_id, date: l.date, statut: l.statut, tests: u(l.tests), compteRendu: u(l.compte_rendu),
    priorites: l.priorites, paye: l.paye, evaluation: u(l.evaluation), entretien: u(l.entretien), planEnvoyeLe: u(l.plan_envoye_le),
    redaction: u(l.redaction), nom: u(l.nom), statutCrm: u(l.statut_crm), resumeIa: u(l.resume_ia), pointsAttention: u(l.points_attention),
    offreRecommandee: u(l.offre_recommandee), resultatCommercial: u(l.resultat_commercial), dateRelance: u(l.date_relance),
    notesInternes: u(l.notes_internes),
  }),
  relances: (l: any): Relance => ({
    id: l.id, contactId: l.contact_id, echeance: l.echeance, modele: l.modele, note: u(l.note), faiteLe: u(l.faite_le), auto: l.auto,
    titre: u(l.titre), boosterId: u(l.booster_id), coachingId: u(l.coaching_id), responsable: u(l.responsable), priorite: u(l.priorite),
    statutTache: u(l.statut_tache),
  }),
  coachings: (l: any): Coaching => ({
    id: l.id, contactId: l.contact_id, boosterId: u(l.booster_id), nom: l.nom, dateDebut: u(l.date_debut), dateFinPrevue: u(l.date_fin_prevue),
    statut: u(l.statut), formule: u(l.formule), objectif: u(l.objectif), commentaires: u(l.commentaires), creeLe: l.cree_le,
  }),
  paiements: (l: any): Paiement => ({
    id: l.id, titre: l.titre, contactId: u(l.contact_id), coachingId: u(l.coaching_id), date: u(l.date), montant: l.montant === null ? undefined : Number(l.montant),
    devise: l.devise, moyen: u(l.moyen), statut: u(l.statut), reference: u(l.reference), notes: u(l.notes), creeLe: l.cree_le,
  }),
  bilans: (l: any): BilanCoach => ({
    id: l.id, contactId: l.contact_id, coachingId: u(l.coaching_id), date: l.date, poids: num(l.poids), taille: num(l.taille), tourTaille: num(l.tour_taille),
    tourHanches: num(l.tour_hanches), piliers: l.piliers, synthese: l.synthese, priorites: l.priorites, documentId: u(l.document_id), creeLe: l.cree_le,
    modifieLe: l.modifie_le,
  }),
};

const TABLES = ['contacts', 'questionnaires', 'boosters', 'relances', 'coachings', 'paiements', 'bilans'] as const;
/** Nom de la table en base quand il diffère de la collection du carnet. */
const TABLE_BASE: Partial<Record<(typeof TABLES)[number], string>> = { bilans: 'bilans_coach' };
const base = (t: (typeof TABLES)[number]) => TABLE_BASE[t] ?? t;

export function creerCrmSupabase(db: SupabaseClient): DepotCrm {
  async function lire(): Promise<Carnet> {
    const resultats = await Promise.all(TABLES.map((t) => db.from(base(t)).select('*')));
    const erreur = resultats.find((r) => r.error)?.error;
    if (erreur) throw new Error(erreur.message);
    const [contacts, questionnaires, boosters, relances, coachings, paiements, bilans] = resultats.map((r) => r.data ?? []);
    return {
      contacts: contacts.map(depuisLigne.contacts),
      questionnaires: questionnaires.map(depuisLigne.questionnaires),
      boosters: boosters.map(depuisLigne.boosters),
      relances: relances.map(depuisLigne.relances),
      coachings: coachings.map(depuisLigne.coachings),
      paiements: paiements.map(depuisLigne.paiements),
      bilans: bilans.map(depuisLigne.bilans),
    };
  }

  /** Les règles renvoient les mêmes objets quand rien n'a changé : on n'envoie que les autres. */
  async function ecrire(avant: Carnet, apres: Carnet) {
    for (const t of TABLES) {
      // Seule une suppression explicite (Booster saisi par erreur) retire une ligne.
      const restants = new Set((apres[t] as { id: string }[]).map((x) => x.id));
      const retires = (avant[t] as { id: string }[]).filter((x) => !restants.has(x.id)).map((x) => x.id);
      if (retires.length) {
        const { data, error } = await db.from(base(t)).delete().in('id', retires).select('id');
        if (error) throw new Error(error.message);
        if ((data ?? []).length !== retires.length) throw new Error('Suppression non confirmée par le serveur.');
      }
      const anciens = new Set<unknown>(avant[t]);
      const changes = (apres[t] as { id: string }[]).filter((x) => !anciens.has(x));
      if (changes.length === 0) continue;
      const versBase = versLigne[t] as (x: unknown) => Ligne;
      const { error } = await db.from(base(t)).upsert(changes.map(versBase), { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }

  return creerDepot(lire, ecrire, {
    async soumettreQuestionnaire(lien, reponses) {
      const { error } = await db.rpc('soumettre_questionnaire', { lien, reponses });
      if (error) throw new Error(error.message);
    },
    async lienQuestionnaire() {
      const { data } = await db.from('coachs').select('lien_questionnaire').eq('id', (await db.rpc('mon_coach_id')).data).maybeSingle();
      return (data?.lien_questionnaire as string | null) ?? null;
    },
    async ouvrirEspaceClient(contact) {
      const coach = await db.rpc('mon_coach_id');
      const { data, error } = await db
        .from('clients')
        .insert({ coach_id: coach.data, prenom: contact.prenom, nom: contact.nom, email: n(contact.email), telephone: n(contact.telephone) })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      return data.id as string;
    },
    async actualiserEspaceClient(contact) {
      const { data, error } = await db
        .from('clients')
        .update({ prenom: contact.prenom, nom: contact.nom, email: n(contact.email), telephone: n(contact.telephone) })
        .eq('id', contact.clientId!)
        .select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Fiche client introuvable ou non modifiable.');
    },
  });
}

export const crm: DepotCrm = supabase ? creerCrmSupabase(supabase) : crmDemo;
