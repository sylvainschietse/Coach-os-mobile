import type { AccesClient } from '@/domain/acces-client';

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
}

/** Coordonnées du dossier, telles que le coach les a saisies. En démo, rien n'est enregistré. */
export async function mesInfos(clientId: string): Promise<MesInfos> {
  if (!supabase) return {};
  const { data, error } = await supabase.from('clients').select('prenom, nom, email, telephone').eq('id', clientId).maybeSingle();
  if (error) throw new Error('Impossible de lire tes informations. Vérifie ta connexion.');
  return { prenom: data?.prenom ?? undefined, nom: data?.nom ?? undefined, email: data?.email ?? undefined, telephone: data?.telephone ?? undefined };
}

export interface MonCoach {
  nom: string;
  telephone?: string;
}

/** Prénom et numéro du coach, pour lui écrire depuis l'espace client. En démo, Sylvain sans numéro. */
export async function monCoach(): Promise<MonCoach | null> {
  if (!supabase) return { nom: 'Sylvain' };
  const { data, error } = await supabase.rpc('mon_coach');
  if (error) throw new Error('Impossible de joindre ton coach pour le moment.');
  const ligne = (data as { nom: string; telephone: string | null }[] | null)?.[0];
  return ligne ? { nom: ligne.nom, telephone: ligne.telephone ?? undefined } : null;
}
