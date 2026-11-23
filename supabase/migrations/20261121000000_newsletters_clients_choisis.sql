-- Newsletters : en plus des groupes (clients actifs, en veille), le coach peut choisir un ou plusieurs contacts précis.
-- Une newsletter vise au moins un groupe ou au moins un contact ; un dossier archivé ne reçoit jamais rien.
alter table public.newsletters add column if not exists contacts_choisis uuid[] not null default '{}';
alter table public.newsletters drop constraint if exists newsletters_cibles_check;
alter table public.newsletters add constraint newsletters_cibles_check
  check (cardinality(cibles) <= 2 and cibles <@ array['clients', 'veille']);
alter table public.newsletters add constraint newsletters_destinataires_check
  check (cardinality(cibles) > 0 or cardinality(contacts_choisis) between 1 and 500);

grant insert (contacts_choisis), update (contacts_choisis) on public.newsletters to authenticated;

create or replace function public.destinataires_newsletter(p_id uuid)
returns table (contact_id uuid, prenom text, email text, user_id uuid, jeton uuid, desabonne boolean)
language sql stable security definer set search_path = public as $$
  select k.id, k.prenom, coalesce(nullif(trim(k.email), ''), nullif(trim(cl.email), '')), cl.user_id, k.jeton_newsletter,
         k.newsletter_coupee_le is not null
  from public.newsletters n
  join public.contacts k on k.coach_id = n.coach_id
  left join public.clients cl on cl.id = k.client_id
  where n.id = p_id and k.statut <> 'archive' and (
    ('veille' = any (n.cibles) and k.statut_crm = 'En veille')
    or ('clients' = any (n.cibles) and k.statut = 'client' and coalesce(k.statut_crm, '') <> 'En veille')
    or k.id = any (n.contacts_choisis)
  )
$$;
revoke execute on function public.destinataires_newsletter(uuid) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.destinataires_newsletter(uuid) to service_role;
  end if;
end $$;
