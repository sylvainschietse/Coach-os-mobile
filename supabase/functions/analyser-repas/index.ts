// Estime, à partir de la photo d'un repas, les aliments et leurs quantités, avec leurs valeurs pour 100 g.
// La clé Claude reste ici, dans les secrets Supabase (ANTHROPIC_API_KEY) : jamais dans l'app.
// L'image n'est ni stockée ni journalisée : elle sert à cette seule analyse.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

const Estimation = z.object({
  aliments: z
    .array(
      z.object({
        nom: z.string().describe('Nom courant de l’aliment en français, avec la cuisson si elle compte (ex. « Riz blanc cuit »).'),
        quantiteG: z.number().describe('Quantité estimée dans l’assiette, en grammes (ou ml pour une boisson).'),
        kcal: z.number().describe('Calories pour 100 g, valeur moyenne de référence (table Ciqual).'),
        proteines: z.number().describe('Protéines en g pour 100 g.'),
        glucides: z.number().describe('Glucides en g pour 100 g.'),
        lipides: z.number().describe('Lipides en g pour 100 g.'),
        confiance: z.enum(['haute', 'moyenne', 'basse']).describe('Confiance dans l’identification et la quantité.'),
      }),
    )
    .describe('Un élément par aliment visible. Une sauce ou une huile visible compte comme un aliment.'),
  remarque: z.string().optional().describe('Une phrase si quelque chose limite l’estimation (photo floue, plat caché, portion difficile à juger).'),
});

const CONSIGNES = `Tu aides le client d'un coach sportif à tenir son journal alimentaire. On t'envoie la photo de son repas.
Identifie chaque aliment visible, estime la quantité dans l'assiette en grammes à partir des repères visuels (taille de l'assiette, des couverts, épaisseur), et donne ses valeurs nutritionnelles moyennes pour 100 g, telles que dans la table Ciqual de l'ANSES.
Règles :
- Ne liste que ce que tu vois. N'ajoute pas un aliment probable mais invisible ; signale-le dans la remarque si c'est important (ex. huile de cuisson).
- Si la photo ne montre pas de nourriture, renvoie une liste vide et explique-le dans la remarque.
- Les quantités sont des estimations : sois réaliste, ni généreux ni avare, et baisse la confiance quand c'est difficile à juger.
- Pas de conseil nutritionnel, pas de jugement sur le repas.`;

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { image?: string; type?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const type = TYPES.find((t) => t === corps.type);
  // Environ 3,5 Mo d'image au plus : l'app envoie une photo réduite à 1024 px.
  if (!corps.image || !type || corps.image.length > 5_000_000) return repondre({ erreur: 'Photo manquante ou trop lourde.' }, 400);

  // Réservé aux clients connectés (le jeton de l'app est vérifié par Supabase).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: client } = await db.rpc('mon_client_id');
  if (!client) return repondre({ erreur: 'Connecte-toi avec ton compte client pour analyser une photo.' }, 401);

  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return repondre({ erreur: 'L’analyse des photos n’est pas encore activée : la clé Claude manque sur le serveur.' }, 503);
  const claude = new Anthropic({ apiKey: cle });

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: betaZodOutputFormat(Estimation) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: CONSIGNES,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: corps.image } },
            { type: 'text', text: 'Voici mon repas.' },
          ],
        },
      ],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'L’analyse n’a pas abouti. Ajoute tes aliments à la main.' }, 502);
    }
    const borne = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * 10) / 10));
    const { aliments, remarque } = reponse.parsed_output;
    return repondre({
      aliments: aliments
        .filter((a) => a.nom.trim() && a.quantiteG > 0)
        .slice(0, 15)
        .map((a) => ({
          nom: a.nom.trim().slice(0, 120),
          quantiteG: Math.round(Math.min(a.quantiteG, 2000)),
          kcal: Math.round(borne(a.kcal, 900)),
          proteines: borne(a.proteines, 100),
          glucides: borne(a.glucides, 100),
          lipides: borne(a.lipides, 100),
          confiance: a.confiance,
        })),
      remarque,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'L’analyse des photos n’est pas encore activée (clé Claude du serveur absente).' }, 503);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service d’analyse indisponible (${e.status}).` }, 502);
    throw e;
  }
});
