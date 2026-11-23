// Automatisations du coach : relance des factures impayées, prélèvements Stripe refusés, rappel la veille sur le téléphone,
// bienvenue des nouveaux clients, rapport du lundi au coach.
// · Appelée chaque heure (pg_cron + pg_net) avec l'en-tête « x-agenda-cle » = secret AGENDA_CLE et { mode: 'normal' } :
//   seules les automatisations dont l'interrupteur est allumé (table automatisations) envoient quelque chose.
//   Chaque envoi est réservé d'abord dans automatisations_envois (clé unique) : jamais deux fois le même message.
// · { mode: 'test' } : un exemple de chaque message, envoyé au coach seul (mail + notification), rien n'est noté.
// Secrets : BREVO_API_KEY, EXPEDITEUR_EMAIL, ADRESSE_WEB, AGENDA_CLE.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { API_BREVO, lireReponseBrevo } from '../_shared/envoi-email.ts';
import { base64Octets, facturePdf, type Facture } from '../_shared/facture-pdf.ts';
import {
  mailBienvenue, mailRapport, mailRelanceFacture, mailStripe, notifBienvenueJ2, notifBienvenueJ7, notifCoachFacture, notifRelanceFacture, notifVeille,
  type Mail, type Rapport,
} from '../_shared/automatisations-textes.ts';

const JOUR = 86_400_000;
const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

/** Date et heure à Paris. */
function paris(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, heure: Number(p.hour), lundi: p.weekday === 'Mon' };
}
const plusJours = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * JOUR).toISOString().slice(0, 10);
const ecartJours = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / JOUR);

Deno.serve(async (req) => {
  const secret = Deno.env.get('AGENDA_CLE');
  if (!secret || req.headers.get('x-agenda-cle') !== secret) return repondre({ erreur: 'Accès refusé.' }, 401);
  const cleBrevo = Deno.env.get('BREVO_API_KEY');
  const expediteur = Deno.env.get('EXPEDITEUR_EMAIL');
  const site = (Deno.env.get('ADRESSE_WEB') ?? '').replace(/\/+$/, '');
  if (!cleBrevo || !expediteur || !/^https:\/\//.test(site)) return repondre({ erreur: 'BREVO_API_KEY, EXPEDITEUR_EMAIL ou ADRESSE_WEB manquant.' }, 503);
  const { mode } = (await req.json().catch(() => ({}))) as { mode?: string };
  const test = mode === 'test';

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const maintenant = Date.now();
  const ici = paris(maintenant);
  const bilan: Record<string, number> = {};
  const compter = (k: string) => (bilan[k] = (bilan[k] ?? 0) + 1);
  const erreurs: string[] = [];

  const { data: interrupteurs } = await db.from('automatisations').select('flux, actif, actif_depuis');
  const actif = (flux: string) => test || !!interrupteurs?.find((x) => x.flux === flux && x.actif);
  const depuis = (flux: string) => interrupteurs?.find((x) => x.flux === flux)?.actif_depuis as string | undefined;

  // Coachs : nom, e-mail de connexion, réglages de facture.
  type Coach = { id: string; nom: string; email?: string; user_id: string | null; couleur: string | null; iban: string | null; bic: string | null };
  const coachs = new Map<string, Coach>();
  async function coach(id: string): Promise<Coach> {
    if (coachs.has(id)) return coachs.get(id)!;
    const { data: c } = await db.from('coachs').select('nom, user_id, facture_couleur, facture_iban, facture_bic').eq('id', id).single();
    const { data: u } = c?.user_id ? await db.auth.admin.getUserById(c.user_id) : { data: null };
    const v = { id, nom: c?.nom ?? 'Ton coach', email: u?.user?.email ?? undefined, user_id: c?.user_id ?? null, couleur: c?.facture_couleur ?? null, iban: c?.facture_iban ?? null, bic: c?.facture_bic ?? null };
    coachs.set(id, v);
    return v;
  }

  /** Réserve un envoi. false : déjà fait (ou en cours ailleurs). En test, rien n'est réservé. */
  async function reserver(cle: string, flux: string, clientId?: string) {
    if (test) return true;
    const { error } = await db.from('automatisations_envois').insert({ cle, flux, client_id: clientId ?? null });
    return !error;
  }
  const liberer = (cle: string) => (test ? undefined : db.from('automatisations_envois').delete().eq('cle', cle));
  async function dejaEnvoye(cle: string) {
    const { data } = await db.from('automatisations_envois').select('envoye_le').eq('cle', cle).maybeSingle();
    return data?.envoye_le as string | undefined;
  }

  async function mail(co: Coach, a: string, nom: string, m: Mail, tag: string, pj?: { nom: string; contenu: string }) {
    const destinataire = test ? co.email : a;
    if (!destinataire) return false;
    const r = await fetch(API_BREVO, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': cleBrevo! },
      body: JSON.stringify({
        sender: { email: expediteur, name: co.nom },
        to: [{ email: destinataire, name: test ? co.nom : nom }],
        ...(co.email ? { replyTo: { email: co.email } } : {}),
        subject: test ? `[TEST pour ${nom}] ${m.sujet}` : m.sujet,
        htmlContent: m.html,
        textContent: m.texte,
        ...(pj ? { attachment: [{ name: pj.nom, content: pj.contenu }] } : {}),
        tags: ['automatisation', tag],
      }),
    }).catch(() => null);
    if (!r) return false;
    const lu = lireReponseBrevo(r.status, await r.text());
    if (lu.etat !== 'envoye' && lu.etat !== 'transmis') erreurs.push(`${tag} : ${lu.detail}`);
    return lu.etat === 'envoye' || lu.etat === 'transmis';
  }
  async function notif(co: Coach, user: string | null, genre: string, t: { titre: string; corps: string }, url: string) {
    const pour = test ? co.user_id : user;
    if (!pour) return false;
    const { error } = await db.rpc('notifier', { p_user: pour, p_genre: test ? 'test' : genre, p_titre: test ? `[TEST] ${t.titre}` : t.titre, p_corps: t.corps, p_url: url });
    if (error) erreurs.push(`${genre} : ${error.message}`);
    return !error;
  }

  // ---------- 1. Factures impayées (virement, espèces) : rappel à J+7, J+14, coach prévenu à J+21 ----------
  if (actif('relance_factures') && (test || (ici.heure >= 9 && ici.heure < 19))) {
    const { data: factures } = await db
      .from('factures')
      .select('id, coach_id, client_id, numero, date, objet, total, emetteur, destinataire, lignes, clients(prenom, email, user_id)')
      .is('paye_le', null).is('virement_signale_le', null).gt('total', 0).not('client_id', 'is', null)
      .order('date').limit(test ? 1 : 200);
    for (const f of factures ?? []) {
      const cl = f.clients as unknown as { prenom: string; email: string | null; user_id: string | null };
      const co = await coach(f.coach_id);
      const age = ecartJours(ici.date, f.date);
      const lien = `${site}/client?onglet=moi`;
      const etapes: (1 | 2 | 3)[] = test ? [1, 2, 3] : [];
      if (!test) {
        const e1 = await dejaEnvoye(`facture:${f.id}:1`);
        const e2 = await dejaEnvoye(`facture:${f.id}:2`);
        if (!e1 && age >= 7) etapes.push(1);
        else if (e1 && !e2 && age >= 14 && maintenant - Date.parse(e1) >= 7 * JOUR - 3_600_000) etapes.push(2);
        else if (e2 && age >= 21 && maintenant - Date.parse(e2) >= 7 * JOUR - 3_600_000) etapes.push(3);
      }
      for (const etape of etapes) {
        const cle = `facture:${f.id}:${etape}`;
        if (!(await reserver(cle, 'relance_factures', f.client_id))) continue;
        let ok = false;
        if (etape === 3) {
          ok = await notif(co, co.user_id, 'facture_retard', notifCoachFacture(cl.prenom, f, age), '/coach?onglet=crm&rubrique=Paiements');
        } else if (cl.email) {
          const pdf = base64Octets(await facturePdf(f as unknown as Facture, { couleur: co.couleur, iban: co.iban, bic: co.bic }));
          ok = await mail(co, cl.email, cl.prenom, mailRelanceFacture(etape, cl.prenom, co.nom, f, !!cl.user_id, lien), `relance_facture_${etape}`, { nom: `Facture-${f.numero}.pdf`, contenu: pdf });
          if (ok && etape === 1 && cl.user_id) await notif(co, cl.user_id, 'facture', notifRelanceFacture(f), '/client?onglet=moi');
        } else if (cl.user_id && etape === 1) {
          ok = await notif(co, cl.user_id, 'facture', notifRelanceFacture(f), '/client?onglet=moi');
        }
        if (ok) compter(`facture_${etape}`);
        else await liberer(cle);
      }
    }
  }

  // ---------- 2. Prélèvements Stripe refusés : jour même, J+3, J+7, J+14 (et coach prévenu) ----------
  // Le webhook Stripe met la fiche en « past_due » quand un prélèvement échoue, et la repasse en « active » dès que c'est payé :
  // c'est la seule source du statut. Ici on ouvre un impayé au premier passage en past_due, et on le clôt dès que ce n'est plus le cas.
  if (actif('impaye_stripe') && !test) {
    const { data: ouverts } = await db.from('impayes_stripe').select('facture, client_id, clients(statut_stripe)').is('regle_le', null);
    for (const o of ouverts ?? []) {
      if ((o.clients as unknown as { statut_stripe: string | null } | null)?.statut_stripe !== 'past_due') await db.from('impayes_stripe').update({ regle_le: new Date().toISOString() }).eq('facture', o.facture);
    }
    const cleStripe = Deno.env.get('STRIPE_SECRET_KEY');
    const { data: enRetard } = await db.from('clients').select('id, coach_id, stripe_abonnement, offre_prix, coachs(stripe_compte)').eq('statut_stripe', 'past_due').not('stripe_abonnement', 'is', null);
    for (const c of enRetard ?? []) {
      if ((ouverts ?? []).some((o) => o.client_id === c.id && (o.clients as unknown as { statut_stripe: string | null } | null)?.statut_stripe === 'past_due')) continue;
      let facture = `abonnement:${c.stripe_abonnement}:${ici.date}`;
      let montant = Number(c.offre_prix ?? 0);
      let lien: string | null = null;
      const compte = (c.coachs as unknown as { stripe_compte: string | null } | null)?.stripe_compte;
      if (cleStripe) {
        const r = await fetch(`https://api.stripe.com/v1/invoices?subscription=${encodeURIComponent(c.stripe_abonnement!)}&status=open&limit=1`, {
          headers: { Authorization: `Bearer ${cleStripe}`, ...(compte ? { 'Stripe-Account': compte } : {}) },
        }).catch(() => null);
        const inv = r?.ok ? ((await r.json()) as { data: { id: string; amount_due: number; hosted_invoice_url: string | null }[] }).data[0] : undefined;
        if (inv) {
          facture = inv.id;
          montant = inv.amount_due / 100;
          lien = inv.hosted_invoice_url;
        }
      }
      await db.from('impayes_stripe').upsert({ facture, coach_id: c.coach_id, client_id: c.id, montant, lien, regle_le: null }, { onConflict: 'facture', ignoreDuplicates: true });
    }
  }
  if (actif('impaye_stripe') && (test || (ici.heure >= 9 && ici.heure < 20))) {
    const { data: impayes } = await db.from('impayes_stripe').select('facture, coach_id, client_id, montant, lien, echec_le, clients(prenom, email)').is('regle_le', null).limit(100);
    const lignes = test && !impayes?.length
      ? (await db.from('clients').select('id, coach_id, prenom, email').eq('paiement', 'stripe').limit(1)).data?.map((c) => ({ facture: 'exemple', coach_id: c.coach_id, client_id: c.id, montant: 50, lien: null, echec_le: new Date().toISOString(), clients: { prenom: c.prenom, email: c.email } })) ?? []
      : impayes ?? [];
    for (const i of lignes) {
      const cl = i.clients as unknown as { prenom: string; email: string | null };
      const co = await coach(i.coach_id);
      const jours = Math.floor((maintenant - Date.parse(i.echec_le)) / JOUR);
      const etapes = ([0, 3, 7, 14] as const).filter((n) => test || n <= jours);
      for (const n of test ? etapes : etapes.slice(-1)) {
        const cle = `stripe:${i.facture}:${n}`;
        if (!test && (await dejaEnvoye(cle))) continue;
        if (!cl.email || !(await reserver(cle, 'impaye_stripe', i.client_id))) continue;
        const ok = await mail(co, cl.email, cl.prenom, mailStripe(n, cl.prenom, co.nom, Number(i.montant), i.lien), `stripe_${n}`);
        if (ok && n === 14) await notif(co, co.user_id, 'stripe_impaye', { titre: `${cl.prenom} : prélèvement refusé depuis 14 jours`, corps: 'Dernier rappel envoyé. À toi de décider : délai, pause ou arrêt.' }, '/coach?onglet=crm&rubrique=Paiements');
        if (ok) compter(`stripe_${n}`);
        else await liberer(cle);
      }
    }
  }

  // ---------- 3. Rappel la veille sur le téléphone, à 18 h ----------
  if (actif('rappel_veille') && (test || (ici.heure >= 18 && ici.heure < 22))) {
    const demain = plusJours(ici.date, 1);
    const debutDemain = new Date(Date.parse(`${demain}T00:00:00Z`) - 3 * 3_600_000).toISOString();
    const { data: rdvs } = await db
      .from('rendez_vous')
      .select('id, coach_id, type, debut, lieu, lien_visio, statut, rendez_vous_participants(client_id, clients(user_id))')
      .in('statut', ['propose', 'confirme'])
      .gte('debut', test ? new Date().toISOString() : debutDemain)
      .lte('debut', new Date(Date.parse(`${demain}T23:59:59Z`) + 3 * 3_600_000).toISOString())
      .order('debut').limit(test ? 1 : 200);
    for (const r of rdvs ?? []) {
      if (!test && paris(Date.parse(r.debut)).date !== demain) continue;
      const co = await coach(r.coach_id);
      for (const p of (r.rendez_vous_participants ?? []) as unknown as { client_id: string; clients: { user_id: string | null } | null }[]) {
        const user = p.clients?.user_id ?? null;
        if (!user && !test) continue;
        const cle = `veille:${r.id}:${p.client_id}:${r.debut}`;
        if (!(await reserver(cle, 'rappel_veille', p.client_id))) continue;
        if (await notif(co, user, 'rdv_rappel', notifVeille(r, co.nom), '/client')) compter('veille');
        else await liberer(cle);
        if (test) break;
      }
    }
  }

  // ---------- 4. Bienvenue : mail le jour de l'accès, notifications à J+2 et J+7 ----------
  if (actif('bienvenue') && (test || (ici.heure >= 9 && ici.heure < 20))) {
    const { data: clients } = await db.from('clients').select('id, coach_id, prenom, email, user_id').not('user_id', 'is', null).eq('actif', true);
    const seuil = test ? 0 : Date.parse(depuis('bienvenue') ?? new Date().toISOString());
    let exemples = 0;
    for (const c of clients ?? []) {
      if (test && exemples) break;
      const { data: u } = await db.auth.admin.getUserById(c.user_id!);
      const cree = Date.parse(u?.user?.created_at ?? '');
      if (!test && !(cree >= seuil)) continue;
      const co = await coach(c.coach_id);
      const age = (maintenant - cree) / JOUR;
      const a = [0, 2, 7].filter((n) => test || (n <= age && age < n + 3));
      for (const n of a) {
        const cle = `bienvenue:${c.id}:${n}`;
        if (!(await reserver(cle, 'bienvenue', c.id))) continue;
        const ok = n === 0
          ? !!c.email && (await mail(co, c.email, c.prenom, mailBienvenue(c.prenom, co.nom, `${site}/client`), 'bienvenue'))
          : await notif(co, c.user_id, 'bienvenue', n === 2 ? notifBienvenueJ2 : notifBienvenueJ7, n === 2 ? '/client?onglet=programme' : '/client?onglet=suivi');
        if (ok) compter(`bienvenue_${n}`);
        else await liberer(cle);
      }
      exemples++;
    }
  }

  // ---------- 5. Rapport du lundi, à 7 h, au coach seul ----------
  if (actif('rapport_hebdo') && (test || (ici.lundi && ici.heure >= 7))) {
    const lundiPasse = plusJours(ici.date, ici.lundi ? -7 : -((new Date(`${ici.date}T12:00:00Z`).getUTCDay() + 6) % 7) - 7);
    const { data: liste } = await db.from('coachs').select('id');
    for (const { id } of liste ?? []) {
      const co = await coach(id);
      if (!co.email) continue;
      const cle = `rapport:${id}:${lundiPasse}`;
      if (!(await reserver(cle, 'rapport_hebdo'))) continue;
      const { data: r, error } = await db.rpc('rapport_hebdo', { p_coach: id, p_debut: lundiPasse });
      const ok = !error && (await mail(co, co.email, co.nom, mailRapport(r as Rapport, co.nom, `${site}/coach`), 'rapport_hebdo'));
      if (error) erreurs.push(`rapport : ${error.message}`);
      if (ok) compter('rapport');
      else await liberer(cle);
    }
  }

  if (erreurs.length) console.error(erreurs.join('\n'));
  return repondre({ mode: test ? 'test' : 'normal', envoyes: bilan, erreurs });
});
