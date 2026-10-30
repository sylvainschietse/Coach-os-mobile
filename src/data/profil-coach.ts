// Profil du coach : prénom affiché aux clients, numéro WhatsApp et photo. Le coach les modifie depuis « Mon profil ».
import { normaliserTelephone } from '@/domain/crm';

import { supabase } from './supabase';

export interface ProfilCoach {
  nom: string;
  telephone?: string;
  /** Image JPEG en data URL, environ 400 px. */
  photo?: string;
}

// Démo : le profil reste en mémoire le temps de la visite.
let demo: ProfilCoach = { nom: 'Sylvain', telephone: '33648640845' };

/** Ce qui empêche d'enregistrer, en clair. */
export function erreursProfilCoach(p: ProfilCoach): string[] {
  const erreurs: string[] = [];
  if (!p.nom.trim()) erreurs.push('Indique le prénom que tes clients verront.');
  if (p.telephone?.trim() && !normaliserTelephone(p.telephone)) erreurs.push('Numéro illisible : écris-le comme 06 12 34 56 78.');
  return erreurs;
}

export const profilCoach = {
  async lire(): Promise<ProfilCoach> {
    if (!supabase) return demo;
    const { data, error } = await supabase
      .from('coachs')
      .select('nom, telephone, photo')
      .eq('id', (await supabase.rpc('mon_coach_id')).data)
      .single();
    if (error || !data) throw new Error('Impossible de charger ton profil pour le moment.');
    return { nom: data.nom, telephone: data.telephone ?? undefined, photo: data.photo ?? undefined };
  },

  async enregistrer(p: ProfilCoach): Promise<void> {
    const erreurs = erreursProfilCoach(p);
    if (erreurs.length) throw new Error(erreurs.join('\n'));
    const ligne = { nom: p.nom.trim(), telephone: normaliserTelephone(p.telephone) ?? null, photo: p.photo ?? null };
    if (!supabase) {
      demo = { nom: ligne.nom, telephone: ligne.telephone ?? undefined, photo: ligne.photo ?? undefined };
      return;
    }
    const { error } = await supabase
      .from('coachs')
      .update(ligne)
      .eq('id', (await supabase.rpc('mon_coach_id')).data);
    if (error) throw new Error('Profil non enregistré, réessaie dans un instant.');
  },
};
