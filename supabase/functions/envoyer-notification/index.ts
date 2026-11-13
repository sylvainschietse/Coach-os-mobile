// Porte une notification aux téléphones de son destinataire (service de notifications d'Expo).
// Appelée par la base elle-même (fonction notifier(), via pg_net) avec { id } de la ligne « notifications ».
// Pas de clé à transmettre : tout est relu dans la base, une notification n'est envoyée qu'une fois (envoyee_le)
// et seulement si elle a moins de 10 minutes. Un appel extérieur ne peut donc rien envoyer de plus.

import { createClient } from 'npm:@supabase/supabase-js@2';

const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return repondre({ erreur: 'Méthode non prise en charge.' }, 405);
  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return repondre({ erreur: 'Notification inconnue.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Réserve la notification : une seule fois, et seulement si elle est toute récente.
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: n } = await admin
    .from('notifications')
    .update({ envoyee_le: new Date().toISOString() })
    .eq('id', id)
    .is('envoyee_le', null)
    .gte('cree_le', depuis)
    .select('user_id, genre, titre, corps, url')
    .maybeSingle();
  if (!n) return repondre({ envoyes: 0 });

  const { data: appareils } = await admin.from('appareils_push').select('jeton').eq('user_id', n.user_id);
  if (!appareils?.length) return repondre({ envoyes: 0 });

  const envois = appareils.map((a: { jeton: string }) => ({
    to: a.jeton,
    title: n.titre,
    body: n.corps,
    data: { url: n.url, genre: n.genre },
    sound: 'default',
    channelId: 'messages',
    priority: 'high',
  }));
  const r = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(envois),
  });
  const retour = (await r.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
  // Téléphone désinstallé ou jeton périmé : on l'oublie.
  const perimes = (retour?.data ?? []).map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? envois[i].to : null)).filter((j): j is string => !!j);
  if (perimes.length) await admin.from('appareils_push').delete().in('jeton', perimes);
  return repondre({ envoyes: envois.length - perimes.length });
});
