-- Lot 2 : champs de la configuration d'origine (Champs-CRM.json) pour la fiche Contact et l'éditeur Booster.
-- Ajouts seulement : les colonnes existantes et leurs données restent telles quelles.

-- Statut affiché choisi par le coach ; null = il suit l'étape du parcours (colonne statut).
alter table public.contacts add column if not exists statut_crm text
  check (statut_crm in ('Nouveau Prospect', 'Booster planifié', 'Booster réalisé', 'En réflexion', 'Client actif',
                        'Coaching terminé', 'A relancer', 'Perdu'));
alter table public.contacts add column if not exists objectif_principal text;
alter table public.contacts add column if not exists prochaine_action text;
alter table public.contacts add column if not exists offre_vendue text;

alter table public.boosters add column if not exists nom text;
-- Statuts ouverts choisis par le coach ; Terminée / Annulée découlent de statut (fait / annule).
alter table public.boosters add column if not exists statut_crm text
  check (statut_crm in ('À préparer', 'Questionnaire reçu', 'En cours', 'Terminée', 'Annulée'));
alter table public.boosters add column if not exists resume_ia text;
alter table public.boosters add column if not exists points_attention text;
alter table public.boosters add column if not exists offre_recommandee text;
alter table public.boosters add column if not exists resultat_commercial text;
alter table public.boosters add column if not exists date_relance date;
-- Réservées au coach : le compte rendu envoyé au client ne les reprend pas.
alter table public.boosters add column if not exists notes_internes text;
