-- Évaluation physique et entretien de la séance Booster (champs repris d'Airtable).
-- evaluation : { tests: { poussee|tirage|jambes|cardio|mobilite|posture: { resultat, observations[], rpe } },
--                douleur, douleurPrecision, notes }
-- entretien : { pourquoiMaintenant, dejaEssaye, freins, attentesCoach, projection, observationsCoach }
-- La synthèse texte reste dans boosters.tests.
alter table public.boosters
  add column evaluation jsonb,
  add column entretien jsonb;
