// Notification sur le téléphone du coach (Expo Push). Sans appareil enregistré ou si l'envoi échoue, rien ne bloque l'appelant.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

export async function prevenirCoach(admin: SupabaseClient, coachId: string, titre: string, corps: string, url: string) {
  try {
    const { data: coach } = await admin.from('coachs').select('user_id').eq('id', coachId).single();
    if (!coach?.user_id) return;
    const { data: appareils } = await admin.from('appareils_push').select('jeton').eq('user_id', coach.user_id);
    if (!appareils?.length) return;
    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(
        appareils.map((a: { jeton: string }) => ({ to: a.jeton, title: titre, body: corps, data: { url, genre: 'paiement' }, sound: 'default', channelId: 'messages', priority: 'high' })),
      ),
    });
  } catch (e) {
    console.error('notification coach', e);
  }
}

/** Lien vers la fiche du client dans l'espace coach. */
export async function lienFiche(admin: SupabaseClient, clientId: string) {
  const { data: contact } = await admin.from('contacts').select('id').eq('client_id', clientId).limit(1).maybeSingle();
  return contact ? `/coach?onglet=crm&rubrique=Contacts&contact=${contact.id}` : '/coach?onglet=crm&rubrique=Contacts';
}
