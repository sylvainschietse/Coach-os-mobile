// Supprime le compte du client connecté, à sa demande, depuis « Mes données » (exigé par l'App Store et Google Play).
// Efface sa fiche client et tout son suivi (séances, mesures, nutrition, santé, accords), puis son identifiant de connexion.
// Les documents du coach (contrats, factures) et le contact dans son carnet restent chez le coach.

import { createClient } from 'npm:@supabase/supabase-js@2';

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  // Qui demande : uniquement d'après son propre jeton, jamais d'après le corps de la requête.
  const utilisateur = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: moi } = await utilisateur.auth.getUser();
  if (!moi.user) return repondre({ erreur: 'Reconnecte-toi puis réessaie.' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: client } = await admin.from('clients').select('id').eq('user_id', moi.user.id).maybeSingle();
  if (!client) return repondre({ erreur: 'Seul un compte client peut être supprimé ici. Pour un compte coach, écris au support.' }, 403);

  // La fiche d'abord (tout le suivi part avec elle) : si ça échoue, le compte reste intact.
  const { error: fiche } = await admin.from('clients').delete().eq('id', client.id);
  if (fiche) return repondre({ erreur: 'Impossible de supprimer tes données pour le moment.' }, 500);
  const { error } = await admin.auth.admin.deleteUser(moi.user.id);
  if (error) return repondre({ erreur: 'Tes données sont effacées mais ton identifiant n’a pas pu être supprimé. Écris à ton coach.' }, 500);
  return repondre({ supprime: true });
});
