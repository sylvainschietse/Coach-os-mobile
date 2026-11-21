// Profil du coach : prénom affiché aux clients, numéro WhatsApp, photo et horaires de réponse aux messages. Le coach les modifie depuis « Mon profil ».
import { normaliserTelephone } from '@/domain/crm';

import { supabase } from './supabase';

export interface ProfilCoach {
  nom: string;
  telephone?: string;
  /** Image JPEG en data URL, environ 400 px. */
  photo?: string;
  /** Affiché en haut de la messagerie du client. */
  horairesReponse?: string;
  /** Page d'offre partagée : sous le nom du coach (« Préparation physique, Lyon »). */
  specialite?: string;
  /** Page d'offre partagée : un avis client, et qui l'a écrit (« Julie, cliente depuis 1 an »). */
  avisClient?: string;
  avisAuteur?: string;
}

export const HORAIRES_PAR_DEFAUT = 'Je réponds sous 24 h, du lundi au vendredi.';
export const MAX_HORAIRES = 200;
export const MAX_SPECIALITE = 120;
export const MAX_AVIS = 400;
export const MAX_AVIS_AUTEUR = 80;

// Démo : le profil reste en mémoire le temps de la visite.
let demo: ProfilCoach = { nom: 'Sylvain', telephone: '33648640845', horairesReponse: HORAIRES_PAR_DEFAUT };

/** Ce qui empêche d'enregistrer, en clair. */
export function erreursProfilCoach(p: ProfilCoach): string[] {
  const erreurs: string[] = [];
  if (!p.nom.trim()) erreurs.push('Indique le prénom que tes clients verront.');
  if (p.telephone?.trim() && !normaliserTelephone(p.telephone)) erreurs.push('Numéro illisible : écris-le comme 06 12 34 56 78.');
  if ((p.horairesReponse ?? '').trim().length > MAX_HORAIRES) erreurs.push(`Horaires de réponse : ${MAX_HORAIRES} caractères au plus.`);
  if ((p.specialite ?? '').trim().length > MAX_SPECIALITE) erreurs.push(`Spécialité : ${MAX_SPECIALITE} caractères au plus.`);
  if ((p.avisClient ?? '').trim().length > MAX_AVIS) erreurs.push(`Avis client : ${MAX_AVIS} caractères au plus.`);
  if ((p.avisAuteur ?? '').trim().length > MAX_AVIS_AUTEUR) erreurs.push(`Auteur de l’avis : ${MAX_AVIS_AUTEUR} caractères au plus.`);
  return erreurs;
}

export const profilCoach = {
  async lire(): Promise<ProfilCoach> {
    if (!supabase) return demo;
    const { data, error } = await supabase
      .from('coachs')
      .select('nom, telephone, photo, horaires_reponse, specialite, avis_client, avis_auteur')
      .eq('id', (await supabase.rpc('mon_coach_id')).data)
      .single();
    if (error || !data) throw new Error('Impossible de charger ton profil pour le moment.');
    return {
      nom: data.nom,
      telephone: data.telephone ?? undefined,
      photo: data.photo ?? undefined,
      horairesReponse: data.horaires_reponse ?? undefined,
      specialite: data.specialite ?? undefined,
      avisClient: data.avis_client ?? undefined,
      avisAuteur: data.avis_auteur ?? undefined,
    };
  },

  async enregistrer(p: ProfilCoach): Promise<void> {
    const erreurs = erreursProfilCoach(p);
    if (erreurs.length) throw new Error(erreurs.join('\n'));
    const ligne = {
      nom: p.nom.trim(),
      telephone: normaliserTelephone(p.telephone) ?? null,
      photo: p.photo ?? null,
      horaires_reponse: p.horairesReponse?.trim() || null,
      specialite: p.specialite?.trim() || null,
      avis_client: p.avisClient?.trim() || null,
      avis_auteur: p.avisAuteur?.trim() || null,
    };
    if (!supabase) {
      demo = {
        nom: ligne.nom,
        telephone: ligne.telephone ?? undefined,
        photo: ligne.photo ?? undefined,
        horairesReponse: ligne.horaires_reponse ?? undefined,
        specialite: ligne.specialite ?? undefined,
        avisClient: ligne.avis_client ?? undefined,
        avisAuteur: ligne.avis_auteur ?? undefined,
      };
      return;
    }
    const { error } = await supabase
      .from('coachs')
      .update(ligne)
      .eq('id', (await supabase.rpc('mon_coach_id')).data);
    if (error) throw new Error('Profil non enregistré, réessaie dans un instant.');
  },
};
