// Prévient le destinataire d'un nouveau message sur son téléphone (service de notifications d'Expo).
// Appelée par l'appli juste après l'envoi : { id } du message. Seul l'auteur du message peut la déclencher,
// et le contenu vient de la base, jamais de la requête.

import { createClient } from 'npm:@supabase/supabase-js@2';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

// Mêmes mots que src/domain/messagerie.ts (apercu).
function apercu(texte: string | null, type: string | null): string {
  const t = texte?.trim().replace(/\s+/g, ' ');
  if (t) return t.length > 140 ? `${t.slice(0, 139)}…` : t;
  if (type?.startsWith('image/')) return '📷 Photo';
  if (type?.startsWith('video/')) return '🎥 Vidéo';
  if (type?.startsWith('audio/')) return '🎤 Message vocal';
  return 'Nouveau message';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let id: unknown;
  try {
    ({ id } = await req.json());
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return repondre({ erreur: 'Message inconnu.' }, 400);

  // Qui demande : d'après son propre jeton. La lecture passe par ses droits (RLS).
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await utilisateur.auth.getUser();
  if (!moi.user) return repondre({ erreur: 'Reconnecte-toi.' }, 401);
  const { data: m } = await utilisateur.from('messages').select('id, coach_id, client_id, auteur, texte, piece_type, cree_le').eq('id', id).maybeSingle();
  if (!m) return repondre({ erreur: 'Message introuvable.' }, 404);
  // Un message vieux de plus de 10 minutes ne déclenche plus rien (pas de relance à volonté).
  if (Date.now() - new Date(m.cree_le).getTime() > 10 * 60_000) return repondre({ envoyes: 0 });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const [{ data: coach }, { data: client }] = await Promise.all([
    admin.from('coachs').select('user_id, nom').eq('id', m.coach_id).single(),
    admin.from('clients').select('user_id, prenom, nom').eq('id', m.client_id).single(),
  ]);
  if (!coach || !client) return repondre({ envoyes: 0 });
  const auteurId = m.auteur === 'coach' ? coach.user_id : client.user_id;
  if (auteurId !== moi.user.id) return repondre({ erreur: 'Seul l’auteur du message peut prévenir.' }, 403);

  const destinataire = m.auteur === 'coach' ? client.user_id : coach.user_id;
  if (!destinataire) return repondre({ envoyes: 0 });
  const { data: appareils } = await admin.from('appareils_push').select('jeton').eq('user_id', destinataire);
  if (!appareils?.length) return repondre({ envoyes: 0 });

  const titre = m.auteur === 'coach' ? coach.nom : `${client.prenom} ${client.nom ?? ''}`.trim();
  const url = m.auteur === 'coach' ? '/client/messages' : `/coach/messages/${m.client_id}`;
  const envois = appareils.map((a) => ({
    to: a.jeton,
    title: titre,
    body: apercu(m.texte, m.piece_type),
    data: { url, genre: 'message' },
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
