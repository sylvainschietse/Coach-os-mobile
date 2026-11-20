-- Formules du coaching alignées sur l'offre CoachGo ; Essentiel et Premium restent lisibles pour l'historique.
alter table public.coachings drop constraint coachings_formule_check;
alter table public.coachings add constraint coachings_formule_check
  check (formule in ('Appli', 'Appli + nutrition', 'Séances', 'Essentiel', 'Premium'));
