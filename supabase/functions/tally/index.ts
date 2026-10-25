// Reçoit chaque réponse du questionnaire Tally historique (tally.so/r/81Ye7r) sans passer par Make.
// URL du webhook à renseigner dans Tally : <projet>/functions/v1/tally?coach=<lien du questionnaire du coach>
// La signature Tally (secret TALLY_SIGNING_SECRET, saisi par le coach dans les secrets Supabase) est vérifiée ;
// la base fait le rapprochement (téléphone puis e-mail, jamais le nom) et ignore une réponse déjà reçue.
// Aucune clé d'administration : la fonction appelle les mêmes fonctions publiques que le formulaire de l'app.

import { createClient } from 'npm:@supabase/supabase-js@2';

import { reponsesDepuisTally } from '../_shared/tally.ts';

const repondre = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'Content-Type': 'application/json' } });

async function signatureValide(corps: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const attendu = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(corps)))));
  if (attendu.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < attendu.length; i++) diff |= attendu.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return repondre({ erreur: 'Méthode non prise en charge.' }, 405);
  const lien = new URL(req.url).searchParams.get('coach') ?? '';
  const secret = Deno.env.get('TALLY_SIGNING_SECRET');
  if (!lien || !secret) return repondre({ erreur: 'Webhook Tally non configuré.' }, 503);

  const corps = await req.text();
  // Sans signature valide, rien n'est écrit ni noté : n'importe qui pourrait appeler cette adresse.
  if (!(await signatureValide(corps, req.headers.get('tally-signature'), secret))) return repondre({ erreur: 'Signature invalide.' }, 401);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  let envoi = '';
  try {
    const w = JSON.parse(corps);
    if (w?.data?.responseId) envoi = `tally:${w.data.responseId}`;
    const r = reponsesDepuisTally(w);
    envoi = r.envoi;
    const { data, error } = await db.rpc('recevoir_questionnaire_externe', { p_lien: lien, p_envoi: r.envoi, p_reponses: r.reponses });
    if (error) throw new Error(error.message);
    return repondre({ etat: data, ignorees: r.ignorees });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    // Visible du coach dans Automatisations (« traitement en erreur »). Tally renvoie la réponse plus tard sur un code 5xx.
    if (envoi) await db.rpc('noter_erreur_questionnaire', { p_lien: lien, p_envoi: envoi, p_detail: detail });
    return repondre({ erreur: detail }, /introuvable/.test(detail) ? 404 : 422);
  }
});
