// Rédige les textes développés du compte rendu Booster avec Claude.
// La clé Claude reste ici, dans les secrets Supabase (ANTHROPIC_API_KEY) : jamais dans l'app.
// Appelée par l'app avec le dossier de la séance (prénom, bilan, entretien, tests) ; renvoie du JSON.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

const TESTS = ['poussee', 'tirage', 'jambes', 'cardio', 'mobilite', 'posture'] as const;

const Redaction = z.object({
  regard: z.string().describe('Le regard du coach : un paragraphe de 4 à 6 phrases, bilan honnête et encourageant.'),
  tests: z
    .array(z.object({ test: z.enum(TESTS), explication: z.string() }))
    .describe('Une entrée par test qui a un résultat sur l’échelle, et seulement ceux-là.'),
  priorites: z
    .array(z.object({ titre: z.string(), explication: z.string() }))
    .describe('Exactement trois priorités, dans l’ordre.'),
  semaine: z.array(z.string()).describe('3 à 5 actions concrètes pour cette semaine.'),
  suite: z.array(z.string()).describe('3 ou 4 prochaines étapes de l’accompagnement, quelques mots chacune.'),
});

const CONSIGNES = `Tu rédiges, au nom d'un coach sportif, le compte rendu remis à son client après la séance « Booster » (bilan, tests physiques, entretien). Le client le lira en PDF : il doit comprendre où il en est, ce que veulent dire ses résultats et comment on va travailler. Le ton est chaleureux, direct et motivant, en français, au tutoiement, à la première personne du coach. Pas d'emoji, pas de jargon.

Ce que tu écris :
- regard : le regard du coach sur la séance. Points forts réels, points à travailler (physique et habitudes de vie), lien avec l'objectif du client, encouragement. 4 à 6 phrases.
- tests : pour chaque test qui a un résultat évalué, 2 à 4 phrases : ce que montre le résultat et les observations notées, ce que ça veut dire pour le client, puis la direction du travail à venir.
- priorites : trois priorités. Elles sont déterminées par l'application à partir des tests et du bilan : garde leurs intitulés tels quels, dans leur ordre, et complète seulement s'il en manque. Un intitulé tient en quelques mots. L'explication fait 2 ou 3 phrases : pourquoi c'est important pour ce client et ce qu'on va faire.
- semaine : des actions simples et concrètes que le client peut faire dès cette semaine, tirées de son bilan (sommeil, hydratation, alimentation, organisation des séances…). Formule-les à l'infinitif.
- suite : les prochaines étapes de l'accompagnement, en quelques mots chacune.

Règles :
- Appuie-toi uniquement sur le dossier. N'invente aucun fait, aucune mesure, aucun chiffre.
- Le coach évalue de façon qualitative : ne donne aucun score global, aucune note, aucun barème.
- Ne décris ni exercices précis, ni durées, ni séries, ni charges : donne une direction de travail, le coach construira le programme.
- Un test « non renseigné », « Non réalisé », « Non adapté » ou « Non évalué » n'est pas commenté comme un résultat ; « non renseigné » veut dire que le coach n'a rien saisi.
- Si une douleur, une blessure ou une contre-indication est signalée, reste prudent : on adapte, on respecte les sensations, et le client en parle à un professionnel de santé si besoin. Aucun diagnostic.
- N'écris ni le nom de famille, ni les coordonnées du client.`;

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

const claude = new Anthropic(); // lit ANTHROPIC_API_KEY dans les secrets

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { boosterId?: string; dossier?: string };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  if (!corps.boosterId || !corps.dossier || corps.dossier.length > 30_000) return repondre({ erreur: 'Dossier manquant.' }, 400);

  // Seul le coach de ce Booster peut lancer la rédaction (les règles d'accès de la base s'appliquent à son jeton).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: booster } = await db.from('boosters').select('id').eq('id', corps.boosterId).maybeSingle();
  if (!booster) return repondre({ erreur: 'Booster introuvable.' }, 404);

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: { effort: 'medium', format: betaZodOutputFormat(Redaction) },
      // En cas de refus par les filtres de sécurité, l'API retente sur le modèle de repli recommandé.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: CONSIGNES,
      messages: [{ role: 'user', content: `Voici le dossier de la séance.\n\n${corps.dossier}` }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'La rédaction n’a pas abouti. Réessaie, ou écris les textes toi-même.' }, 502);
    }
    const r = reponse.parsed_output;
    return repondre({
      regard: r.regard,
      tests: Object.fromEntries(r.tests.map((t) => [t.test, t.explication])),
      titresPriorites: r.priorites.slice(0, 3).map((p) => p.titre),
      priorites: r.priorites.slice(0, 3).map((p) => p.explication),
      semaine: r.semaine,
      suite: r.suite,
      source: 'ia',
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'La clé Claude du serveur est absente ou invalide.' }, 500);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service Claude indisponible (${e.status}).` }, 502);
    throw e;
  }
});
