-- Page d'offre partagée (audit design, point 1) : le coach présente sa spécialité et un avis client.
-- Les trois champs sont facultatifs ; la page publique ne les affiche que s'ils sont remplis.
-- Lus par la fonction abonnement-stripe (action « voir », clé service) : aucune lecture publique de la table.

alter table public.coachs add column if not exists specialite text
  check (specialite is null or length(specialite) <= 120);
alter table public.coachs add column if not exists avis_client text
  check (avis_client is null or length(avis_client) <= 400);
alter table public.coachs add column if not exists avis_auteur text
  check (avis_auteur is null or length(avis_auteur) <= 80);

grant update (specialite, avis_client, avis_auteur) on public.coachs to authenticated;
