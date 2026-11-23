-- Le coach est prévenu sur son téléphone dès qu'une réponse au questionnaire arrive (Tally ou questionnaire de l'app).
-- Un déclencheur appelle la fonction Edge « notifier-questionnaire » (pg_net, appel asynchrone : la réception de la
-- réponse n'attend pas et n'échoue jamais à cause de la notification). notifie_le évite toute double notification.

-- pg_net existe sur Supabase ; ailleurs (base de test), on s'en passe : le déclencheur ne fait alors rien.
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net; end if;
end $$;

alter table public.questionnaires add column if not exists notifie_le timestamptz;
-- Les réponses déjà reçues ne déclenchent rien.
update public.questionnaires set notifie_le = recu_le where notifie_le is null;

create or replace function public._prevenir_coach_questionnaire() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://rxkclcytevhtbpcdozdv.supabase.co/functions/v1/notifier-questionnaire',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('id', new.id)
  );
  return new;
exception when others then
  -- Jamais bloquer l'enregistrement d'une réponse pour une notification.
  return new;
end $$;
revoke execute on function public._prevenir_coach_questionnaire() from public, anon, authenticated;

drop trigger if exists prevenir_coach_questionnaire on public.questionnaires;
create trigger prevenir_coach_questionnaire after insert on public.questionnaires
  for each row execute function public._prevenir_coach_questionnaire();
