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

/** Adresse avec laquelle le client se connecte, quand elle diffère de l'e-mail de sa fiche (ex. un enfant). */
export async function lireEmailConnexion(clientId: string): Promise<string | undefined> {
  if (!supabase) return undefined;
  const { data } = await supabase.from('clients').select('email_connexion').eq('id', clientId).maybeSingle();
  return (data?.email_connexion as string | null) ?? undefined;
}

/**
 * Crée le compte du client, ou lui donne un nouveau mot de passe provisoire s'il en a déjà un.
 * `emailConnexion` : adresse de connexion à part (vide = l'e-mail de sa fiche) ; non fourni = on garde le choix déjà fait.
 */
export async function creerAccesClient(contactId: string, email: string, emailConnexion?: string): Promise<AccesClient> {
  if (!supabase) return { email: emailConnexion?.trim() || email, motDePasse: 'demo-1234' };
  const { data, error } = await supabase.functions.invoke('acces-client', {
    body: emailConnexion === undefined ? { contactId } : { contactId, emailConnexion },
  });
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
  /** Vrai quand le client se connecte avec une adresse à part : téléphone et adresse sont ceux du parent. */
  connexionSeparee?: boolean;
}

/** Coordonnées du dossier, telles que le coach les a saisies. En démo, rien n'est enregistré. */
export async function mesInfos(clientId: string): Promise<MesInfos> {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('clients')
    .select('prenom, nom, email, email_connexion, telephone, adresse')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error('Impossible de lire tes informations. Vérifie ta connexion.');
  // Adresse de connexion à part (ex. un enfant) : il voit l'adresse avec laquelle il se connecte, pas celle du parent.
  if (data?.email_connexion)
    return { prenom: data.prenom ?? undefined, nom: data.nom ?? undefined, email: data.email_connexion, connexionSeparee: true };
  return { prenom: data?.prenom ?? undefined, nom: data?.nom ?? undefined, email: data?.email ?? undefined, telephone: data?.telephone ?? undefined, adresse: data?.adresse ?? undefined };
}

/**
 * Le client corrige son téléphone et son adresse postale, et demande à changer son e-mail (son identifiant de connexion).
 * Sécurité : le nouvel e-mail ne remplace l'ancien qu'après un clic sur le lien de confirmation envoyé par Supabase ;
 * sa fiche suit alors toute seule. `emailEnAttente` dit à quelle adresse le lien est parti.
 */
export async function modifierMesCoordonnees(
  saisie: { email: string; telephone: string; adresse: string },
  emailActuel?: string,
): Promise<MesInfos & { emailEnAttente?: string }> {
  if (!supabase) return saisie;
  const { data, error } = await supabase.functions.invoke('mes-coordonnees', { body: { telephone: saisie.telephone, adresse: saisie.adresse } });
  if (error) {
    const corps = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(corps?.erreur ?? 'Impossible d’enregistrer tes coordonnées pour le moment.');
  }
  const resultat = { email: emailActuel, telephone: data?.telephone ?? undefined, adresse: data?.adresse ?? undefined };
  const email = saisie.email.trim().toLowerCase();
  const { data: moi } = await supabase.auth.getUser();
  const connu = [moi.user?.email, emailActuel].filter(Boolean).map((e) => e!.toLowerCase());
  if (!email || connu.includes(email)) return resultat;
  const { error: changement } = await supabase.auth.updateUser({ email }, { emailRedirectTo: Linking.createURL('auth') });
  if (changement) {
    const pris = /already|exists|registered/i.test(changement.message ?? '');
    throw new Error(
      pris
        ? 'Ton téléphone et ton adresse sont enregistrés. Un autre compte utilise déjà cet e-mail.'
        : 'Ton téléphone et ton adresse sont enregistrés, mais l’e-mail n’a pas pu être changé. Réessaie plus tard.',
    );
  }
  return { ...resultat, emailEnAttente: email };
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
