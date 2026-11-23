// Crée (ou renouvelle) le compte d'un client pour qu'il se connecte à l'appli.
// Appelée par le coach depuis la fiche du client ; renvoie l'e-mail et un mot de passe provisoire
// que le client remplacera à sa première connexion. La clé d'administration reste ici, côté serveur.
// Option « emailConnexion » : le client se connecte avec cette adresse (ex. un enfant), et l'e-mail de sa fiche
// (celui du parent) reste l'adresse des factures et des rendez-vous. Chaîne vide = revenir à l'e-mail de la fiche.

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

  let corps: { contactId?: string; emailConnexion?: string };
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
  const emailValide = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const emailFiche = (contact.email ?? '').trim().toLowerCase();

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: client } = await admin.from('clients').select('id, user_id, coach_id, email_connexion').eq('id', contact.client_id).single();
  // Cloisonnement : la fiche client doit être celle de ce coach, pas seulement le contact qui y renvoie.
  const { data: coachId } = await coach.rpc('mon_coach_id');
  if (!client || !coachId || client.coach_id !== coachId) return repondre({ erreur: 'Contact introuvable.' }, 404);

  // Adresse de connexion : celle saisie à part si le coach en donne une, sinon celle déjà retenue, sinon l'e-mail de la fiche.
  let emailConnexion: string | null = client.email_connexion ?? null;
  if (typeof corps.emailConnexion === 'string') {
    const saisie = corps.emailConnexion.trim().toLowerCase();
    if (saisie && !emailValide(saisie)) return repondre({ erreur: 'L’adresse de connexion n’est pas valide.' }, 400);
    emailConnexion = saisie && saisie !== emailFiche ? saisie : null;
  }
  const email = emailConnexion ?? emailFiche;
  if (!emailValide(email)) return repondre({ erreur: 'Ajoute d’abord son e-mail sur sa fiche.' }, 400);
  const garderAdresse = () => admin.from('clients').update({ email_connexion: emailConnexion }).eq('id', client.id);
  const motDePasse = motDePasseProvisoire();
  const meta = { mot_de_passe_provisoire: true };

  if (client?.user_id) {
    // Accès déjà créé : on renouvelle seulement le mot de passe provisoire (mot de passe oublié).
    // L'adresse est notée sur la fiche avant de changer le compte : le changement d'e-mail du compte la fait suivre.
    const { error: fiche } = await garderAdresse();
    if (fiche) return repondre({ erreur: 'Impossible de renouveler son accès.' }, 500);
    const { error } = await admin.auth.admin.updateUserById(client.user_id, { email, password: motDePasse, user_metadata: meta });
    if (error) {
      await admin.from('clients').update({ email_connexion: client.email_connexion ?? null }).eq('id', client.id);
      const existe = /already|exists|registered/i.test(error.message ?? '');
      return repondre(
        { erreur: existe ? 'Un autre compte utilise déjà cette adresse. Choisis-en une autre.' : 'Impossible de renouveler son accès.' },
        existe ? 409 : 500,
      );
    }
    return repondre({ email, motDePasse });
  }

  const { data: cree, error } = await admin.auth.admin.createUser({ email, password: motDePasse, email_confirm: true, user_metadata: meta });
  if (error || !cree.user) {
    const existe = error?.message?.toLowerCase().includes('already');
    return repondre(
      { erreur: existe ? 'Un compte existe déjà avec cet e-mail. Choisis une autre adresse de connexion.' : 'Impossible de créer son accès.' },
      existe ? 409 : 500,
    );
  }
  // Avec une adresse de connexion à part, l'e-mail de la fiche (celui des factures) ne change pas.
  const champs = emailConnexion ? { user_id: cree.user.id, email_connexion: emailConnexion } : { user_id: cree.user.id, email, email_connexion: null };
  const { error: lien } = await admin.from('clients').update(champs).eq('id', client.id);
  if (lien) {
    await admin.auth.admin.deleteUser(cree.user.id);
    return repondre({ erreur: 'Impossible de rattacher le compte à ce client.' }, 500);
  }
  return repondre({ email, motDePasse });
});
