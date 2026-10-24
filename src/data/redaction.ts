import type { Booster, Contact } from '@/domain/crm';
import { dossierRedaction, redactionModele, type RedactionGeneree } from '@/domain/redaction';

import { supabase } from './supabase';

/** Vrai quand le compte en ligne est branché : la rédaction passe alors par l'IA, côté serveur. */
export const iaDisponible = !!supabase;

/**
 * Rédige les textes développés du compte rendu. Avec le compte en ligne, Claude les écrit à partir du dossier
 * (la clé reste dans la fonction Supabase) ; en démo, on reprend le modèle sans IA.
 */
export async function redigerCompteRendu(contact: Contact, booster: Booster, reponses: Record<string, string> | undefined): Promise<RedactionGeneree> {
  if (!supabase) return { ...redactionModele(contact, booster, reponses), titresPriorites: [] };
  const { data, error } = await supabase.functions.invoke<RedactionGeneree & { erreur?: string }>('rediger-compte-rendu', {
    body: { boosterId: booster.id, dossier: dossierRedaction(contact, booster, reponses) },
  });
  if (error || !data || data.erreur) throw new Error(data?.erreur ?? 'La rédaction n’a pas pu être lancée.');
  return data;
}
