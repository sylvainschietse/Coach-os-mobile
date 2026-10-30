-- Relances « prendre des nouvelles » 10 jours et 1 mois après le Booster, tant que le contact n'a pris aucun suivi.
alter table public.relances drop constraint relances_modele_check;
alter table public.relances add constraint relances_modele_check
  check (modele in ('questionnaire', 'booster', 'rappel_booster', 'suivi_booster', 'nouvelles_10j', 'nouvelles_1mois', 'libre', 'tache'));
