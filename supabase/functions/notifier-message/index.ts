// Ancien point d'appel des versions précédentes de l'appli, après l'envoi d'un message.
// Les messages sont désormais notifiés par la base elle-même (déclencheur notif_message → envoyer-notification) :
// cette fonction ne fait plus rien, pour qu'une ancienne version de l'appli ne prévienne pas deux fois.

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });
  return new Response(JSON.stringify({ envoyes: 0 }), { headers: { ...entetes, 'Content-Type': 'application/json' } });
});
