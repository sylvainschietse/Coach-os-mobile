// Recette dictée : le client ou le coach raconte sa recette à voix haute (ou la colle), Claude la range en champs
// (titre, portions, temps, ingrédients pesés, étapes). Rien n'est enregistré ici : l'app relie chaque ingrédient à la
// base d'aliments, montre le résultat, et la personne corrige puis enregistre.
// La clé Claude reste dans les secrets Supabase (ANTHROPIC_API_KEY). Le texte n'est ni stocké ni journalisé.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

import { NOMS_CIQUAL } from './noms-ciqual.ts';

const CONTIENT = ['viande', 'poisson', 'fruits_de_mer', 'oeuf', 'lait', 'gluten', 'miel'] as const;

const RecetteLue = z.object({
  titre: z.string().describe('Nom court de la recette. Vide si la dictée ne le dit pas et qu’on ne peut pas le deviner.'),
  portions: z.number().int().optional().describe('Nombre de portions, seulement s’il est dit ou évident (« pour deux »).'),
  tempsMin: z.number().int().optional().describe('Temps total de préparation et cuisson, en minutes, s’il est dit.'),
  ingredients: z
    .array(
      z.object({
        nom: z.string().describe('Nom de l’ingrédient tel qu’on l’écrirait dans une recette (« Flocons d’avoine », « Œufs »).'),
        ciqual: z
          .string()
          .optional()
          .describe('Le nom exact, recopié de la table Ciqual fournie, de l’aliment qui correspond le mieux (cru si on le pèse cru). Vide si aucun ne convient.'),
        recherche: z
          .string()
          .describe('Deux ou trois mots pour chercher l’aliment, au singulier (« flocon avoine », « whey vanille »).'),
        quantiteG: z
          .number()
          .describe('Quantité pour la recette entière, en grammes (ml pour un liquide). Convertis les pièces et cuillères : 1 œuf ≈ 55 g, 1 c. à soupe d’huile ≈ 10 g.'),
        kcal: z.number().describe('Calories pour 100 g, valeur moyenne de référence (table Ciqual).'),
        proteines: z.number().describe('Protéines en g pour 100 g.'),
        glucides: z.number().describe('Glucides en g pour 100 g.'),
        lipides: z.number().describe('Lipides en g pour 100 g.'),
        contient: z.array(z.enum(CONTIENT)).describe('Ce que l’ingrédient contient parmi la liste (pour les régimes).'),
      }),
    )
    .describe('Un élément par ingrédient cité, dans l’ordre de la dictée.'),
  etapes: z.string().describe('Les étapes de préparation, une par ligne, numérotées « 1. », « 2. »… Vide si la dictée n’en parle pas.'),
  remarque: z.string().optional().describe('Une phrase si une quantité n’est pas dite (tu l’as estimée) ou si quelque chose est ambigu.'),
});

const CONSIGNES = `Tu aides un coach sportif et ses clients à saisir une recette. On t'envoie le texte d'une recette dictée à voix haute : il peut contenir des hésitations, des répétitions, des fautes de transcription (« sang » pour « cent »).
Range-la en champs.
Règles :
- Ne garde que ce qui est dit. N'ajoute pas d'ingrédient, sauf s'il est nommé dans les étapes (« on fait revenir dans un peu d'huile » : huile, 5 g).
- Une quantité non dite est estimée de façon réaliste pour le nombre de portions, et signalée dans la remarque.
- Les étapes reprennent les mots de la personne, remis au propre, sans rien inventer.
- Si le texte n'est pas une recette, renvoie une liste d'ingrédients vide et explique-le dans la remarque.
- Pour chaque ingrédient, choisis dans la table Ciqual ci-dessous l'aliment le plus proche, en recopiant son nom à l'identique. Préfère la version nature et courante (« Banane, chair sans peau, crue », « Sel blanc alimentaire… ») et l'état dans lequel on le pèse (cru, sec). Sans équivalent (produit de marque, whey…), laisse ce champ vide.
- Pas de conseil nutritionnel.`;

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
  if (texte.length < 10) return repondre({ erreur: 'Raconte un peu plus ta recette : les ingrédients et leurs quantités.' }, 400);
  if (texte.length > 8000) return repondre({ erreur: 'Le texte est trop long : garde une seule recette.' }, 400);

  // Réservé aux clients et aux coachs connectés (le jeton de l'app est vérifié par Supabase).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const [{ data: client }, { data: coach }] = await Promise.all([db.rpc('mon_client_id'), db.rpc('mon_coach_id')]);
  if (!client && !coach) return repondre({ erreur: 'Connecte-toi avec ton compte pour remplir la recette.' }, 401);
  // RGPD : le texte d'un client ne part chez Anthropic qu'avec son accord pour l'analyse par l'IA (« Mes données »).
  if (!coach) {
    const { data: accord } = await db.rpc('mon_consentement');
    if (!accord?.analyse_ia) return repondre({ erreur: 'Active d’abord l’analyse par l’IA dans « Mes données ».' }, 403);
  }

  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return repondre({ erreur: 'Le remplissage automatique n’est pas encore activé : la clé Claude manque sur le serveur.' }, 503);
  const claude = new Anthropic({ apiKey: cle });

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 6000,
      output_config: { effort: 'low', format: betaZodOutputFormat(RecetteLue) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // La table ne change pas d'un appel à l'autre : elle reste en cache chez Anthropic, ce qui réduit le coût.
      system: [
        { type: 'text', text: CONSIGNES },
        { type: 'text', text: `Table Ciqual (un nom par ligne) :\n${NOMS_CIQUAL.join('\n')}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: texte }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'Je n’ai pas réussi à lire la recette. Remplis les champs à la main.' }, 502);
    }
    const borne = (v: number, max: number) => Math.min(max, Math.max(0, Math.round(v * 10) / 10));
    const r = reponse.parsed_output;
    return repondre({
      titre: r.titre.trim().slice(0, 120),
      portions: r.portions && r.portions > 0 ? Math.min(50, Math.round(r.portions)) : undefined,
      tempsMin: r.tempsMin && r.tempsMin > 0 ? Math.min(1440, Math.round(r.tempsMin)) : undefined,
      ingredients: r.ingredients
        .filter((i) => i.nom.trim() && i.quantiteG > 0)
        .slice(0, 40)
        .map((i) => ({
          nom: i.nom.trim().slice(0, 120),
          ciqual: i.ciqual && NOMS_CIQUAL.includes(i.ciqual) ? i.ciqual : undefined,
          recherche: i.recherche.trim().slice(0, 80),
          quantiteG: Math.round(Math.min(i.quantiteG, 5000)),
          kcal: Math.round(borne(i.kcal, 900)),
          proteines: borne(i.proteines, 100),
          glucides: borne(i.glucides, 100),
          lipides: borne(i.lipides, 100),
          contient: [...new Set(i.contient)],
        })),
      etapes: r.etapes.trim().slice(0, 6000),
      remarque: r.remarque?.trim() || undefined,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'Le remplissage automatique n’est pas encore activé (clé Claude du serveur absente).' }, 503);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service indisponible (${e.status}).` }, 502);
    throw e;
  }
});
