import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

import * as regles from '@/domain/crm';
import type { Booster, Carnet, Contact, ContactResume, Doublon, FicheContact, ModeleMessage, Questionnaire, Relance, RelanceAFaire } from '@/domain/crm';
import { nouvelId } from '@/lib/identifiant';

import { carnetDemo } from './crm-demo';
import { supabase } from './supabase';

export type BoosterAVenir = Booster & { contact: Contact };
export type SaisieContact = { prenom: string; nom?: string; telephone?: string; email?: string; source?: string };
export type CompteRendu = { tests?: string; compteRendu?: string; priorites: string[]; paye?: boolean };

/** L'accueil des clients côté coach, quelle que soit la source (démo locale ou Supabase). */
export interface DepotCrm {
  contacts(): Promise<ContactResume[]>;
  fiche(id: string): Promise<FicheContact>;
  journee(): Promise<{ relances: RelanceAFaire[]; boosters: BoosterAVenir[] }>;
  creerContact(saisie: SaisieContact): Promise<{ contact: Contact } | { doublon: Doublon }>;
  modifierContact(id: string, patch: Parameters<typeof regles.modifierContact>[2]): Promise<void>;
  planifierBooster(contactId: string, date: string): Promise<void>;
  terminerBooster(boosterId: string, compteRendu: CompteRendu): Promise<void>;
  annulerBooster(boosterId: string): Promise<void>;
  ajouterRelance(contactId: string, echeance: string, modele: ModeleMessage, note?: string): Promise<void>;
  terminerRelance(id: string): Promise<void>;
  reporterRelance(id: string, echeance: string): Promise<void>;
  /** Ouvre l'espace client (programmes, séances) et clôt les relances commerciales. */
  devenirClient(contactId: string): Promise<void>;
  archiver(contactId: string): Promise<void>;
  reactiver(contactId: string): Promise<void>;
  /** Appelé par le questionnaire public, sans compte. */
  soumettreQuestionnaire(lien: string, reponses: Record<string, string>): Promise<void>;
  /** Identifiant public du questionnaire du coach connecté (/questionnaire/<lien>). */
  lienQuestionnaire(): Promise<string | null>;
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
}): DepotCrm {
  async function ecrire(avant: Carnet, apres: Carnet) {
    await ecrireBrut(avant, apres);
    prevenir();
  }

  async function appliquer(regle: (c: Carnet, ctx: regles.Contexte) => Carnet) {
    const avant = await lire();
    await ecrire(avant, regle(avant, contexte()));
  }

  return {
    async contacts() {
      return regles.listeContacts(await lire());
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
    archiver: (id) => appliquer((c, ctx) => regles.archiver(c, id, ctx)),
    reactiver: (id) => appliquer((c) => regles.reactiver(c, id)),
    async soumettreQuestionnaire(lien, reponses) {
      await extra.soumettreQuestionnaire(lien, reponses);
      prevenir();
    },
    lienQuestionnaire: extra.lienQuestionnaire,
  };
}

// ---------- Démo : tout reste dans ce téléphone ou ce navigateur ----------

const CLE_CARNET = 'coachos.demo.crm';
export const CLE_CLIENTS_DEMO = 'coachos.demo.clients-ajoutes';

async function lireDemo(): Promise<Carnet> {
  try {
    const brut = await AsyncStorage.getItem(CLE_CARNET);
    if (brut) return JSON.parse(brut) as Carnet;
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
});

export async function effacerCrmDemo() {
  await Promise.all([CLE_CARNET, CLE_CLIENTS_DEMO].map((c) => AsyncStorage.removeItem(c)));
}

// ---------- Supabase ----------

const n = <T>(v: T | undefined) => (v === undefined ? null : v);
const u = <T>(v: T | null) => (v === null ? undefined : v);

type Ligne = Record<string, unknown>;

const versLigne = {
  contacts: (c: Contact): Ligne => ({
    id: c.id, prenom: c.prenom, nom: c.nom, telephone: n(c.telephone), email: n(c.email), date_naissance: n(c.dateNaissance),
    statut: c.statut, statut_avant_archive: n(c.statutAvantArchive), source: n(c.source), notes: n(c.notes),
    client_id: n(c.clientId), cree_le: c.creeLe,
  }),
  questionnaires: (q: Questionnaire): Ligne => ({ id: q.id, contact_id: q.contactId, recu_le: q.recuLe, reponses: q.reponses, alertes: q.alertes }),
  boosters: (b: Booster): Ligne => ({
    id: b.id, contact_id: b.contactId, date: b.date, statut: b.statut, tests: n(b.tests), compte_rendu: n(b.compteRendu),
    priorites: b.priorites, paye: b.paye ?? false,
  }),
  relances: (r: Relance): Ligne => ({
    id: r.id, contact_id: r.contactId, echeance: r.echeance, modele: r.modele, note: n(r.note), faite_le: n(r.faiteLe), auto: r.auto ?? false,
  }),
};

const depuisLigne = {
  contacts: (l: any): Contact => ({
    id: l.id, prenom: l.prenom, nom: l.nom, telephone: u(l.telephone), email: u(l.email), dateNaissance: u(l.date_naissance),
    statut: l.statut, statutAvantArchive: u(l.statut_avant_archive), source: u(l.source), notes: u(l.notes),
    clientId: u(l.client_id), creeLe: l.cree_le,
  }),
  questionnaires: (l: any): Questionnaire => ({ id: l.id, contactId: l.contact_id, recuLe: l.recu_le, reponses: l.reponses, alertes: l.alertes }),
  boosters: (l: any): Booster => ({
    id: l.id, contactId: l.contact_id, date: l.date, statut: l.statut, tests: u(l.tests), compteRendu: u(l.compte_rendu),
    priorites: l.priorites, paye: l.paye,
  }),
  relances: (l: any): Relance => ({
    id: l.id, contactId: l.contact_id, echeance: l.echeance, modele: l.modele, note: u(l.note), faiteLe: u(l.faite_le), auto: l.auto,
  }),
};

const TABLES = ['contacts', 'questionnaires', 'boosters', 'relances'] as const;

export function creerCrmSupabase(db: SupabaseClient): DepotCrm {
  async function lire(): Promise<Carnet> {
    const resultats = await Promise.all(TABLES.map((t) => db.from(t).select('*')));
    const erreur = resultats.find((r) => r.error)?.error;
    if (erreur) throw new Error(erreur.message);
    const [contacts, questionnaires, boosters, relances] = resultats.map((r) => r.data ?? []);
    return {
      contacts: contacts.map(depuisLigne.contacts),
      questionnaires: questionnaires.map(depuisLigne.questionnaires),
      boosters: boosters.map(depuisLigne.boosters),
      relances: relances.map(depuisLigne.relances),
    };
  }

  /** Les règles renvoient les mêmes objets quand rien n'a changé : on n'envoie que les autres. */
  async function ecrire(avant: Carnet, apres: Carnet) {
    for (const t of TABLES) {
      const anciens = new Set<unknown>(avant[t]);
      const changes = (apres[t] as (Contact & Questionnaire & Booster & Relance)[]).filter((x) => !anciens.has(x));
      if (changes.length === 0) continue;
      const { error } = await db.from(t).upsert(changes.map((x) => versLigne[t](x)), { onConflict: 'id' });
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
  });
}

export const crm: DepotCrm = supabase ? creerCrmSupabase(supabase) : crmDemo;
