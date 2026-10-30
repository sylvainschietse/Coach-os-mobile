import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decode, encode } from 'base64-arraybuffer';

import * as regles from '@/domain/documents';
import type { Document, DocumentClient, FichierChoisi, SaisieDocument } from '@/domain/documents';
import { nouvelId } from '@/lib/identifiant';

import { crmDemo } from './crm';
import { supabase } from './supabase';

/** Fichier choisi, avec son contenu : Blob sur le web, octets lus sur le téléphone. */
export type Fichier = FichierChoisi & { donnees: Blob | ArrayBuffer };

export interface DepotDocuments {
  /** Rubrique Documents du coach. */
  documents(): Promise<Document[]>;
  creer(saisie: SaisieDocument, fichier?: Fichier): Promise<Document>;
  modifier(id: string, saisie: SaisieDocument): Promise<void>;
  /** Dépose un nouveau fichier : il devient la version servie partout. */
  deposer(id: string, fichier: Fichier): Promise<Document>;
  /** Compte rendu d'un Booster : un seul document par Booster, chaque PDF en est une nouvelle version. */
  deposerCompteRendu(boosterId: string, contact: { id: string; prenom: string; nom: string }, fichier: Fichier): Promise<Document>;
  partager(id: string, partage: boolean): Promise<void>;
  /** Appelé seulement quand l'envoi est confirmé (statut « envoyé » rendu par le téléphone). */
  marquerEnvoye(id: string, version: number): Promise<void>;
  supprimer(id: string): Promise<void>;
  /** Lien de courte durée vers le fichier (coach : ses fichiers ; client : ceux partagés avec lui). */
  lien(chemin: string): Promise<string>;
  /** U11 Mes documents du client connecté. */
  mesDocuments(clientId: string): Promise<DocumentClient[]>;
}

const abonnes = new Set<() => void>();
export function ecouterDocuments(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
const prevenir = () => abonnes.forEach((fn) => fn());

async function octets(d: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return d instanceof ArrayBuffer ? d : await d.arrayBuffer();
}

function controler(f: Fichier, max?: number) {
  const refus = regles.verifierFichier(f, max);
  if (refus) throw new Error(refus);
}

// ---------- Démo : métadonnées et fichiers restent dans ce navigateur ou ce téléphone ----------

const CLE_DOCS = 'coachos.demo.documents';
const cleFichier = (chemin: string) => `coachos.demo.fichier.${chemin}`;
/** Le stockage du navigateur est limité : la démo refuse au-delà, Supabase accepte 10 Mo. */
const MAX_DEMO = 2 * 1024 * 1024;

async function lireDemo(): Promise<Document[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(CLE_DOCS)) ?? '[]') as Document[];
  } catch {
    return [];
  }
}
const ecrireDemo = (docs: Document[]) => AsyncStorage.setItem(CLE_DOCS, JSON.stringify(docs));

async function remplacerDemo(id: string, maj: (d: Document) => Document) {
  const docs = await lireDemo();
  const d = docs.find((x) => x.id === id);
  if (!d) throw new Error('Document introuvable');
  const suivant = maj(d);
  await ecrireDemo(docs.map((x) => (x.id === id ? suivant : x)));
  prevenir();
  return suivant;
}

async function deposerDemo(d: Document, f: Fichier) {
  controler(f, MAX_DEMO);
  const chemin = regles.cheminFichier('demo', d.id, regles.versionSuivante(d), f.nom);
  try {
    await AsyncStorage.setItem(cleFichier(chemin), `data:${f.type};base64,${encode(await octets(f.donnees))}`);
  } catch {
    throw new Error('Le stockage de ce navigateur est plein : supprimez un document de démonstration.');
  }
  return remplacerDemo(d.id, (x) => regles.deposerVersion(x, chemin, f, new Date()));
}

export const documentsDemo: DepotDocuments = {
  documents: lireDemo,
  async creer(saisie, fichier) {
    if (fichier) controler(fichier, MAX_DEMO);
    const d = regles.nouveauDocument(nouvelId(), saisie, new Date());
    await ecrireDemo([...(await lireDemo()), d]);
    prevenir();
    return fichier ? deposerDemo(d, fichier) : d;
  },
  async modifier(id, saisie) {
    await remplacerDemo(id, (d) => regles.modifierDocument(d, saisie, new Date()));
  },
  async deposer(id, fichier) {
    const d = (await lireDemo()).find((x) => x.id === id);
    if (!d) throw new Error('Document introuvable');
    return deposerDemo(d, fichier);
  },
  async deposerCompteRendu(boosterId, contact, fichier) {
    const existant = (await lireDemo()).find((x) => x.boosterId === boosterId);
    if (existant) return deposerDemo(existant, fichier);
    return documentsDemo.creer({ nom: regles.nomCompteRendu(contact), contactId: contact.id, boosterId, type: 'Bilan' }, fichier);
  },
  async partager(id, partage) {
    await remplacerDemo(id, (d) => {
      if (partage && !d.chemin) throw new Error('Déposez d’abord un fichier.');
      return { ...d, partageClient: partage, modifieLe: new Date().toISOString() };
    });
  },
  async marquerEnvoye(id, version) {
    await remplacerDemo(id, (d) => (d.version === version ? { ...d, envoye: true } : d));
  },
  async supprimer(id) {
    const docs = await lireDemo();
    if (!docs.some((d) => d.id === id)) throw new Error('Document introuvable');
    await ecrireDemo(docs.filter((d) => d.id !== id));
    prevenir();
  },
  async lien(chemin) {
    const donnees = await AsyncStorage.getItem(cleFichier(chemin));
    if (!donnees) throw new Error('Fichier introuvable dans ce navigateur.');
    return donnees;
  },
  async mesDocuments(clientId) {
    const contacts = (await crmDemo.contacts()).filter((c) => c.clientId === clientId).map((c) => c.id);
    return regles.documentsPartages(await lireDemo(), contacts);
  },
};

export async function effacerDocumentsDemo() {
  const cles = (await AsyncStorage.getAllKeys()).filter((c) => c === CLE_DOCS || c.startsWith('coachos.demo.fichier.'));
  await AsyncStorage.multiRemove(cles);
}

// ---------- Supabase : table documents (RLS) et compartiment privé « documents » ----------

const n = <T>(v: T | undefined) => (v === undefined ? null : v);
const u = <T>(v: T | null) => (v === null ? undefined : v);

const depuisLigne = (l: any): Document => ({
  id: l.id, contactId: u(l.contact_id), boosterId: u(l.booster_id), coachingId: u(l.coaching_id), nom: l.nom, type: l.type, date: l.date, version: l.version,
  chemin: u(l.chemin), nomFichier: u(l.nom_fichier), typeFichier: u(l.type_fichier), taille: u(l.taille), partageClient: l.partage_client,
  envoye: l.envoye, commentaires: u(l.commentaires), creeLe: l.cree_le, modifieLe: l.modifie_le,
});

const versLigne = (d: Document) => ({
  id: d.id, contact_id: n(d.contactId), booster_id: n(d.boosterId), coaching_id: n(d.coachingId), nom: d.nom, type: d.type, date: d.date, version: d.version,
  chemin: n(d.chemin), nom_fichier: n(d.nomFichier), type_fichier: n(d.typeFichier), taille: n(d.taille), partage_client: d.partageClient,
  envoye: d.envoye, commentaires: n(d.commentaires), modifie_le: d.modifieLe,
});

export function creerDocumentsSupabase(db: SupabaseClient): DepotDocuments {
  async function un(id: string) {
    const { data, error } = await db.from('documents').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Document introuvable');
    return depuisLigne(data);
  }

  /** Mise à jour confirmée : si personne n'a touché la ligne entre-temps, le serveur renvoie la ligne. */
  async function remplacer(avant: Document, apres: Document) {
    const { data, error } = await db.from('documents').update(versLigne(apres)).eq('id', avant.id).eq('modifie_le', avant.modifieLe).select('*');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Ce document a changé entre-temps : rechargez la page puis recommencez.');
    prevenir();
    return depuisLigne(data[0]);
  }

  async function deposer(d: Document, f: Fichier) {
    controler(f);
    const coach = await db.rpc('mon_coach_id');
    if (coach.error || !coach.data) throw new Error('Session coach introuvable : reconnectez-vous.');
    const chemin = regles.cheminFichier(coach.data as string, d.id, regles.versionSuivante(d), f.nom);
    const envoi = await db.storage.from('documents').upload(chemin, await octets(f.donnees), { contentType: f.type, upsert: false });
    if (envoi.error) throw new Error(`Fichier non enregistré : ${envoi.error.message}`);
    return remplacer(d, regles.deposerVersion(d, chemin, f, new Date()));
  }

  async function creer(saisie: SaisieDocument, fichier?: Fichier) {
    if (fichier) controler(fichier);
    const d = regles.nouveauDocument(nouvelId(), saisie, new Date());
    const { error } = await db.from('documents').insert({ ...versLigne(d), cree_le: d.creeLe });
    if (error) throw new Error(error.message);
    prevenir();
    return fichier ? deposer(await un(d.id), fichier) : un(d.id);
  }

  return {
    async documents() {
      const { data, error } = await db.from('documents').select('*');
      if (error) throw new Error(error.message);
      return (data ?? []).map(depuisLigne);
    },
    creer,
    async modifier(id, saisie) {
      const d = await un(id);
      await remplacer(d, regles.modifierDocument(d, saisie, new Date()));
    },
    deposer: async (id, fichier) => deposer(await un(id), fichier),
    async deposerCompteRendu(boosterId, contact, fichier) {
      const { data, error } = await db.from('documents').select('*').eq('booster_id', boosterId).maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return deposer(depuisLigne(data), fichier);
      return creer({ nom: regles.nomCompteRendu(contact), contactId: contact.id, boosterId, type: 'Bilan' }, fichier);
    },
    async partager(id, partage) {
      const d = await un(id);
      if (partage && !d.chemin) throw new Error('Déposez d’abord un fichier.');
      await remplacer(d, { ...d, partageClient: partage, modifieLe: new Date().toISOString() });
    },
    async marquerEnvoye(id, version) {
      const { error } = await db.from('documents').update({ envoye: true }).eq('id', id).eq('version', version);
      if (error) throw new Error(error.message);
      prevenir();
    },
    async supprimer(id) {
      const { data, error } = await db.from('documents').delete().eq('id', id).select('id');
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error('Suppression non confirmée par le serveur.');
      prevenir();
    },
    async lien(chemin) {
      const { data, error } = await db.storage.from('documents').createSignedUrl(chemin, 300);
      if (error || !data) throw new Error('Ce fichier n’est pas accessible avec ce compte.');
      return data.signedUrl;
    },
    async mesDocuments() {
      const { data, error } = await db.rpc('documents_partages_avec_moi');
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((l) => ({
        id: l.id, nom: l.nom, type: l.type, date: l.date, version: l.version, chemin: u(l.chemin), nomFichier: u(l.nom_fichier),
        typeFichier: u(l.type_fichier), taille: u(l.taille),
      }));
    },
  };
}

export const documents: DepotDocuments = supabase ? creerDocumentsSupabase(supabase) : documentsDemo;

/** Base64 (PDF du téléphone) → contenu déposable. */
export const depuisBase64 = (b64: string) => decode(b64);
