// Le client connecté corrige lui-même son e-mail, son téléphone et son adresse postale (pour ses factures) depuis « Mon compte ».
// Le nouvel e-mail devient aussi son identifiant de connexion, et la fiche contact du coach suit.

import { createClient } from 'npm:@supabase/supabase-js@2';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

// Mêmes règles que src/domain/crm.ts (normaliserEmail, normaliserTelephone).
function normaliserEmail(brut: unknown): string | undefined {
  const e = typeof brut === 'string' ? brut.trim().toLowerCase() : '';
  return e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : undefined;
}
function normaliserTelephone(brut: unknown): string | undefined {
  if (typeof brut !== 'string' || !brut) return undefined;
  let chiffres = brut.replace(/[^\d+]/g, '');
  if (chiffres.startsWith('+')) chiffres = chiffres.slice(1);
  else if (chiffres.startsWith('00')) chiffres = chiffres.slice(2);
  else if (chiffres.startsWith('0') && chiffres.length === 10) chiffres = `33${chiffres.slice(1)}`;
  chiffres = chiffres.replace(/\D/g, '');
  if (chiffres.startsWith('330')) chiffres = `33${chiffres.slice(3)}`;
  return chiffres.length >= 9 && chiffres.length <= 15 ? chiffres : undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { email?: unknown; telephone?: unknown; adresse?: unknown };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }

  // Qui demande : uniquement d'après son propre jeton, jamais d'après le corps de la requête.
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await utilisateur.auth.getUser();
  if (!moi.user) return repondre({ erreur: 'Reconnecte-toi puis réessaie.' }, 401);

  const email = normaliserEmail(corps.email);
  if (!email) return repondre({ erreur: 'Cette adresse e-mail n’est pas reconnue.' }, 400);
  const telephoneSaisi = typeof corps.telephone === 'string' && corps.telephone.trim() !== '';
  const telephone = normaliserTelephone(corps.telephone);
  if (telephoneSaisi && !telephone) return repondre({ erreur: 'Ce numéro de téléphone n’est pas reconnu.' }, 400);

  const adresse = typeof corps.adresse === 'string' ? corps.adresse.trim().slice(0, 300) : '';

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: client } = await admin.from('clients').select('id, email').eq('user_id', moi.user.id).maybeSingle();
  if (!client) return repondre({ erreur: 'Seul un compte client peut modifier ses coordonnées ici.' }, 403);

  // L'identifiant de connexion d'abord : s'il est refusé (adresse déjà prise), rien d'autre ne change.
  const ancien = (moi.user.email ?? '').toLowerCase();
  if (email !== ancien) {
    const { error } = await admin.auth.admin.updateUserById(moi.user.id, { email, email_confirm: true });
    if (error) {
      const prise = /already|exists|registered/i.test(error.message ?? '');
      return repondre({ erreur: prise ? 'Un autre compte utilise déjà cet e-mail.' : 'Impossible de changer ton e-mail pour le moment.' }, prise ? 409 : 500);
    }
  }

  const champs = { email, telephone: telephone ?? null, adresse: adresse || null };
  const { error: fiche } = await admin.from('clients').update(champs).eq('id', client.id);
  if (fiche) {
    if (email !== ancien) await admin.auth.admin.updateUserById(moi.user.id, { email: ancien, email_confirm: true });
    return repondre({ erreur: 'Impossible d’enregistrer tes coordonnées pour le moment.' }, 500);
  }
  // Le carnet du coach suit, pour que ses messages et l'accès partent à la bonne adresse.
  await admin.from('contacts').update(champs).eq('client_id', client.id);
  return repondre(champs);
});
