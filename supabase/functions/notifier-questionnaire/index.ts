// Prévient le coach sur son téléphone dès qu'une réponse au questionnaire arrive (Tally ou questionnaire de l'app).
// Appelée par la base elle-même (déclencheur sur « questionnaires », via pg_net) avec { id } de la réponse.
// Pas de clé à transmettre : la fonction relit tout dans la base, n'agit que sur une réponse de moins de 10 minutes
// et ne prévient qu'une fois (colonne notifie_le). Un appel extérieur ne peut donc rien faire de plus.

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
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) return repondre({ erreur: 'Réponse inconnue.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Réserve la notification : une seule fois, et seulement pour une réponse toute récente.
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: q } = await admin
    .from('questionnaires')
    .update({ notifie_le: new Date().toISOString() })
    .eq('id', id)
    .is('notifie_le', null)
    .gte('recu_le', depuis)
    .select('id, coach_id, contact_id, reponses, alertes')
    .maybeSingle();
  if (!q) return repondre({ envoyes: 0 });

  const [{ data: coach }, { data: contact }] = await Promise.all([
    admin.from('coachs').select('user_id').eq('id', q.coach_id).single(),
    admin.from('contacts').select('prenom, nom').eq('id', q.contact_id).single(),
  ]);
  if (!coach?.user_id) return repondre({ envoyes: 0 });
  const { data: appareils } = await admin.from('appareils_push').select('jeton').eq('user_id', coach.user_id);
  if (!appareils?.length) return repondre({ envoyes: 0 });

  const r = (q.reponses ?? {}) as Record<string, string>;
  const nom = `${contact?.prenom ?? r.prenom ?? ''} ${contact?.nom ?? r.nom ?? ''}`.trim() || 'Un prospect';
  const objectif = r.objectif === 'Autre' ? r.objectifAutre : r.objectif;
  const corps = [nom, objectif, (q.alertes ?? []).length ? '⚠️ à vérifier' : ''].filter(Boolean).join(' · ');
  const envois = appareils.map((a) => ({
    to: a.jeton,
    title: 'Nouvelle réponse au questionnaire',
    body: corps,
    data: { url: `/coach?onglet=crm&rubrique=Contacts&contact=${q.contact_id}`, genre: 'questionnaire' },
    sound: 'default',
    channelId: 'messages',
    priority: 'high',
  }));

  const envoi = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(envois),
  });
  const retour = (await envoi.json().catch(() => null)) as { data?: { status: string; details?: { error?: string } }[] } | null;
  const perimes = (retour?.data ?? []).map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? envois[i].to : null)).filter((j): j is string => !!j);
  if (perimes.length) await admin.from('appareils_push').delete().in('jeton', perimes);
  return repondre({ envoyes: envois.length - perimes.length });
});
