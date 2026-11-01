// Mails de l'agenda, envoyés par Brevo. Appelée toutes les 15 minutes par une tâche planifiée (pg_cron + pg_net) avec
// l'en-tête « x-agenda-cle » égal au secret AGENDA_CLE. Chaque envoi est noté sur le rendez-vous (ou le pack) : un mail
// n'est jamais envoyé deux fois, et un échec est retenté au passage suivant.
//   · invitation (ou nouvelle date) avec .ics, dès qu'un rendez-vous est posé ou déplacé ;
//   · relance 48 h avant si personne n'a répondu ; rappel N h avant (24 h par défaut) ; rappel court 2 h avant si activé ;
//   · annulation par le coach (.ics qui retire l'événement) ; alerte au coach quand un client refuse ou annule ;
//   · fin de pack : quand il reste le seuil de séances (2 par défaut) ou moins, une seule fois par pack.
// Secrets : BREVO_API_KEY, EXPEDITEUR_EMAIL (adresse validée dans Brevo), ADRESSE_WEB (site de l'app), AGENDA_CLE.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { corpsBrevoAgenda, fichierIcs, mailCoachPrevenu, mailFinDePack, mailRendezVous, type ContenuMail, type GenreMail, type InfosRdv } from '../_shared/agenda-mails.ts';
import { API_BREVO, lireReponseBrevo } from '../_shared/envoi-email.ts';

const HEURE = 3_600_000;
const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

type Reglages = { delai_annulation_heures: number; rappel_heures: number; rappel_court: boolean; seuil_fin_pack: number };
const DEFAUT: Reglages = { delai_annulation_heures: 24, rappel_heures: 24, rappel_court: false, seuil_fin_pack: 2 };

Deno.serve(async (req) => {
  const secret = Deno.env.get('AGENDA_CLE');
  if (!secret || req.headers.get('x-agenda-cle') !== secret) return repondre({ erreur: 'Accès refusé.' }, 401);
  const cleBrevo = Deno.env.get('BREVO_API_KEY');
  const expediteur = Deno.env.get('EXPEDITEUR_EMAIL');
  const site = (Deno.env.get('ADRESSE_WEB') ?? '').replace(/\/+$/, '');
  if (!cleBrevo || !expediteur || !/^https:\/\//.test(site)) return repondre({ erreur: 'BREVO_API_KEY, EXPEDITEUR_EMAIL ou ADRESSE_WEB manquant.' }, 503);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const maintenant = Date.now();
  const bilan: Record<string, number> = {};
  const compter = (k: string) => (bilan[k] = (bilan[k] ?? 0) + 1);

  // Coachs : nom, adresse de réponse (e-mail de connexion) et réglages.
  const coachs = new Map<string, { nom: string; email?: string; reglages: Reglages }>();
  async function coach(id: string) {
    if (coachs.has(id)) return coachs.get(id)!;
    const { data: c } = await db.from('coachs').select('nom, user_id').eq('id', id).single();
    const { data: r } = await db.from('reglages_agenda').select('delai_annulation_heures, rappel_heures, rappel_court, seuil_fin_pack').eq('coach_id', id).maybeSingle();
    const { data: u } = c?.user_id ? await db.auth.admin.getUserById(c.user_id) : { data: null };
    const valeur = { nom: c?.nom ?? 'Ton coach', email: u?.user?.email ?? undefined, reglages: (r as Reglages | null) ?? DEFAUT };
    coachs.set(id, valeur);
    return valeur;
  }

  /** E-mail d'un client : sa fiche, sinon son contact dans le carnet du coach. */
  async function email(clientId: string) {
    const { data: c } = await db.from('clients').select('email, prenom, contacts(email)').eq('id', clientId).single();
    const contacts = (c?.contacts ?? []) as { email: string | null }[];
    return { email: c?.email || contacts.find((x) => x.email)?.email || undefined, prenom: (c?.prenom as string) ?? '' };
  }

  async function envoyer(a: string, nom: string, m: ContenuMail, options: { ics?: string; repondreA?: string; tag: string; coachNom: string }) {
    const r = await fetch(API_BREVO, {
      method: 'POST',
      signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': cleBrevo! },
      body: JSON.stringify(corpsBrevoAgenda({ email: expediteur!, nom: options.coachNom }, { email: a, nom }, m, options)),
    }).catch(() => null);
    if (!r) return false;
    const lu = lireReponseBrevo(r.status, await r.text());
    if (lu.etat !== 'envoye' && lu.etat !== 'transmis') console.error(`agenda-mails : ${lu.detail}`);
    return lu.etat === 'envoye' || lu.etat === 'transmis';
  }

  const { data: liste, error } = await db
    .from('rendez_vous')
    .select('id, coach_id, type, debut, fin, lieu, lien_visio, statut, annule_par, jeton, cree_le, maj_le, invitation_envoyee_le, relance_envoyee_le, rappel_envoye_le, rappel_court_envoye_le, annulation_envoyee_le, coach_prevenu_le, rendez_vous_participants(client_id, clients(prenom))')
    .gte('debut', new Date(maintenant - 2 * HEURE).toISOString())
    .lte('debut', new Date(maintenant + 60 * 24 * HEURE).toISOString());
  if (error) return repondre({ erreur: error.message }, 500);

  for (const r of liste ?? []) {
    const co = await coach(r.coach_id);
    const participants = (r.rendez_vous_participants ?? []) as { client_id: string; clients: { prenom: string } | null }[];
    const debut = new Date(r.debut).getTime();
    const avant = debut - maintenant;
    const ouvert = r.statut === 'propose' || r.statut === 'confirme';
    const infos = (pour: string): InfosRdv => ({
      id: r.id,
      type: r.type,
      debut: r.debut,
      fin: r.fin,
      lieu: r.lieu,
      lienVisio: r.lien_visio ?? undefined,
      coach: co.nom,
      lien: `${site}/rdv/${r.jeton}`,
      avec: participants.filter((p) => p.client_id !== pour).map((p) => p.clients?.prenom).filter(Boolean).join(', ') || undefined,
      delaiAnnulationHeures: co.reglages.delai_annulation_heures,
    });
    // Séquence .ics : change à chaque nouvelle version, pour que l'agenda du client remplace l'ancien événement.
    const sequence = Math.floor(new Date(r.maj_le).getTime() / 1000) - Math.floor(new Date(r.cree_le).getTime() / 1000);

    /** Envoie à chaque personne inscrite ; la colonne n'est notée que si tous les envois sont partis. */
    async function aTous(genre: GenreMail, colonne: string, ics?: { annule?: boolean }) {
      let ok = true;
      for (const p of participants) {
        const dest = await email(p.client_id);
        if (!dest.email) continue;
        const contenu = mailRendezVous(genre, dest.prenom, infos(p.client_id));
        const fichier = ics ? fichierIcs(infos(p.client_id), { sequence, annule: ics.annule }) : undefined;
        ok = (await envoyer(dest.email, dest.prenom, contenu, { ics: fichier, repondreA: co.email, tag: genre, coachNom: co.nom })) && ok;
      }
      if (ok) {
        await db.from('rendez_vous').update({ [colonne]: new Date().toISOString() }).eq('id', r.id);
        compter(genre);
      }
    }

    if (avant <= 0) continue;
    if (r.statut === 'propose' && !r.invitation_envoyee_le) {
      // Déplacé après création : « nouvelle date » plutôt qu'une première invitation.
      const deplace = new Date(r.maj_le).getTime() - new Date(r.cree_le).getTime() > 60_000;
      await aTous(deplace ? 'modification' : 'invitation', 'invitation_envoyee_le', {});
      continue;
    }
    if (r.statut === 'annule' && r.annule_par === 'coach' && !r.annulation_envoyee_le && r.invitation_envoyee_le) {
      await aTous('annulation', 'annulation_envoyee_le', { annule: true });
      continue;
    }
    if ((r.statut === 'refuse' || (r.statut === 'annule' && r.annule_par === 'client')) && !r.coach_prevenu_le && co.email) {
      const noms = participants.map((p) => p.clients?.prenom).filter(Boolean).join(' et ');
      if (await envoyer(co.email, co.nom, mailCoachPrevenu(co.nom, noms || 'Un client', r.statut === 'refuse' ? 'refuse' : 'annule', r.debut), { tag: 'coach', coachNom: 'CoachGo' })) {
        await db.from('rendez_vous').update({ coach_prevenu_le: new Date().toISOString() }).eq('id', r.id);
        compter('coach');
      }
      continue;
    }
    if (!ouvert) continue;
    if (co.reglages.rappel_court && avant <= 2 * HEURE && !r.rappel_court_envoye_le) {
      await aTous('rappel_court', 'rappel_court_envoye_le');
    } else if (avant <= co.reglages.rappel_heures * HEURE && !r.rappel_envoye_le) {
      await aTous('rappel', 'rappel_envoye_le');
    } else if (r.statut === 'propose' && avant <= 48 * HEURE && !r.relance_envoyee_le && r.invitation_envoyee_le && maintenant - new Date(r.invitation_envoyee_le).getTime() > 12 * HEURE) {
      await aTous('relance', 'relance_envoyee_le');
    }
  }

  // Fin de pack : packs entamés à N séances ou moins de la fin, alerte pas encore envoyée.
  const { data: packs } = await db
    .from('packs_seances')
    .select('id, coach_id, client_id, seances_total, seances_faites, packs_partages(client_id)')
    .is('alerte_fin_envoyee_le', null)
    .gt('seances_total', 1)
    .gt('seances_faites', 0);
  for (const p of packs ?? []) {
    const co = await coach(p.coach_id);
    const restantes = p.seances_total - p.seances_faites;
    if (restantes > co.reglages.seuil_fin_pack) continue;
    let ok = true;
    for (const id of [p.client_id, ...((p.packs_partages ?? []) as { client_id: string }[]).map((x) => x.client_id)]) {
      const dest = await email(id);
      if (dest.email) ok = (await envoyer(dest.email, dest.prenom, mailFinDePack(dest.prenom, co.nom, restantes), { repondreA: co.email, tag: 'fin_pack', coachNom: co.nom })) && ok;
    }
    if (ok) {
      await db.from('packs_seances').update({ alerte_fin_envoyee_le: new Date().toISOString() }).eq('id', p.id);
      compter('fin_pack');
    }
  }

  return repondre({ envoyes: bilan });
});
