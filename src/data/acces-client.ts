import * as Linking from 'expo-linking';

import type { AccesClient } from '@/domain/acces-client';

import { profilCoach } from './profil-coach';
import { supabase } from './supabase';

/** Le client a-t-il déjà un compte pour se connecter ? */
export async function aUnAcces(clientId: string): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase.from('clients').select('user_id').eq('id', clientId).maybeSingle();
  return !!data?.user_id;
}

/** Crée le compte du client, ou lui donne un nouveau mot de passe provisoire s'il en a déjà un. */
export async function creerAccesClient(contactId: string, email: string): Promise<AccesClient> {
  if (!supabase) return { email, motDePasse: 'demo-1234' };
  const { data, error } = await supabase.functions.invoke('acces-client', { body: { contactId } });
  if (error) {
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corps?.erreur ?? 'Impossible de créer son accès pour le moment.');
  }
  return data as AccesClient;
}

/** Le client supprime lui-même son compte et tout son suivi. */
export async function supprimerMonCompte(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.functions.invoke('supprimer-compte', { body: {} });
  if (error) {
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corps?.erreur ?? 'Impossible de supprimer ton compte pour le moment.');
  }
}

export interface MesInfos {
  prenom?: string;
  nom?: string;
  email?: string;
  telephone?: string;
  adresse?: string;
  /** Nouvel e-mail demandé, pas encore confirmé : il remplacera l'actuel quand le client ouvrira le lien reçu. */
  emailEnAttente?: string;
}

/** Coordonnées du dossier, telles que le coach les a saisies. En démo, rien n'est enregistré. */
export async function mesInfos(clientId: string): Promise<MesInfos> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('clients').select('prenom, nom, email, telephone, adresse').eq('id', clientId).maybeSingle();
  if (error) throw new Error('Impossible de lire tes informations. Vérifie ta connexion.');
  return { prenom: data?.prenom ?? undefined, nom: data?.nom ?? undefined, email: data?.email ?? undefined, telephone: data?.telephone ?? undefined, adresse: data?.adresse ?? undefined };
}

/**
 * Le client corrige son téléphone et son adresse postale tout de suite. Son e-mail est aussi son identifiant de
 * connexion : un nouvel e-mail ne remplace l'actuel qu'après confirmation par le lien envoyé à la nouvelle adresse.
 */
export async function modifierMesCoordonnees(saisie: { email: string; telephone: string; adresse: string }): Promise<MesInfos> {
  if (!supabase) return saisie;
  const { data: session } = await supabase.auth.getSession();
  const actuel = (session.session?.user.email ?? '').toLowerCase();
  const voulu = saisie.email.trim().toLowerCase();
  let emailEnAttente: string | undefined;
  // Le changement d'e-mail d'abord : s'il est refusé (adresse déjà prise), rien d'autre ne change.
  if (voulu && voulu !== actuel) {
    const { error } = await supabase.auth.updateUser({ email: voulu }, { emailRedirectTo: Linking.createURL('auth') });
    if (error) {
      const prise = /already|exists|registered/i.test(error.message ?? '');
      throw new Error(prise ? 'Un autre compte utilise déjà cet e-mail.' : 'Impossible de changer ton e-mail pour le moment.');
    }
    emailEnAttente = voulu;
  }
  const { data, error } = await supabase.functions.invoke('mes-coordonnees', { body: saisie });
  if (error) {
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corps?.erreur ?? 'Impossible d’enregistrer tes coordonnées pour le moment.');
  }
  return { email: data?.email ?? (actuel || undefined), telephone: data?.telephone ?? undefined, adresse: data?.adresse ?? undefined, emailEnAttente };
}

export interface MonCoach {
  nom: string;
  telephone?: string;
  photo?: string;
  /** « Je réponds sous 24 h, du lundi au vendredi » : affiché en haut de la messagerie. */
  horairesReponse?: string;
}

/** Prénom, numéro et photo du coach, pour lui écrire depuis l'espace client. En démo, le profil saisi dans « Mon profil ». */
export async function monCoach(): Promise<MonCoach | null> {
  if (!supabase) return profilCoach.lire();
  const [{ data, error }, horaires] = await Promise.all([supabase.rpc('mon_coach'), supabase.rpc('horaires_de_mon_coach')]);
  if (error) throw new Error('Impossible de joindre ton coach pour le moment.');
  const ligne = (data as { nom: string; telephone: string | null; photo: string | null }[] | null)?.[0];
  return ligne
    ? { nom: ligne.nom, telephone: ligne.telephone ?? undefined, photo: ligne.photo ?? undefined, horairesReponse: (horaires.data as string | null) ?? undefined }
    : null;
}
