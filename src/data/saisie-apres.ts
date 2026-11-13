// La séance racontée après coup : le texte dicté part à la fonction « lire-seance » (Claude range les séries), ou est lu
// simplement sur l'appareil en démo. Rien n'est enregistré ici : le client relit et valide bloc par bloc.
import { lireDicteeSimple, type LigneADicter, type SeanceDictee } from '@/domain/saisie-apres';

import { supabase } from './supabase';

export async function lireSeanceDictee(texte: string, lignes: LigneADicter[]): Promise<SeanceDictee> {
  if (!supabase) return lireDicteeSimple(texte, lignes);
  const { data, error } = await supabase.functions.invoke<SeanceDictee & { erreur?: string }>('lire-seance', { body: { texte, lignes } });
  if (error || !data || data.erreur) {
    const corps = await (error as { context?: Response } | null)?.context?.json?.().catch(() => null);
    throw new Error(data?.erreur ?? corps?.erreur ?? 'Je n’ai pas réussi à lire ta séance. Valide tes blocs à la main.');
  }
  return data;
}
