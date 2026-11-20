// Synchronisation de l'agenda avec Google Agenda.
//   · POST { action: 'connecter', retour } avec le jeton du coach : adresse de connexion Google ;
//   · GET ?code&state : retour de Google, jeton enregistré puis renvoi vers l'app (retour?google=ok|erreur) ;
//   · POST { action: 'synchroniser' } avec le jeton du coach : synchro immédiate de son agenda ;
//   · POST { action: 'deconnecter' } avec le jeton du coach : accès Google retiré ;
//   · POST avec l'en-tête « x-agenda-cle » (tâche planifiée, toutes les 15 minutes) : synchro de tous les coachs.
// Secrets : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AGENDA_CLE, ADRESSE_WEB.
// À régler dans Google Cloud : URI de redirection = <SUPABASE_URL>/functions/v1/agenda-google.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { evenementGoogle, idEvenement, occupationsGoogle, PORTEE_GOOGLE, retireDeGoogle, retourAutorise } from '../_shared/agenda-google.ts';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });
const JOUR = 86_400_000;
const API = 'https://www.googleapis.com/calendar/v3/calendars';

const service = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const redirection = () => `${Deno.env.get('SUPABASE_URL')!.replace(/\/+$/, '')}/functions/v1/agenda-google`;
const site = () => (Deno.env.get('ADRESSE_WEB') ?? '').replace(/\/+$/, '');

function identifiants() {
  const id = Deno.env.get('GOOGLE_CLIENT_ID');
  const secret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  return id && secret ? { id, secret } : null;
}

async function jetonGoogle(corps: Record<string, string>) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(corps),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, ...j } as { ok: boolean; access_token?: string; refresh_token?: string; id_token?: string; error?: string };
}

/** E-mail du compte Google, lu dans l'id_token rendu par Google lui-même (pas besoin de vérifier la signature ici). */
function emailDe(idToken?: string) {
  try {
    const charge = idToken?.split('.')[1] ?? '';
    return (JSON.parse(atob(charge.replace(/-/g, '+').replace(/_/g, '/'))).email as string) ?? '';
  } catch {
    return '';
  }
}

const ajouterParam = (url: string, cle: string, valeur: string) => `${url}${url.includes('?') ? '&' : '?'}${cle}=${encodeURIComponent(valeur)}`;

/** Synchro d'un coach : suppressions, rendez-vous à recopier, puis ses créneaux perso. Renvoie un bilan ou une erreur. */
async function synchroniser(db: SupabaseClient, coachId: string) {
  const ids = identifiants();
  if (!ids) return { erreur: 'Accès Google non configuré (GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET).' };
  const { data: compte } = await db.from('google_agenda').select('refresh_token, calendrier').eq('coach_id', coachId).maybeSingle();
  if (!compte) return { erreur: 'Google Agenda non connecté.' };
  const noter = (champs: Record<string, unknown>) => db.from('google_agenda').update(champs).eq('coach_id', coachId);

  const t = await jetonGoogle({ client_id: ids.id, client_secret: ids.secret, refresh_token: compte.refresh_token, grant_type: 'refresh_token' });
  if (!t.access_token) {
    const erreur = t.error === 'invalid_grant' ? 'La connexion Google a expiré ou a été retirée : reconnecte ton agenda.' : 'Google ne répond pas, nouvel essai dans 15 minutes.';
    await noter({ erreur });
    return { erreur };
  }
  const cal = `${API}/${encodeURIComponent(compte.calendrier)}/events`;
  const google = (url: string, init: RequestInit = {}) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' } });
  const bilan = { envoyes: 0, retires: 0, occupations: 0, echecs: 0 };

  // 1. Rendez-vous supprimés dans l'app.
  const { data: suppr } = await db.from('google_suppressions').select('event_id').eq('coach_id', coachId).limit(200);
  for (const s of suppr ?? []) {
    const r = await google(`${cal}/${s.event_id}`, { method: 'DELETE' });
    if (r.ok || r.status === 404 || r.status === 410) {
      await db.from('google_suppressions').delete().eq('coach_id', coachId).eq('event_id', s.event_id);
      bilan.retires++;
    } else bilan.echecs++;
  }

  // 2. Rendez-vous nouveaux ou modifiés depuis la dernière copie (30 jours passés à 1 an à venir).
  const { data: rdv } = await db
    .from('rendez_vous')
    .select('id, type, debut, fin, lieu, lien_visio, note, statut, maj_le, google_event_id, google_synchro_le, rendez_vous_participants(clients(prenom))')
    .eq('coach_id', coachId)
    .gte('debut', new Date(Date.now() - 30 * JOUR).toISOString())
    .lte('debut', new Date(Date.now() + 365 * JOUR).toISOString())
    .order('debut')
    .limit(1000);
  const aFaire = (rdv ?? []).filter((r) => !r.google_synchro_le || Date.parse(r.maj_le) > Date.parse(r.google_synchro_le)).slice(0, 150);
  for (const r of aFaire) {
    const eid = idEvenement(r.id);
    if (retireDeGoogle(r.statut)) {
      if (r.google_event_id) {
        const s = await google(`${cal}/${r.google_event_id}`, { method: 'DELETE' });
        if (!(s.ok || s.status === 404 || s.status === 410)) {
          bilan.echecs++;
          continue;
        }
        bilan.retires++;
      }
      await db.from('rendez_vous').update({ google_event_id: null, google_synchro_le: new Date().toISOString() }).eq('id', r.id);
      continue;
    }
    const prenoms = ((r.rendez_vous_participants ?? []) as { clients: { prenom: string } | null }[]).map((p) => p.clients?.prenom ?? '').sort();
    const corps = evenementGoogle(
      { id: r.id, type: r.type, debut: r.debut, fin: r.fin, lieu: r.lieu, lienVisio: r.lien_visio, note: r.note, statut: r.statut, prenoms },
      site() || undefined,
    );
    // Création avec un identifiant fixe ; s'il existe déjà (même retiré plus tôt), mise à jour.
    let rep = await google(`${cal}?conferenceDataVersion=1&sendUpdates=none`, { method: 'POST', body: JSON.stringify(corps) });
    if (rep.status === 409) {
      const { id: _id, ...maj } = corps;
      rep = await google(`${cal}/${eid}?conferenceDataVersion=1&sendUpdates=none`, { method: 'PATCH', body: JSON.stringify(maj) });
    }
    if (!rep.ok) {
      console.error(`agenda-google : rendez-vous ${r.id}, HTTP ${rep.status} ${(await rep.text()).slice(0, 200)}`);
      bilan.echecs++;
      continue;
    }
    const ev = (await rep.json()) as { hangoutLink?: string };
    const champs: Record<string, unknown> = { google_event_id: eid, google_synchro_le: new Date().toISOString() };
    if (r.type === 'visio' && !r.lien_visio && ev.hangoutLink?.startsWith('https://')) champs.lien_visio = ev.hangoutLink;
    await db.from('rendez_vous').update(champs).eq('id', r.id);
    bilan.envoyes++;
  }

  // 3. Créneaux perso des 60 prochains jours.
  const params = new URLSearchParams({
    timeMin: new Date(Date.now() - JOUR).toISOString(),
    timeMax: new Date(Date.now() + 60 * JOUR).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '2500',
    fields: 'items(id,status,summary,transparency,start,end,extendedProperties,attendees(self,responseStatus))',
  });
  const lu = await google(`${cal}?${params}`);
  if (lu.ok) {
    const occupations = occupationsGoogle(((await lu.json()) as { items?: [] }).items ?? []);
    await db.from('google_occupations').delete().eq('coach_id', coachId);
    if (occupations.length) await db.from('google_occupations').insert(occupations.map((o) => ({ coach_id: coachId, ...o })));
    bilan.occupations = occupations.length;
  } else bilan.echecs++;

  const erreur = bilan.echecs ? 'Une partie de la synchro Google a échoué, nouvel essai dans 15 minutes.' : null;
  await noter({ synchro_le: new Date().toISOString(), erreur });
  return { bilan, erreur: erreur ?? undefined };
}

async function coachConnecte(req: Request) {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await db.auth.getUser();
  if (!moi.user) return null;
  const { data } = await db.rpc('mon_coach_id');
  return (data as string | null) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  const db = service();

  // Retour de Google après la connexion.
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const etat = url.searchParams.get('state') ?? '';
    const code = url.searchParams.get('code');
    if (!/^[0-9a-f-]{36}$/i.test(etat)) return new Response('Lien de connexion invalide.', { status: 400 });
    const { data: demande } = await db.from('google_connexions').select('coach_id, retour, cree_le').eq('etat', etat).maybeSingle();
    await db.from('google_connexions').delete().eq('etat', etat);
    if (!demande || Date.now() - Date.parse(demande.cree_le) > 15 * 60_000) return new Response('Lien de connexion expiré : recommence depuis l’app.', { status: 400 });
    const vers = (resultat: string) => new Response(null, { status: 302, headers: { Location: ajouterParam(demande.retour, 'google', resultat) } });
    const ids = identifiants();
    if (!code || !ids) return vers('refuse');
    const t = await jetonGoogle({ client_id: ids.id, client_secret: ids.secret, code, grant_type: 'authorization_code', redirect_uri: redirection() });
    if (!t.refresh_token) return vers('erreur');
    await db.from('google_agenda').upsert({
      coach_id: demande.coach_id,
      email: emailDe(t.id_token),
      refresh_token: t.refresh_token,
      calendrier: 'primary',
      connecte_le: new Date().toISOString(),
      erreur: null,
    });
    // Premiers rendez-vous recopiés tout de suite.
    await db.from('rendez_vous').update({ google_synchro_le: null }).eq('coach_id', demande.coach_id);
    await synchroniser(db, demande.coach_id).catch(() => null);
    return vers('ok');
  }

  if (req.method !== 'POST') return repondre({ erreur: 'Méthode non prise en charge.' }, 405);

  // Tâche planifiée : tous les coachs connectés.
  const cle = req.headers.get('x-agenda-cle');
  if (cle !== null) {
    if (!Deno.env.get('AGENDA_CLE') || cle !== Deno.env.get('AGENDA_CLE')) return repondre({ erreur: 'Accès refusé.' }, 401);
    await db.from('google_connexions').delete().lt('cree_le', new Date(Date.now() - JOUR).toISOString());
    const { data: comptes } = await db.from('google_agenda').select('coach_id');
    const resultats: Record<string, unknown> = {};
    for (const c of comptes ?? []) resultats[c.coach_id] = await synchroniser(db, c.coach_id).catch((e) => ({ erreur: String(e) }));
    return repondre({ resultats });
  }

  let corps: { action?: string; retour?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const coachId = await coachConnecte(req);
  if (!coachId) return repondre({ erreur: 'Connexion coach requise.' }, 401);

  if (corps.action === 'connecter') {
    const ids = identifiants();
    if (!ids) return repondre({ erreur: 'La connexion Google n’est pas encore configurée.' }, 503);
    const retour = corps.retour ?? '';
    if (!retourAutorise(retour, site())) return repondre({ erreur: 'Adresse de retour non autorisée.' }, 400);
    const { data, error } = await db.from('google_connexions').insert({ coach_id: coachId, retour }).select('etat').single();
    if (error || !data) return repondre({ erreur: 'Connexion impossible pour le moment.' }, 500);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: ids.id,
      redirect_uri: redirection(),
      response_type: 'code',
      scope: PORTEE_GOOGLE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: data.etat,
    }).toString();
    return repondre({ url: url.toString() });
  }

  if (corps.action === 'synchroniser') {
    const r = await synchroniser(db, coachId);
    return repondre(r, r.erreur && !('bilan' in r) ? 409 : 200);
  }

  if (corps.action === 'deconnecter') {
    const { data: compte } = await db.from('google_agenda').select('refresh_token').eq('coach_id', coachId).maybeSingle();
    if (compte) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(compte.refresh_token)}`, { method: 'POST', signal: AbortSignal.timeout(10000) }).catch(() => null);
    }
    await db.from('google_agenda').delete().eq('coach_id', coachId);
    await db.from('google_occupations').delete().eq('coach_id', coachId);
    await db.from('google_suppressions').delete().eq('coach_id', coachId);
    await db.from('rendez_vous').update({ google_event_id: null, google_synchro_le: null }).eq('coach_id', coachId);
    return repondre({ ok: true });
  }

  return repondre({ erreur: 'Action inconnue.' }, 400);
});
