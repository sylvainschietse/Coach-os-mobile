-- Évaluation physique et entretien de la séance Booster (champs repris d'Airtable).
-- evaluation : { tests: { poussee|tirage|jambes|cardio|mobilite|posture: { resultat, observations[], rpe } },
--                douleur, douleurPrecision, notes }
-- entretien : { pourquoiMaintenant, dejaEssaye, freins, attentesCoach, projection, observationsCoach }
-- La synthèse texte reste dans boosters.tests ; compte_rendu porte le mot du coach du compte rendu.
alter table public.boosters
  add column evaluation jsonb,
  add column entretien jsonb,
  add column plan_envoye_le timestamptz;
