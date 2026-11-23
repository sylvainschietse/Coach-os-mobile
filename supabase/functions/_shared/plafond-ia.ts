// Plafond d'appels à l'IA par personne et par jour (200 pour un coach, 40 pour un client), tenu par la base
// (fonction compter_appel_ia). Évite qu'un compte, piraté ou non, fasse grimper la facture Claude en boucle.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const MESSAGE_PLAFOND_IA = 'Tu as atteint le nombre maximum de demandes à l’IA pour aujourd’hui. Réessaie demain.';

/** Compte l'appel de la personne connectée (client Supabase créé avec son jeton) ; false si son plafond du jour est atteint. */
export async function appelIaPermis(db: SupabaseClient): Promise<boolean> {
  const { data, error } = await db.rpc('compter_appel_ia');
  // Base pas encore mise à jour (fonction absente) : on laisse passer plutôt que de couper l'IA.
  if (error) return error.code === 'PGRST202';
  return data === true;
}
