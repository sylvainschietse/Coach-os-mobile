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
}

export const HORAIRES_PAR_DEFAUT = 'Je réponds sous 24 h, du lundi au vendredi.';
export const MAX_HORAIRES = 200;

// Démo : le profil reste en mémoire le temps de la visite.
let demo: ProfilCoach = { nom: 'Sylvain', telephone: '33648640845', horairesReponse: HORAIRES_PAR_DEFAUT };

/** Ce qui empêche d'enregistrer, en clair. */
export function erreursProfilCoach(p: ProfilCoach): string[] {
  const erreurs: string[] = [];
  if (!p.nom.trim()) erreurs.push('Indique le prénom que tes clients verront.');
  if (p.telephone?.trim() && !normaliserTelephone(p.telephone)) erreurs.push('Numéro illisible : écris-le comme 06 12 34 56 78.');
  if ((p.horairesReponse ?? '').trim().length > MAX_HORAIRES) erreurs.push(`Horaires de réponse : ${MAX_HORAIRES} caractères au plus.`);
  return erreurs;
}

export const profilCoach = {
  async lire(): Promise<ProfilCoach> {
    if (!supabase) return demo;
    const { data, error } = await supabase
      .from('coachs')
      .select('nom, telephone, photo, horaires_reponse')
      .eq('id', (await supabase.rpc('mon_coach_id')).data)
      .single();
    if (error || !data) throw new Error('Impossible de charger ton profil pour le moment.');
    return { nom: data.nom, telephone: data.telephone ?? undefined, photo: data.photo ?? undefined, horairesReponse: data.horaires_reponse ?? undefined };
  },

  async enregistrer(p: ProfilCoach): Promise<void> {
    const erreurs = erreursProfilCoach(p);
    if (erreurs.length) throw new Error(erreurs.join('\n'));
    const ligne = {
      nom: p.nom.trim(),
      telephone: normaliserTelephone(p.telephone) ?? null,
      photo: p.photo ?? null,
      horaires_reponse: p.horairesReponse?.trim() || null,
    };
    if (!supabase) {
      demo = { nom: ligne.nom, telephone: ligne.telephone ?? undefined, photo: ligne.photo ?? undefined, horairesReponse: ligne.horaires_reponse ?? undefined };
      return;
    }
    const { error } = await supabase
      .from('coachs')
      .update(ligne)
      .eq('id', (await supabase.rpc('mon_coach_id')).data);
    if (error) throw new Error('Profil non enregistré, réessaie dans un instant.');
  },
};
