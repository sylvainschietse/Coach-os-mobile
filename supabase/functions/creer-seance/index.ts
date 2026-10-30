// Assistant de création de séance : le coach décrit sa séance, Claude la compose avec les exercices de la
// bibliothèque (jamais d'exercice inventé). Rien n'est enregistré ici : l'app montre la proposition, le coach valide.
// La clé Claude reste dans les secrets Supabase (ANTHROPIC_API_KEY).

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

const PHASES = ['Échauffement', 'Principal', 'Finisher', 'Retour au calme'] as const;

const Proposition = z.object({
  titre: z.string().describe('Titre court de la séance, sans code.'),
  consignes: z.string().describe('2 à 4 phrases pour le client : déroulé, intention, RIR visé.'),
  blocs: z
    .array(
      z.object({
        titre: z.string(),
        lignes: z.array(
          z.object({
            exercice: z.number().int().describe('Numéro de l’exercice dans la bibliothèque fournie.'),
            series: z.number().int(),
            repetitions: z.string().optional().describe('« 8–10 », « 12 », « 10 par côté ». Vide pour un exercice au temps.'),
            dureeS: z.number().int().optional().describe('Durée de travail en secondes, pour un exercice au temps.'),
            recuperationS: z.number().int(),
            rir: z.number().int().optional(),
            consignes: z.string().optional(),
            phase: z.enum(PHASES),
          }),
        ),
      }),
    )
    .describe('Les blocs dans l’ordre de la séance.'),
  remarque: z.string().optional().describe('Ce que tu n’as pas pu respecter dans la demande (exercice absent de la bibliothèque…).'),
});

const CONSIGNES = `Tu aides un coach sportif à construire une séance de musculation ou de remise en forme pour ses clients. Le coach décrit ce qu'il veut ; tu proposes la séance complète, en français. Le coach la relira et la modifiera avant de l'enregistrer.

Trame habituelle du coach (à suivre sauf si la demande dit autre chose) :
1. Mobilité spécifique aux mouvements du jour (1 ou 2 exercices).
2. Gainage : deux exercices au temps, en alternance 20 s de travail / 10 s de repos, 4 tours (même nombre de séries et même durée pour les deux, recuperationS = 10).
3. Mouvement de référence : un polyarticulaire lourd.
4. Compléments : au moins deux autres polyarticulaires (la séance compte au moins 3 polyarticulaires au total).
5. Isolation : 1 ou 2 exercices.
6. Cardio en fin de séance si la demande ou l'objectif s'y prête.

Règles :
- N'utilise QUE les exercices de la bibliothèque fournie, par leur numéro. Si un exercice demandé n'existe pas, prends le plus proche et dis-le dans « remarque ».
- Séries entre 1 et 8, récupération entre 0 et 600 secondes, RIR entre 0 et 5.
- Un exercice au temps a dureeS et pas de répétitions ; un exercice aux répétitions a repetitions et pas de dureeS.
- Adapte volume et intensité au niveau, à l'objectif et à la durée indiqués. Sans indication : niveau intermédiaire, 60 minutes.
- Respecte le matériel disponible s'il est précisé.
- Si une douleur ou une blessure est mentionnée, choisis des variantes prudentes et signale-le dans les consignes, sans diagnostic.
- Titres de blocs courts (« Mobilité », « Gainage en alternance », « Mouvement de référence », « Compléments », « Isolation », « Cardio »).`;

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

interface ExerciceBase {
  id: string;
  nom: string;
  mesures: string[];
  video_url: string | null;
  famille: string | null;
  pattern: string | null;
  materiel: string[] | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { demande?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return repondre({ erreur: 'La clé Claude n’est pas encore enregistrée sur le serveur (secret ANTHROPIC_API_KEY).' }, 503);
  const claude = new Anthropic({ apiKey: cle });

  const demande = corps.demande?.trim() ?? '';
  if (demande.length < 5 || demande.length > 2000) return repondre({ erreur: 'Décris la séance en quelques phrases (2000 caractères au plus).' }, 400);

  // Le jeton du coach : seules les lignes qu'il a le droit de lire sont renvoyées.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: coachId } = await db.rpc('mon_coach_id');
  if (!coachId) return repondre({ erreur: 'Réservé au coach connecté.' }, 403);

  const exercices: ExerciceBase[] = [];
  for (let debut = 0; ; debut += 1000) {
    const { data, error } = await db
      .from('exercices')
      .select('id, nom, mesures, video_url, famille, pattern, materiel')
      .eq('actif', true)
      .order('nom')
      .range(debut, debut + 999);
    if (error) return repondre({ erreur: 'La bibliothèque d’exercices n’a pas pu être lue.' }, 500);
    exercices.push(...(data as ExerciceBase[]));
    if (data.length < 1000) break;
  }
  if (!exercices.length) return repondre({ erreur: 'La bibliothèque d’exercices est vide.' }, 400);

  const bibliotheque = exercices
    .map((e, i) => [i + 1, e.nom, e.famille, e.pattern, e.materiel?.join(', '), e.mesures.includes('duree') ? 'au temps possible' : ''].filter(Boolean).join(' | '))
    .join('\n');

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(Proposition) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: CONSIGNES },
        // La bibliothèque change peu : elle est mise en cache d'une demande à l'autre.
        { type: 'text', text: `Bibliothèque d'exercices (numéro | nom | famille | schéma moteur | matériel) :\n${bibliotheque}`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: `Demande du coach :\n${demande}` }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'La proposition n’a pas abouti. Reformule ta demande, ou crée la séance à la main.' }, 502);
    }
    const p = reponse.parsed_output;
    const ecartes: number[] = [];
    const blocs = p.blocs
      .map((b) => ({
        titre: b.titre,
        lignes: b.lignes.flatMap((l) => {
          const e = exercices[l.exercice - 1];
          if (!e) return ecartes.push(l.exercice), [];
          return [{ ...l, exercice: { id: e.id, nom: e.nom, mesures: e.mesures, videoUrl: e.video_url ?? undefined } }];
        }),
      }))
      .filter((b) => b.lignes.length);
    return repondre({ titre: p.titre, consignes: p.consignes, blocs, remarque: p.remarque, ecartes: ecartes.length });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'La clé Claude du serveur est absente ou invalide.' }, 500);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service Claude indisponible (${e.status}).` }, 502);
    throw e;
  }
});
