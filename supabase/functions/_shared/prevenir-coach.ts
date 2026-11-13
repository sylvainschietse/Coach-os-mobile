// Notification sur le téléphone du coach : passe par notifier() dans la base, qui respecte les alertes qu'il a coupées
// et appelle « envoyer-notification ». Si l'enregistrement échoue, rien ne bloque l'appelant.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export async function prevenirCoach(admin: SupabaseClient, coachId: string, titre: string, corps: string, url: string) {
  try {
    const { error } = await admin.rpc('notifier_coach', { p_coach: coachId, p_genre: 'paiement', p_titre: titre, p_corps: corps, p_url: url });
    if (error) console.error('notification coach', error.message);
  } catch (e) {
    console.error('notification coach', e);
  }
}

/** Lien vers la fiche du client dans l'espace coach. */
export async function lienFiche(admin: SupabaseClient, clientId: string) {
  const { data: contact } = await admin.from('contacts').select('id').eq('client_id', clientId).limit(1).maybeSingle();
  return contact ? `/coach?onglet=crm&rubrique=Contacts&contact=${contact.id}` : '/coach?onglet=crm&rubrique=Contacts';
}
