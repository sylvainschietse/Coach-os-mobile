// Séance racontée après coup : le client s'est entraîné sans son téléphone, puis dicte ce qu'il a fait (« tirage 50 kilos,
// 10, 10, 9, 8… »). Claude range ce texte série par série, exercice par exercice, d'après la liste des exercices prévus.
// Rien n'est enregistré ici : l'app remplit les blocs, le client relit et valide.
// La clé Claude reste dans les secrets Supabase (ANTHROPIC_API_KEY). Le texte n'est ni stocké ni journalisé.

import Anthropic from 'npm:@anthropic-ai/sdk@0.135.0';
import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.135.0/helpers/beta/zod';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as z from 'npm:zod@4';

const MESURES = ['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts'] as const;
type Mesure = (typeof MESURES)[number];

const SeanceLue = z.object({
  lignes: z
    .array(
      z.object({
        ligneId: z.string().describe('L’identifiant de l’exercice, recopié de la liste fournie.'),
        series: z
          .array(
            z.object({
              charge: z.number().optional().describe('Charge en kg.'),
              repetitions: z.number().int().optional(),
              duree: z.number().int().optional().describe('Durée en secondes.'),
              distance: z.number().optional().describe('Distance en mètres.'),
              calories: z.number().int().optional(),
              watts: z.number().int().optional(),
            }),
          )
          .describe('Une entrée par série, dans l’ordre. Vide si la personne dit seulement que c’était comme prévu.'),
      }),
    )
    .describe('Seulement les exercices dont la personne parle.'),
  note: z.number().int().optional().describe('Ressenti de l’effort de 1 (très facile) à 10 (maximal), seulement s’il est dit ou évident.'),
  commentaire: z.string().optional().describe('Ce qu’elle dit d’autre (douleur, fatigue, machine prise…), remis au propre en une ou deux phrases.'),
});

const CONSIGNES = `Tu aides un coach sportif. Son client s'est entraîné sans son téléphone et raconte sa séance à voix haute, après coup. Le texte vient de la dictée du téléphone : hésitations, répétitions, fautes de transcription (« sang » pour « cent », « dix kilos » écrit en lettres).
On te donne aussi la liste des exercices prévus, avec leur identifiant, le nombre de séries et ce qui se note pour chaque série.
Range ce qui est dit, exercice par exercice, série par série.
Règles :
- Ne note que ce qui est dit. N'invente aucune valeur. Un exercice dont la personne ne parle pas n'apparaît pas.
- Une charge dite une fois vaut pour toute la suite de l'exercice : mets-la sur la première série, la suite la reprendra.
- « Comme prévu », « comme d'habitude » pour un exercice : liste de séries vide.
- Rattache chaque exercice cité au plus proche de la liste, même s'il est dit autrement (« les tirages » pour « Tirage vertical »).
- Les durées en secondes, les distances en mètres, les charges en kilos.
- Le commentaire reprend seulement ce qui intéresse le coach (douleur, difficulté, changement d'exercice), sans conseil.`;

const entetes = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const repondre = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...entetes, 'Content-Type': 'application/json' } });

type LigneADicter = { id: string; nom: string; series: number; mesures: Mesure[] };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: entetes });

  let corps: { texte?: string; lignes?: LigneADicter[] };
  try {
    corps = await req.json();
  } catch {
    return repondre({ erreur: 'Requête illisible.' }, 400);
  }
  const texte = corps.texte?.trim() ?? '';
  if (texte.length < 5) return repondre({ erreur: 'Raconte un peu plus ta séance : les exercices, les charges et les répétitions.' }, 400);
  if (texte.length > 6000) return repondre({ erreur: 'Le texte est trop long : raconte une seule séance.' }, 400);
  const lignes = (Array.isArray(corps.lignes) ? corps.lignes : [])
    .filter((l) => l && typeof l.id === 'string' && typeof l.nom === 'string')
    .slice(0, 60)
    .map((l) => ({
      id: l.id.slice(0, 64),
      nom: l.nom.slice(0, 120),
      series: Math.min(30, Math.max(1, Math.round(Number(l.series) || 1))),
      mesures: (Array.isArray(l.mesures) ? l.mesures : []).filter((m): m is Mesure => (MESURES as readonly string[]).includes(m)),
    }));
  if (!lignes.length) return repondre({ erreur: 'Cette séance n’a pas d’exercice à remplir.' }, 400);

  // Réservé aux clients connectés (le jeton de l'app est vérifié par Supabase).
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: client } = await db.rpc('mon_client_id');
  if (!client) return repondre({ erreur: 'Connecte-toi avec ton compte pour remplir ta séance.' }, 401);
  // RGPD : le texte ne part chez Anthropic qu'avec l'accord du client pour l'analyse par l'IA (« Mes données »).
  const { data: accord } = await db.rpc('mon_consentement');
  if (!accord?.analyse_ia) return repondre({ erreur: 'Active d’abord l’analyse par l’IA dans « Mes données », ou valide tes blocs à la main.' }, 403);

  const cle = Deno.env.get('ANTHROPIC_API_KEY');
  if (!cle) return repondre({ erreur: 'Le remplissage automatique n’est pas encore activé : la clé Claude manque sur le serveur.' }, 503);
  const claude = new Anthropic({ apiKey: cle });
  const liste = lignes.map((l) => `- ${l.id} : ${l.nom} · ${l.series} série${l.series > 1 ? 's' : ''} · à noter : ${l.mesures.join(', ')}`).join('\n');

  try {
    const reponse = await claude.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low', format: betaZodOutputFormat(SeanceLue) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: CONSIGNES,
      messages: [{ role: 'user', content: `Exercices prévus :\n${liste}\n\nCe que la personne raconte :\n${texte}` }],
    });
    if (reponse.stop_reason === 'refusal' || reponse.stop_reason === 'max_tokens' || !reponse.parsed_output) {
      return repondre({ erreur: 'Je n’ai pas réussi à lire ta séance. Valide tes blocs à la main.' }, 502);
    }
    const r = reponse.parsed_output;
    const MAX: Record<Mesure, number> = { charge: 1000, repetitions: 500, duree: 86400, distance: 1000000, calories: 10000, watts: 5000 };
    return repondre({
      lignes: r.lignes
        .map((x) => {
          const l = lignes.find((y) => y.id === x.ligneId);
          if (!l) return null;
          return {
            ligneId: l.id,
            series: x.series.slice(0, l.series).map((s) => {
              const v: Partial<Record<Mesure, number>> = {};
              for (const m of l.mesures) {
                const n = s[m];
                if (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= MAX[m]) v[m] = Math.round(n * 100) / 100;
              }
              return v;
            }),
          };
        })
        .filter(Boolean),
      note: r.note && r.note >= 1 && r.note <= 10 ? r.note : undefined,
      commentaire: r.commentaire?.trim().slice(0, 600) || undefined,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: 'Trop de demandes en même temps, réessaie dans une minute.' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: 'Le remplissage automatique n’est pas encore activé (clé Claude du serveur absente).' }, 503);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: `Service indisponible (${e.status}).` }, 502);
    throw e;
  }
});
