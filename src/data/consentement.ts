import AsyncStorage from '@react-native-async-storage/async-storage';

import { VERSION_POLITIQUE, type Consentement } from '@/domain/consentement';

import { supabase } from './supabase';

export interface DepotConsentement {
  /** Dernier choix du client connecté, null s'il n'a encore rien accepté. */
  lire(clientId: string): Promise<Consentement | null>;
  /** Accord sur les données de santé (obligatoire) et choix sur l'analyse des photos de repas par l'IA. */
  accepter(clientId: string, analyseIa: boolean): Promise<Consentement>;
}

type Ligne = { version: string | null; donnees_sante: boolean | null; analyse_ia: boolean | null; accepte_le: string | null };

function lireLigne(l: Ligne | null): Consentement | null {
  // Sans ligne, la fonction SQL renvoie un enregistrement vide (tous les champs à null).
  if (!l?.version || !l.accepte_le) return null;
  return { version: l.version, donneesSante: !!l.donnees_sante, analyseIa: !!l.analyse_ia, accepteLe: l.accepte_le };
}

const cle = (clientId: string) => `coachos.demo.consentement.${clientId}`;

const demo: DepotConsentement = {
  async lire(clientId) {
    const brut = await AsyncStorage.getItem(cle(clientId));
    return brut ? (JSON.parse(brut) as Consentement) : null;
  },
  async accepter(clientId, analyseIa) {
    const c: Consentement = { version: VERSION_POLITIQUE, donneesSante: true, analyseIa, accepteLe: new Date().toISOString() };
    await AsyncStorage.setItem(cle(clientId), JSON.stringify(c));
    return c;
  },
};

const enLigne = (db: NonNullable<typeof supabase>): DepotConsentement => ({
  async lire() {
    const { data, error } = await db.rpc('mon_consentement');
    if (error) throw new Error('Impossible de lire ton accord. Vérifie ta connexion.');
    return lireLigne(data as Ligne | null);
  },
  async accepter(_clientId, analyseIa) {
    const { data, error } = await db.rpc('enregistrer_consentement', { p_version: VERSION_POLITIQUE, p_analyse_ia: analyseIa });
    const c = lireLigne(data as Ligne | null);
    if (error || !c) throw new Error('Ton accord n’a pas pu être enregistré. Réessaie.');
    return c;
  },
});

export const consentements: DepotConsentement = supabase ? enLigne(supabase) : demo;
