-- Cloche de notifications dans l'appli : l'historique « notifications » devient lisible dans l'appli, avec ce qui est lu.
-- · lue_le : vide tant que la personne ne l'a pas ouverte (pastille de la cloche).
-- · marquer_notifications_lues(ids) : la personne marque les siennes comme lues (toutes si ids est vide).
-- · Les activités ajoutées par le client (séance libre, course de la montre) préviennent aussi le coach.
-- · L'historique est gardé 60 jours.

alter table public.notifications add column if not exists lue_le timestamptz;
create index if not exists notifications_non_lues on public.notifications (user_id) where lue_le is null;

create function public.marquer_notifications_lues(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update public.notifications set lue_le = now()
  where user_id = auth.uid() and lue_le is null and (p_ids is null or id = any (p_ids))
$$;
revoke execute on function public.marquer_notifications_lues(uuid[]) from public, anon;
grant execute on function public.marquer_notifications_lues(uuid[]) to authenticated;

-- Coach : une activité ajoutée par le client. Les imports de la montre ne comptent que s'ils datent de moins de 2 jours
-- (le premier import d'un historique entier ne déclenche pas une avalanche).
create function public._notif_activite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  quoi text := case new.sport
    when 'course' then 'Course' when 'trail' then 'Trail' when 'velo' then 'Vélo' when 'marche' then 'Marche'
    when 'randonnee' then 'Randonnée' when 'natation' then 'Natation' when 'musculation' then 'Musculation'
    when 'cours' then 'Cours collectif' when 'yoga' then 'Yoga' when 'cardio' then 'Cardio' else 'Activité' end;
begin
  if new.retiree then return null; end if;
  if new.source <> 'manuel' and new.debut < now() - interval '2 days' then return null; end if;
  perform public.notifier(public._user_coach(new.coach_id), 'seance_faite',
    public._prenom_client(new.client_id) || case when new.source = 'manuel' then ' a ajouté une séance libre' else ' a fait une activité' end,
    concat_ws(' · ', coalesce(nullif(trim(new.titre), ''), quoi), round(new.duree_s / 60.0) || ' min',
      case when new.distance_m > 0 then replace(to_char(new.distance_m / 1000.0, 'FM9990.0'), '.', ',') || ' km' end),
    public._lien_fiche(new.client_id));
  return null;
exception when others then
  return null;
end $$;
create trigger notif_activite after insert on public.activites_sport for each row execute function public._notif_activite();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notifications-menage', '30 3 * * *', $c$delete from public.notifications where cree_le < now() - interval '60 days'$c$);
  end if;
end $$;
