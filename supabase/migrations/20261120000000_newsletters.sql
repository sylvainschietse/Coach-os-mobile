-- Newsletters (Mon profil › Mes newsletters) : le coach écrit un article illustré pour ses clients actifs, ses clients
-- en veille ou les deux, choisit l'envoi par e-mail, par notification ou les deux, et l'heure. La fonction Edge
-- « envoyer-newsletters », appelée toutes les 15 minutes, l'envoie le moment venu, une seule fois par personne.
-- Chaque e-mail porte un lien « Ne plus recevoir ces nouvelles » (obligatoire) : le contact est alors écarté des envois.

-- ---------- Désabonnement, contact par contact ----------
alter table public.contacts add column if not exists newsletter_coupee_le timestamptz;
alter table public.contacts add column if not exists jeton_newsletter uuid not null default gen_random_uuid();
create unique index if not exists contacts_jeton_newsletter on public.contacts (jeton_newsletter);

-- ---------- Les newsletters ----------
create table public.newsletters (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  rubrique text not null default '' check (length(rubrique) <= 60),
  objet text not null check (length(trim(objet)) between 1 and 150),
  chapeau text not null default '' check (length(chapeau) <= 400),
  message text not null check (length(trim(message)) between 1 and 15000),
  -- Chemin de l'illustration dans le compartiment « newsletters » (<coach>/<fichier>.jpg).
  image text check (image is null or image ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]{1,80}$'),
  bouton_libelle text check (bouton_libelle is null or length(bouton_libelle) <= 60),
  bouton_lien text check (bouton_lien is null or bouton_lien ~ '^https://\S+$'),
  cibles text[] not null check (cardinality(cibles) between 1 and 2 and cibles <@ array['clients', 'veille']),
  par_email boolean not null default true,
  par_notif boolean not null default false,
  envoi_le timestamptz,
  etat text not null default 'brouillon' check (etat in ('brouillon', 'programmee', 'en_cours', 'envoyee')),
  envoyee_le timestamptz,
  nb_emails integer not null default 0,
  nb_notifs integer not null default 0,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  check (par_email or par_notif),
  check (etat = 'brouillon' or envoi_le is not null)
);
create index on public.newsletters (coach_id, cree_le desc);
create index on public.newsletters (envoi_le) where etat in ('programmee', 'en_cours');
alter table public.newsletters enable row level security;
-- Le coach lit les siennes ; il ne modifie ou n'efface que ce qui n'est pas encore parti.
create policy "newsletters : lire les miennes" on public.newsletters for select using (coach_id = public.mon_coach_id());
create policy "newsletters : écrire" on public.newsletters for insert
  with check (coach_id = public.mon_coach_id() and etat in ('brouillon', 'programmee'));
create policy "newsletters : modifier avant l'envoi" on public.newsletters for update
  using (coach_id = public.mon_coach_id() and etat in ('brouillon', 'programmee'))
  with check (coach_id = public.mon_coach_id() and etat in ('brouillon', 'programmee'));
create policy "newsletters : effacer avant l'envoi" on public.newsletters for delete
  using (coach_id = public.mon_coach_id() and etat in ('brouillon', 'programmee'));
revoke all on public.newsletters from public, anon, authenticated;
grant select, delete on public.newsletters to authenticated;
-- Les compteurs et la date d'envoi sont écrits par le serveur seul.
grant insert (id, rubrique, objet, chapeau, message, image, bouton_libelle, bouton_lien, cibles, par_email, par_notif, envoi_le, etat)
  on public.newsletters to authenticated;
grant update (rubrique, objet, chapeau, message, image, bouton_libelle, bouton_lien, cibles, par_email, par_notif, envoi_le, etat, maj_le)
  on public.newsletters to authenticated;

-- ---------- Ce qui est parti, personne par personne : jamais deux fois la même newsletter ----------
create table public.newsletters_envois (
  newsletter_id uuid not null references public.newsletters (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  email_le timestamptz,
  notif_le timestamptz,
  primary key (newsletter_id, contact_id)
);
alter table public.newsletters_envois enable row level security;
create policy "envois : ceux de mes newsletters" on public.newsletters_envois for select
  using (exists (select 1 from public.newsletters n where n.id = newsletter_id and n.coach_id = public.mon_coach_id()));
revoke all on public.newsletters_envois from public, anon, authenticated;
grant select on public.newsletters_envois to authenticated;

-- ---------- Qui la reçoit : clients actifs et / ou en veille, jamais un dossier archivé ----------
create function public.destinataires_newsletter(p_id uuid)
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
  )
$$;
revoke execute on function public.destinataires_newsletter(uuid) from public, anon, authenticated;

-- Notification d'une newsletter (genre « newsletter », que le client peut couper dans ses alertes).
create function public.notifier_newsletter(p_user uuid, p_titre text, p_corps text) returns void
language sql security definer set search_path = public as $$
  select public.notifier(p_user, 'newsletter', p_titre, p_corps, '/client')
$$;
revoke execute on function public.notifier_newsletter(uuid, text, text) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.destinataires_newsletter(uuid) to service_role;
    grant execute on function public.notifier_newsletter(uuid, text, text) to service_role;
  end if;
end $$;

-- ---------- Le lien « Ne plus recevoir ces nouvelles », ouvert sans compte ----------
create function public.desabonner_newsletter(p_jeton uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_coach text;
begin
  update public.contacts k set newsletter_coupee_le = coalesce(k.newsletter_coupee_le, now())
  where k.jeton_newsletter = p_jeton
  returning (select nom from public.coachs where id = k.coach_id) into v_coach;
  if v_coach is null then raise exception 'Lien inconnu : vérifie qu’il est complet.'; end if;
  return v_coach;
end $$;
revoke execute on function public.desabonner_newsletter(uuid) from public;
grant execute on function public.desabonner_newsletter(uuid) to anon, authenticated;

-- Le coach réabonne un contact qui le lui demande (fiche du contact).
create function public.reabonner_newsletter(p_contact uuid) returns void
language sql security definer set search_path = public as $$
  update public.contacts set newsletter_coupee_le = null where id = p_contact and coach_id = public.mon_coach_id()
$$;
revoke execute on function public.reabonner_newsletter(uuid) from public, anon;
grant execute on function public.reabonner_newsletter(uuid) to authenticated;

-- ---------- Illustrations : compartiment public (les e-mails doivent pouvoir les afficher), 5 Mo au plus ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('newsletters', 'newsletters', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy "newsletters : le coach dépose ses images" on storage.objects for insert to authenticated
  with check (bucket_id = 'newsletters' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "newsletters : le coach lit ses images" on storage.objects for select to authenticated
  using (bucket_id = 'newsletters' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "newsletters : le coach remplace ses images" on storage.objects for update to authenticated
  using (bucket_id = 'newsletters' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
create policy "newsletters : le coach efface ses images" on storage.objects for delete to authenticated
  using (bucket_id = 'newsletters' and (storage.foldername(name))[1] = public.mon_coach_id()::text);
