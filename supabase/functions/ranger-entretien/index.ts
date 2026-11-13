// Entretien Booster dicté : le coach raconte l'entretien à voix haute, Claude range ce qui est dit dans les rubriques
// (objectif, antécédents, pourquoi maintenant, déjà essayé, freins, attentes, projection, observations).
// Rien n'est enregistré ici : l'app ajoute le résultat aux champs, le coach relit et corrige avant d'enregistrer.
// La clé Claude reste dans les secrets Supabase (ANTHROPIC_API_KEY). Le texte n'est ni stocké ni journalisé.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

const champ = (description: string) => z.string().describe(`${description} Vide si la dictée n'en parle pas.`);

const EntretienRange = z.object({
  objectif: champ('Ce que le client veut atteindre (perdre du poids, courir un 10 km, se remettre en forme…), avec l’échéance si elle est dite.'),
  antecedents: champ('Santé et passé sportif : blessures, opérations, douleurs, traitements, sports pratiqués avant ou aujourd’hui, niveau.'),
  pourquoiMaintenant: champ('Ce qui le décide maintenant : déclic, événement, date (mariage, vacances, conseil du médecin…).'),
  dejaEssaye: champ('Ce qu’il a déjà essayé (régimes, applis, salle, autre coach) et comment ça s’est passé.'),
  freins: champ('Ce qui peut le freiner : temps, travail, enfants, fatigue, motivation, budget…'),
  attentesCoach: champ('Ce qu’il attend du coach et de l’accompagnement (cadre, suivi, motivation…).'),
  projection: champ('Comment il se voit dans six mois, ce qu’il aimerait avoir changé.'),
  observationsCoach: champ('Ce que le coach a remarqué lui-même pendant la séance, et tout ce qui ne va dans aucune autre rubrique.'),
});

const CONSIGNES = `Tu aides un coach sportif à remplir la fiche d'entretien de sa séance « Booster » (premier rendez-vous avec un client). On t'envoie ce qu'il a dicté à voix haute après la séance : il parle du client à la troisième personne, avec des hésitations, des répétitions et des fautes de transcription.
Range ce qui est dit dans les rubriques.
Règles :
- Ne garde que ce qui est dit. N'invente rien, n'interprète pas, ne donne pas de conseil.
- Chaque information va dans une seule rubrique, la plus juste. Si le coach annonce une rubrique (« objectif : … », « côté freins… »), suis son annonce.
- Une rubrique dont il ne parle pas reste vide.
- Écris au propre, en phrases courtes, avec les mots du coach : corrige la transcription et retire les hésitations, sans changer le sens. Garde la troisième personne.
- Ne mets ni le nom de famille ni les coordonnées du client.`;

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { texte?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const texte = corps.texte?.trim() ?? '';
  if (texte.length < 10) return repondre({ erreur: 'Dicte un peu plus : l’objectif, les antécédents, les freins…' }, 400);
  if (texte.length > 12000) return repondre({ erreur: 'Le texte est trop long : garde un seul entretien.' }, 400);

  // Réservé aux coachs connectés (le jeton de l'app est vérifié par Supabase).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: coach } = await db.rpc('mon_coach_id');
  if (!coach) return repondre({ erreur: 'Réservé au coach connecté.' }, 401);

  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return repondre({ erreur: 'Le rangement automatique n’est pas encore activé : la clé Claude manque sur le serveur.' }, 503);
  const claude = new Anthropic({ apiKey: cle });

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 6000,
      output_config: { effort: 'low', format: betaZodOutputFormat(EntretienRange) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: CONSIGNES,
      messages: [{ role: 'user', content: texte }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'Je n’ai pas réussi à ranger la dictée. Complète les rubriques à la main.' }, 502);
    }
    const propres = Object.entries(reponse.parsed_output)
      .map(([k, v]) => [k, v.trim().slice(0, 3000)] as const)
      .filter(([, v]) => v);
    return repondre({ rubriques: Object.fromEntries(propres) });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'Le rangement automatique n’est pas encore activé (clé Claude du serveur absente).' }, 503);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service indisponible (${e.status}).` }, 502);
    throw e;
  }
});
