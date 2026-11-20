-- Après un Booster, le coach range la personne en « Client actif » ou « En veille » (rien pris pour l'instant).
alter table public.contacts drop constraint contacts_statut_crm_check;
alter table public.contacts add constraint contacts_statut_crm_check check (statut_crm = any (array[
  'Nouveau Prospect', 'Booster planifié', 'Booster réalisé', 'En réflexion', 'Client actif', 'Coaching terminé', 'A relancer', 'Perdu', 'En veille'
]));

-- Le suivi n'a plus de durée : il dure jusqu'à ce que le coach l'arrête. La colonne reste pour les suivis existants.
alter table public.suivis alter column duree_mois drop not null;
