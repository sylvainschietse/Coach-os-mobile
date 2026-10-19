-- Données de démonstration pour le prototype (aucune donnée réelle).
-- Avant de lancer ce fichier : créer dans Supabase > Authentication trois comptes
-- avec ces e-mails (ou remplacer les e-mails ci-dessous par les vôtres).
--   coach@demo.coachos.fr   (Sylvain, coach)
--   lea@demo.coachos.fr     (Léa, cliente)
--   thomas@demo.coachos.fr  (Thomas, client)

insert into public.coachs (id, user_id, nom)
select '00000000-0000-4000-8000-000000000001', id, 'Sylvain'
from auth.users where email = 'coach@demo.coachos.fr';

insert into public.clients (id, coach_id, user_id, prenom, nom, email)
select '00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', id, 'Léa', 'Martin', email
from auth.users where email = 'lea@demo.coachos.fr';

insert into public.clients (id, coach_id, user_id, prenom, nom, email)
select '00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000001', id, 'Thomas', 'Bernard', email
from auth.users where email = 'thomas@demo.coachos.fr';

insert into public.exercices (id, nom, mesures) values
  ('00000000-0000-4000-8000-000000000101', 'Mobilité épaules (bâton)', '{repetitions}'),
  ('00000000-0000-4000-8000-000000000102', 'Gainage planche', '{duree}'),
  ('00000000-0000-4000-8000-000000000103', 'Crunch', '{repetitions}'),
  ('00000000-0000-4000-8000-000000000104', 'Développé couché barre', '{charge,repetitions}'),
  ('00000000-0000-4000-8000-000000000105', 'Développé incliné haltères', '{charge,repetitions}'),
  ('00000000-0000-4000-8000-000000000106', 'Dips', '{charge,repetitions}'),
  ('00000000-0000-4000-8000-000000000107', 'Curl barre EZ', '{charge,repetitions}'),
  ('00000000-0000-4000-8000-000000000108', 'Rameur', '{duree,distance,allure500}');

-- Une séance « pecs-biceps » inspirée des principes du dossier, pour chaque client.
do $$
declare
  c record;
  s uuid;
  b1 uuid; b2 uuid; b3 uuid; b4 uuid;
begin
  for c in select id, coach_id from public.clients where coach_id = '00000000-0000-4000-8000-000000000001' loop
    insert into public.seances (coach_id, client_id, titre, date_prevue, consignes)
    values (c.coach_id, c.id, 'Pecs · Biceps', current_date,
            'Contrôle la descente sur les exercices de base. Note en fin de séance comment tu t''es senti.')
    returning id into s;

    insert into public.blocs (seance_id, ordre, titre) values (s, 1, 'Échauffement') returning id into b1;
    insert into public.blocs (seance_id, ordre, titre, minuteur) values (s, 2, 'Abdos en circuit',
      '{"exercices":2,"travailS":40,"reposS":20,"tours":3,"reposEntreToursS":60}') returning id into b2;
    insert into public.blocs (seance_id, ordre, titre) values (s, 3, 'Renforcement') returning id into b3;
    insert into public.blocs (seance_id, ordre, titre) values (s, 4, 'Finisher cardio') returning id into b4;

    insert into public.lignes (bloc_id, ordre, exercice_id, series, repetitions_min, recuperation_s, consignes) values
      (b1, 1, '00000000-0000-4000-8000-000000000101', 2, 10, 30, 'Amplitude progressive');
    insert into public.lignes (bloc_id, ordre, exercice_id, series, duree_s, recuperation_s) values
      (b2, 1, '00000000-0000-4000-8000-000000000102', 3, 40, 30);
    insert into public.lignes (bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max, recuperation_s) values
      (b2, 2, '00000000-0000-4000-8000-000000000103', 2, 15, 20, 30);
    insert into public.lignes (bloc_id, ordre, exercice_id, series, repetitions_min, repetitions_max, charge_indicative, recuperation_s, rir, tempo) values
      (b3, 1, '00000000-0000-4000-8000-000000000104', 4, 8, 12, 40, 120, 2, '3-0-1'),
      (b3, 2, '00000000-0000-4000-8000-000000000105', 3, 10, 12, 14, 90, 2, null),
      (b3, 3, '00000000-0000-4000-8000-000000000106', 3, 8, 12, 0, 90, 1, null),
      (b3, 4, '00000000-0000-4000-8000-000000000107', 3, 10, 12, 20, 60, 1, null);
    insert into public.lignes (bloc_id, ordre, exercice_id, series, duree_s, recuperation_s, consignes, minuteur) values
      (b4, 1, '00000000-0000-4000-8000-000000000108', 1, 360, 0, '6 sprints de 30 s, 30 s tranquille entre chaque. Note la distance totale.',
       '{"exercices":6,"travailS":30,"reposS":30,"tours":1,"reposEntreToursS":0}');
  end loop;
end $$;
