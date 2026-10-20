-- Tâches libres sur une fiche (ex. Airtable « Tâches ») : une relance sans message, le texte à faire est dans la note.
alter table public.relances drop constraint relances_modele_check;
alter table public.relances add constraint relances_modele_check
  check (modele in ('questionnaire', 'booster', 'rappel_booster', 'suivi_booster', 'libre', 'tache'));
