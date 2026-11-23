-- Rappel au coach, sur son téléphone et dans sa cloche, une heure avant chaque séance de son agenda
-- (en plus de Google Agenda). Une fois par rendez-vous, et à nouveau s'il est déplacé.
create table if not exists public.rappels_coach_envoyes (
  rendez_vous_id uuid primary key references public.rendez_vous (id) on delete cascade,
  debut timestamptz not null,
  envoye_le timestamptz not null default now()
);
alter table public.rappels_coach_envoyes enable row level security;
revoke all on public.rappels_coach_envoyes from anon, authenticated;

create or replace function public._rappeler_coachs() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select v.id, v.coach_id, v.type, v.debut, v.lieu, v.lien_visio
    from public.rendez_vous v
    where v.statut in ('propose', 'confirme')
      and v.debut > now() and v.debut <= now() + interval '1 hour'
      and not exists (select 1 from public.rappels_coach_envoyes e where e.rendez_vous_id = v.id and e.debut = v.debut)
  loop
    insert into public.rappels_coach_envoyes (rendez_vous_id, debut) values (r.id, r.debut)
      on conflict (rendez_vous_id) do update set debut = excluded.debut, envoye_le = now();
    perform public.notifier(public._user_coach(r.coach_id), 'rdv_rappel',
      public._type_rdv(r.type) || ' à ' || to_char(r.debut at time zone 'Europe/Paris', 'HH24"h"MI') || ' avec ' || public._prenoms_rdv(r.id),
      case when coalesce(r.lieu, '') <> '' then r.lieu when r.lien_visio is not null then 'En visio' else 'Dans moins d’une heure.' end,
      '/coach?onglet=agenda');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._rappeler_coachs() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notifications-rappel-coach', '*/5 * * * *', 'select public._rappeler_coachs()');
  end if;
end $$;
