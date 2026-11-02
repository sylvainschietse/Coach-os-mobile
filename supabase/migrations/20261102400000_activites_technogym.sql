-- Coach OS · séances des machines de salle (Technogym…) et d'Apple Santé.
-- Un nouveau sport (cardio : elliptique, rameur, escalier…) et une nouvelle source (apple_sante).
-- Rien n'est retiré : les valeurs existantes restent permises, seules les listes autorisées s'allongent.

alter table public.activites_sport drop constraint if exists activites_sport_sport_check;
alter table public.activites_sport add constraint activites_sport_sport_check
  check (sport in ('course', 'trail', 'velo', 'marche', 'randonnee', 'natation', 'cardio', 'musculation', 'cours', 'yoga', 'aquatique',
    'raquette', 'sport_co', 'combat', 'danse', 'glisse', 'autre'));

alter table public.activites_sport drop constraint if exists activites_sport_source_check;
alter table public.activites_sport add constraint activites_sport_source_check
  check (source in ('health_connect', 'apple_sante', 'fichier', 'strava', 'garmin', 'suunto', 'polar', 'manuel'));
