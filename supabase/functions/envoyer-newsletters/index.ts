// Newsletters du coach, envoyées par Brevo (e-mail) et par le service de notifications (téléphone).
// · Appelée toutes les 15 minutes par une tâche planifiée (pg_cron + pg_net) avec l'en-tête « x-agenda-cle » égal au
//   secret AGENDA_CLE : envoie les newsletters dont l'heure est venue. Chaque personne est d'abord réservée dans
//   « newsletters_envois » : une newsletter n'est jamais reçue deux fois, même si deux passages se croisent.
// · Appelée par le coach (son jeton) avec { test: { … } } : envoie l'article tel qu'il est à l'écran à sa propre adresse.
// Secrets : BREVO_API_KEY, EXPEDITEUR_EMAIL (adresse validée dans Brevo), ADRESSE_WEB (site de l'app), AGENDA_CLE.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { API_BREVO, lireReponseBrevo } from '../_shared/envoi-email.ts';
import { corpsBrevoNewsletter, emailValide, erreurNewsletter, mailNewsletter, notifNewsletter, type Article } from '../_shared/newsletters.ts';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  const cleBrevo = Deno.env.get('BREVO_API_KEY');
  const expediteur = Deno.env.get('EXPEDITEUR_EMAIL');
  const site = (Deno.env.get('ADRESSE_WEB') ?? '').replace(/\/+$/, '');
  const urlBase = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(urlBase, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const imagePublique = (chemin?: string | null) => (chemin ? `${urlBase}/storage/v1/object/public/newsletters/${chemin}` : undefined);

  async function envoyerMail(a: string, prenom: string | undefined, coach: string, repondreA: string | undefined, article: Article, desabonnement: string, id: string, coachId: string, quand?: string) {
    // Les images du texte : seulement celles rangées dans le dossier du coach.
    const urlImage = (src: string) => (src.startsWith(`${coachId}/`) && /^[0-9a-f-]{36}\/[A-Za-z0-9_.-]{1,80}$/.test(src) ? imagePublique(src) : undefined);
    const m = mailNewsletter(article, { prenom, coach, desabonnement, quand, urlImage });
    const r = await fetch(API_BREVO, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': cleBrevo! },
      body: JSON.stringify(corpsBrevoNewsletter({ email: expediteur!, nom: coach }, { email: a, prenom }, m, { desabonnement, repondreA, id })),
    }).catch(() => null);
    if (!r) return { etat: 'echec' as const, detail: 'Brevo injoignable.' };
    return lireReponseBrevo(r.status, await r.text());
  }

  // ---------- Test : le coach s'envoie l'article à lui-même ----------
  if (req.headers.get('x-agenda-cle') === null) {
    let corps: { test?: Article & { image?: string } };
    try {
      corps = await req.json();
    } catch {
      return repondre({ erreur: 'Requête illisible.' }, 400);
    }
    const jeton = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: moi } = await db.auth.getUser(jeton);
    if (!moi.user?.email) return repondre({ erreur: 'Connexion requise.' }, 401);
    const { data: coach } = await db.from('coachs').select('id, nom').eq('user_id', moi.user.id).maybeSingle();
    if (!coach) return repondre({ erreur: 'Réservé aux coachs.' }, 403);
    if (!cleBrevo || !expediteur) return repondre({ erreur: 'L’envoi d’e-mails n’est pas encore raccordé (Brevo).' }, 503);
    const t = corps.test;
    const erreur = t ? erreurNewsletter({ ...t, cibles: ['clients'], parEmail: true, parNotif: false }) : 'Article manquant.';
    if (erreur || !t) return repondre({ erreur }, 400);
    const image = t.image && t.image.startsWith(`${coach.id}/`) ? imagePublique(t.image) : undefined;
    const lu = await envoyerMail(moi.user.email, coach.nom?.split(' ')[0], coach.nom, undefined, { ...t, image }, `${site}/desabonnement/exemple`, 'test', coach.id);
    if (lu.etat !== 'envoye' && lu.etat !== 'transmis') return repondre({ erreur: lu.detail }, 502);
    return repondre({ envoye: moi.user.email });
  }

  // ---------- Passage planifié ----------
  const secret = Deno.env.get('AGENDA_CLE');
  if (!secret || req.headers.get('x-agenda-cle') !== secret) return repondre({ erreur: 'Accès refusé.' }, 401);
  const { data: dues, error } = await db
    .from('newsletters')
    .select('id, coach_id, rubrique, objet, chapeau, message, image, bouton_libelle, bouton_lien, cibles, par_email, par_notif, envoi_le, etat')
    .in('etat', ['programmee', 'en_cours'])
    .lte('envoi_le', new Date().toISOString())
    .order('envoi_le')
    .limit(10);
  if (error) return repondre({ erreur: error.message }, 500);
  const mailsPossibles = !!cleBrevo && !!expediteur && /^https:\/\//.test(site);
  const bilan: Record<string, number> = {};
  const compter = (k: string) => (bilan[k] = (bilan[k] ?? 0) + 1);

  for (const n of dues ?? []) {
    if (n.par_email && !mailsPossibles) {
      console.error('envoyer-newsletters : BREVO_API_KEY, EXPEDITEUR_EMAIL ou ADRESSE_WEB manquant, newsletter gardée pour plus tard.');
      compter('en_attente_brevo');
      continue;
    }
    if (n.etat === 'programmee') {
      const { data: prise } = await db.from('newsletters').update({ etat: 'en_cours' }).eq('id', n.id).eq('etat', 'programmee').select('id');
      if (!prise?.length) continue; // Un autre passage s'en occupe.
    }
    const { data: c } = await db.from('coachs').select('nom, user_id').eq('id', n.coach_id).single();
    const { data: u } = c?.user_id ? await db.auth.admin.getUserById(c.user_id) : { data: null };
    const coach = c?.nom ?? 'Ton coach';
    const article: Article = {
      rubrique: n.rubrique, objet: n.objet, chapeau: n.chapeau, message: n.message,
      boutonLibelle: n.bouton_libelle ?? undefined, boutonLien: n.bouton_lien ?? undefined, image: imagePublique(n.image), cibles: n.cibles,
    };
    const { data: liste } = await db.rpc('destinataires_newsletter', { p_id: n.id });
    let bloque = false;
    for (const d of (liste ?? []) as { contact_id: string; prenom: string; email: string | null; user_id: string | null; jeton: string; desabonne: boolean }[]) {
      if (d.desabonne) continue;
      const parMail = n.par_email && emailValide(d.email);
      const parNotif = n.par_notif && !!d.user_id;
      if (!parMail && !parNotif) continue;
      // Réserver la personne : si la ligne existe déjà, elle a été traitée (ou l'est en ce moment).
      const { error: deja } = await db.from('newsletters_envois').insert({ newsletter_id: n.id, contact_id: d.contact_id });
      if (deja) continue;
      const fait: { email_le?: string; notif_le?: string } = {};
      if (parMail) {
        const lu = await envoyerMail(d.email!.trim(), d.prenom || undefined, coach, u?.user?.email ?? undefined, article, `${site}/desabonnement/${d.jeton}`, n.id, n.coach_id, n.envoi_le);
        if (lu.etat === 'envoye' || lu.etat === 'transmis') {
          fait.email_le = new Date().toISOString();
          compter('emails');
        } else {
          console.error(`envoyer-newsletters : ${lu.detail}`);
          if (lu.etat === 'bloque' || lu.detail.includes('BREVO_API_KEY') || lu.detail.includes('expédition')) {
            // Quota atteint ou Brevo mal réglé : on libère la personne et on reprendra au prochain passage.
            await db.from('newsletters_envois').delete().eq('newsletter_id', n.id).eq('contact_id', d.contact_id);
            bloque = true;
            break;
          }
          compter('echecs');
        }
      }
      if (parNotif) {
        const t = notifNewsletter(n, { prenom: d.prenom || undefined, coach });
        const { error: e } = await db.rpc('notifier_newsletter', { p_user: d.user_id, p_titre: t.titre, p_corps: t.corps });
        if (!e) {
          fait.notif_le = new Date().toISOString();
          compter('notifs');
        }
      }
      if (fait.email_le || fait.notif_le) await db.from('newsletters_envois').update(fait).eq('newsletter_id', n.id).eq('contact_id', d.contact_id);
    }
    if (bloque) continue;
    const { data: envois } = await db.from('newsletters_envois').select('email_le, notif_le').eq('newsletter_id', n.id);
    await db
      .from('newsletters')
      .update({
        etat: 'envoyee',
        envoyee_le: new Date().toISOString(),
        nb_emails: (envois ?? []).filter((e) => e.email_le).length,
        nb_notifs: (envois ?? []).filter((e) => e.notif_le).length,
      })
      .eq('id', n.id);
    compter('newsletters');
  }
  return repondre({ ok: true, bilan });
});
