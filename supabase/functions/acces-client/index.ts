// Crée (ou renouvelle) le compte d'un client pour qu'il se connecte à l'appli.
// Appelée par le coach depuis la fiche du client ; renvoie l'e-mail et un mot de passe provisoire
// que le client remplacera à sa première connexion. La clé d'administration reste ici, côté serveur.

import { createClient } from 'npm:@supabase/supabase-js@2';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

// Sans 0/O ni 1/l/I, pour se lire sans erreur dans un message.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function motDePasseProvisoire() {
  const octets = crypto.getRandomValues(new Uint8Array(12));
  const s = Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { contactId?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  if (!corps.contactId) return repondre({ erreur: 'Contact manquant.' }, 400);

  // Lecture avec le jeton du coach : les règles d'accès garantissent que c'est bien son contact.
  const coach = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: contact } = await coach
    .from('contacts')
    .select('id, prenom, email, client_id')
    .eq('id', corps.contactId)
    .maybeSingle();
  if (!contact) return repondre({ erreur: 'Contact introuvable.' }, 404);
  if (!contact.client_id) return repondre({ erreur: 'Passe d’abord ce contact en client.' }, 400);
  const email = (contact.email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return repondre({ erreur: 'Ajoute d’abord son e-mail sur sa fiche.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: client } = await admin.from('clients').select('id, user_id').eq('id', contact.client_id).single();
  const motDePasse = motDePasseProvisoire();
  const meta = { mot_de_passe_provisoire: true };

  if (client?.user_id) {
    // Accès déjà créé : on renouvelle seulement le mot de passe provisoire (mot de passe oublié).
    const { error } = await admin.auth.admin.updateUserById(client.user_id, { email, password: motDePasse, user_metadata: meta });
    if (error) return repondre({ erreur: 'Impossible de renouveler son accès.' }, 500);
    return repondre({ email, motDePasse });
  }

  const { data: cree, error } = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true, user_metadata: meta });
  if (error || !cree.user) {
    const existe = error?.message?.toLowerCase().includes('already');
    return repondre(
      { erreur: existe ? 'Un compte existe déjà avec cet e-mail. Utilise une autre adresse sur sa fiche.' : 'Impossible de créer son accès.' },
      existe ? 409 : 500,
    );
  }
  const { error: lien } = await admin.from('clients').update({ user_id: cree.user.id, email }).eq('id', client!.id);
  if (lien) {
    await admin.auth.admin.deleteUser(cree.user.id);
    return repondre({ erreur: 'Impossible de rattacher le compte à ce client.' }, 500);
  }
  return repondre({ email, motDePasse });
});
