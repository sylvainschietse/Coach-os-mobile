-- Agenda du coach (étape 1) : rendez-vous posés sur un ou plusieurs clients (duo, couple), confirmés ou refusés par eux,
-- annulables jusqu'à 24 h avant (au-delà : par téléphone, saisi par le coach). Une séance passée et non annulée se compte
-- toute seule : décomptée du pack (une fois par pack, même partagé), ou sinon ajoutée aux paiements « En attente » au
-- tarif de chacun, partagé entre les personnes présentes ce jour-là. Le coach peut corriger.
-- Les mails (invitation, relance, rappels, fin de pack) partent de la fonction Edge `agenda-mails`.

-- Réglages de l'agenda, une ligne par coach (créée au premier enregistrement ; sinon les valeurs par défaut s'appliquent).
create table public.reglages_agenda (
  coach_id uuid primary key default public.mon_coach_id() references public.coachs (id) on delete cascade,
  duree_minutes int not null default 60 check (duree_minutes between 15 and 240),
  -- Temps laissé libre entre deux rendez-vous (trajet), pour l'alerte de chevauchement.
  tampon_minutes int not null default 0 check (tampon_minutes between 0 and 120),
  delai_annulation_heures int not null default 24 check (delai_annulation_heures between 0 and 168),
  rappel_heures int not null default 24 check (rappel_heures between 1 and 72),
  -- Second rappel court, 2 h avant.
  rappel_court boolean not null default false,
  -- Alerte « fin de pack » quand il reste ce nombre de séances (ou moins).
  seuil_fin_pack int not null default 2 check (seuil_fin_pack between 0 and 10),
  -- Un client sans rendez-vous ni séance depuis ce nombre de jours remonte comme inactif.
  inactivite_jours int not null default 21 check (inactivite_jours between 7 and 120),
  lieu_defaut text not null default ''
);
alter table public.reglages_agenda enable row level security;
create policy "coach : ses réglages d'agenda" on public.reglages_agenda for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
revoke all on public.reglages_agenda from anon, authenticated;
grant select, insert, update on public.reglages_agenda to authenticated;

-- Pack partagé (couple, amis) : chaque séance faite par l'un ou l'autre se décompte une fois du même pack.
create table public.packs_partages (
  pack_id uuid not null references public.packs_seances (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  primary key (pack_id, client_id)
);
create index packs_partages_client on public.packs_partages (client_id);
alter table public.packs_partages enable row level security;
create policy "coach : partages de ses packs" on public.packs_partages for all
  using (exists (select 1 from public.packs_seances p where p.id = pack_id and p.coach_id = public.mon_coach_id()))
  with check (
    exists (select 1 from public.packs_seances p where p.id = pack_id and p.coach_id = public.mon_coach_id() and p.client_id <> packs_partages.client_id)
    and public.est_mon_client(client_id)
  );
create policy "client : ses partages" on public.packs_partages for select using (client_id = public.mon_client_id());
revoke all on public.packs_partages from anon, authenticated;
grant select, insert, delete on public.packs_partages to authenticated;

-- Le client voit aussi les packs partagés avec lui.
create function public.pack_partage_avec_moi(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.packs_partages where pack_id = p and client_id = public.mon_client_id())
$$;
revoke execute on function public.pack_partage_avec_moi(uuid) from public, anon;
grant execute on function public.pack_partage_avec_moi(uuid) to authenticated;
drop policy "client : ses packs" on public.packs_seances;
create policy "client : ses packs" on public.packs_seances for select
  using (client_id = public.mon_client_id() or public.pack_partage_avec_moi(id));

-- Alerte « fin de pack » déjà envoyée au client : une seule fois par pack.
alter table public.packs_seances add column alerte_fin_envoyee_le timestamptz;


-- Tarif de la séance à l'unité, client par client (60 € par défaut, au cas par cas sinon).
alter table public.clients add column tarif_seance numeric(8, 2) not null default 60 check (tarif_seance between 0 and 10000);

create table public.rendez_vous (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  -- seance et visio se comptent (pack ou paiement) ; appel (point téléphonique) non.
  type text not null default 'seance' check (type in ('seance', 'visio', 'appel')),
  debut timestamptz not null,
  fin timestamptz not null,
  lieu text not null default '',
  lien_visio text check (lien_visio is null or lien_visio ~ '^https://'),
  note text not null default '',
  -- propose : en attente de réponse ; annule_tard : annulation à moins de 24 h, saisie par le coach après un appel.
  statut text not null default 'propose'
    check (statut in ('propose', 'confirme', 'refuse', 'annule', 'annule_tard', 'absent', 'realise')),
  annule_par text check (annule_par in ('client', 'coach')),
  -- Vrai quand la séance a été comptée (pack décompté ou paiement à l'unité créé) : voir rendez_vous_participants.
  compte boolean not null default false,
  -- Rendez-vous créés ensemble (« tous les mardis pendant 10 semaines »).
  serie_id uuid,
  -- Lien des mails (confirmer, refuser, annuler) sans connexion.
  jeton uuid not null default gen_random_uuid() unique,
  invitation_envoyee_le timestamptz,
  relance_envoyee_le timestamptz,
  rappel_envoye_le timestamptz,
  rappel_court_envoye_le timestamptz,
  annulation_envoyee_le timestamptz,
  coach_prevenu_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  check (fin > debut and fin - debut <= interval '8 hours')
);
create index rendez_vous_coach_debut on public.rendez_vous (coach_id, debut);

-- Une ou plusieurs personnes par rendez-vous (duo, couple, petit groupe). Ce qui a été compté pour chacune y est noté.
create table public.rendez_vous_participants (
  rendez_vous_id uuid not null references public.rendez_vous (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Pack d'où vient la séance (décomptée par cette personne, ou par l'autre personne du même pack partagé).
  pack_id uuid references public.packs_seances (id) on delete set null,
  decompte boolean not null default false,
  -- Séance à l'unité : sa part du prix et la ligne « En attente » créée dans Paiements.
  montant numeric(8, 2),
  paiement_id uuid references public.paiements (id) on delete set null,
  primary key (rendez_vous_id, client_id)
);
create index rendez_vous_participants_client on public.rendez_vous_participants (client_id);

create function public.mon_rendez_vous(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rendez_vous_participants where rendez_vous_id = p and client_id = public.mon_client_id())
$$;
create function public.rendez_vous_du_coach(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rendez_vous where id = p and coach_id = public.mon_coach_id())
$$;
create function public.rendez_vous_compte(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select compte from public.rendez_vous where id = p), false)
$$;
revoke execute on function public.mon_rendez_vous(uuid), public.rendez_vous_du_coach(uuid), public.rendez_vous_compte(uuid) from public, anon;
grant execute on function public.mon_rendez_vous(uuid), public.rendez_vous_du_coach(uuid), public.rendez_vous_compte(uuid) to authenticated;

alter table public.rendez_vous enable row level security;
create policy "coach : lire ses rendez-vous" on public.rendez_vous for select using (coach_id = public.mon_coach_id());
create policy "coach : créer un rendez-vous" on public.rendez_vous for insert
  with check (coach_id = public.mon_coach_id() and statut = 'propose' and not compte);
create policy "coach : modifier un rendez-vous" on public.rendez_vous for update
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
-- Un rendez-vous déjà compté ne se supprime pas : le coach le passe d'abord en « annulé » (pack recrédité, paiement retiré).
create policy "coach : supprimer un rendez-vous" on public.rendez_vous for delete using (coach_id = public.mon_coach_id() and not compte);
create policy "client : ses rendez-vous" on public.rendez_vous for select using (public.mon_rendez_vous(id));

alter table public.rendez_vous_participants enable row level security;
create policy "coach : lire les participants" on public.rendez_vous_participants for select using (public.rendez_vous_du_coach(rendez_vous_id));
create policy "coach : ajouter un participant" on public.rendez_vous_participants for insert
  with check (public.rendez_vous_du_coach(rendez_vous_id) and public.est_mon_client(client_id) and not public.rendez_vous_compte(rendez_vous_id));
create policy "coach : retirer un participant" on public.rendez_vous_participants for delete
  using (public.rendez_vous_du_coach(rendez_vous_id) and not public.rendez_vous_compte(rendez_vous_id));
create policy "client : sa participation" on public.rendez_vous_participants for select using (client_id = public.mon_client_id());

-- Le coach modifie le contenu ; le statut et le comptage passent par changer_statut_rendez_vous, qui tient packs et paiements à jour.
-- Supabase donne tous les droits par défaut sur une nouvelle table : on les retire avant d'accorder les seules colonnes utiles.
revoke all on public.rendez_vous, public.rendez_vous_participants from anon, authenticated;
grant select, delete on public.rendez_vous to authenticated;
grant insert (id, type, debut, fin, lieu, lien_visio, note, serie_id) on public.rendez_vous to authenticated;
grant update (type, debut, fin, lieu, lien_visio, note) on public.rendez_vous to authenticated;
grant select, delete on public.rendez_vous_participants to authenticated;
grant insert (rendez_vous_id, client_id) on public.rendez_vous_participants to authenticated;

-- Date ou heure changée : nouvelle invitation à reconfirmer, les rappels repartent de zéro.
create function public.rendez_vous_modifie() returns trigger
language plpgsql set search_path = public as $$
begin
  new.maj_le := now();
  if new.debut is distinct from old.debut or new.fin is distinct from old.fin then
    new.invitation_envoyee_le := null;
    new.relance_envoyee_le := null;
    new.rappel_envoye_le := null;
    new.rappel_court_envoye_le := null;
    if old.statut in ('confirme', 'refuse') then new.statut := 'propose'; end if;
  end if;
  return new;
end $$;
create trigger rendez_vous_modifie before update on public.rendez_vous for each row execute function public.rendez_vous_modifie();

-- Délai d'annulation du coach (24 h si non réglé).
create function public.delai_annulation(p_coach uuid) returns interval
language sql stable security definer set search_path = public as $$
  select make_interval(hours => coalesce((select delai_annulation_heures from public.reglages_agenda where coach_id = p_coach), 24))
$$;
revoke execute on function public.delai_annulation(uuid) from public, anon;
grant execute on function public.delai_annulation(uuid) to authenticated;

-- Compte la séance pour chaque personne présente :
-- · un pack (le sien ou un pack partagé avec elle) : une séance retirée, une seule fois par pack et par rendez-vous ;
-- · sans pack : sa part du prix (son tarif divisé par le nombre de personnes ce jour-là) devient une ligne « En attente ».
create function public._compter_rendez_vous(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rendez_vous;
  pr record;
  p uuid;
  n int;
  tarif numeric;
  part numeric;
  contact uuid;
  pai uuid;
begin
  select * into r from public.rendez_vous where id = p_id for update;
  if r.compte or r.type = 'appel' then return; end if;
  select count(*) into n from public.rendez_vous_participants where rendez_vous_id = p_id;
  for pr in
    select rp.client_id, c.prenom, c.tarif_seance from public.rendez_vous_participants rp
    join public.clients c on c.id = rp.client_id
    where rp.rendez_vous_id = p_id order by c.prenom, rp.client_id
  loop
    -- Pack déjà décompté pour ce rendez-vous par l'autre personne du même pack.
    select rp.pack_id into p from public.rendez_vous_participants rp
    join public.packs_seances ps on ps.id = rp.pack_id
    where rp.rendez_vous_id = p_id and rp.decompte
      and (ps.client_id = pr.client_id or exists (select 1 from public.packs_partages pp where pp.pack_id = ps.id and pp.client_id = pr.client_id))
    limit 1;
    if p is not null then
      update public.rendez_vous_participants set pack_id = p where rendez_vous_id = p_id and client_id = pr.client_id;
      continue;
    end if;
    select ps.id into p from public.packs_seances ps
    where ps.coach_id = r.coach_id
      and ps.seances_faites < ps.seances_total
      and (ps.client_id = pr.client_id or exists (select 1 from public.packs_partages pp where pp.pack_id = ps.id and pp.client_id = pr.client_id))
    order by ps.achete_le, ps.cree_le
    limit 1
    for update;
    if p is not null then
      update public.packs_seances set seances_faites = seances_faites + 1 where id = p;
      update public.rendez_vous_participants set pack_id = p, decompte = true where rendez_vous_id = p_id and client_id = pr.client_id;
    else
      tarif := pr.tarif_seance;
      part := round(tarif / greatest(n, 1), 2);
      select id into contact from public.contacts where client_id = pr.client_id limit 1;
      insert into public.paiements (coach_id, titre, contact_id, date, montant, statut, reference)
      values (
        r.coach_id,
        'Séance du ' || to_char(r.debut at time zone 'Europe/Paris', 'DD/MM') || ' · ' || pr.prenom || case when n > 1 then ' (à ' || n || ')' else '' end,
        contact, (r.debut at time zone 'Europe/Paris')::date, part, 'En attente', 'seance:' || p_id || ':' || pr.client_id
      )
      returning id into pai;
      update public.rendez_vous_participants set montant = part, paiement_id = pai where rendez_vous_id = p_id and client_id = pr.client_id;
    end if;
  end loop;
  update public.rendez_vous set compte = true where id = p_id;
end $$;

-- Défait le comptage : séances rendues aux packs, lignes de paiement encore « En attente » retirées.
create function public._decompter_rendez_vous(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pr record;
begin
  perform 1 from public.rendez_vous where id = p_id for update;
  for pr in select * from public.rendez_vous_participants where rendez_vous_id = p_id loop
    if pr.decompte and pr.pack_id is not null then
      update public.packs_seances set seances_faites = greatest(seances_faites - 1, 0) where id = pr.pack_id;
    end if;
    if pr.paiement_id is not null then
      delete from public.paiements where id = pr.paiement_id and statut = 'En attente';
    end if;
  end loop;
  update public.rendez_vous_participants set pack_id = null, decompte = false, montant = null, paiement_id = null where rendez_vous_id = p_id;
  update public.rendez_vous set compte = false where id = p_id;
end $$;
revoke execute on function public._compter_rendez_vous(uuid) from public, anon, authenticated;
revoke execute on function public._decompter_rendez_vous(uuid) from public, anon, authenticated;

-- Coach : change le statut d'un rendez-vous. Réalisé : compté ; absent ou annulé tard : compté si p_compter ;
-- annulé, proposé ou confirmé : ce qui avait été compté est défait.
create function public.changer_statut_rendez_vous(p_id uuid, p_statut text, p_compter boolean default true) returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.rendez_vous;
begin
  select * into r from public.rendez_vous where id = p_id and coach_id = public.mon_coach_id() for update;
  if r.id is null then raise exception 'Rendez-vous introuvable.'; end if;
  if p_statut not in ('propose', 'confirme', 'annule', 'annule_tard', 'absent', 'realise') then
    raise exception 'Statut inconnu : %', p_statut;
  end if;
  perform public._decompter_rendez_vous(p_id);
  update public.rendez_vous set
    statut = p_statut,
    annule_par = case when p_statut = 'annule' then 'coach' when p_statut = 'annule_tard' then 'client' else null end,
    annulation_envoyee_le = case when p_statut = 'annule' and r.statut <> 'annule' then null else annulation_envoyee_le end
  where id = p_id;
  if p_statut = 'realise' or (p_statut in ('annule_tard', 'absent') and p_compter) then
    perform public._compter_rendez_vous(p_id);
  end if;
end $$;
revoke execute on function public.changer_statut_rendez_vous(uuid, text, boolean) from public, anon;
grant execute on function public.changer_statut_rendez_vous(uuid, text, boolean) to authenticated;

-- Rendez-vous terminés et non annulés : passés en « réalisé » et comptés. p_coach null : tous les coachs (tâche planifiée).
create function public._cloturer_rendez_vous(p_coach uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.rendez_vous
    where statut in ('propose', 'confirme') and fin <= now() and (p_coach is null or coach_id = p_coach)
    order by debut
  loop
    update public.rendez_vous set statut = 'realise' where id = r.id;
    perform public._compter_rendez_vous(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._cloturer_rendez_vous(uuid) from public, anon, authenticated;

-- Appelée par l'app du coach à l'ouverture de l'agenda, en plus de la tâche planifiée.
create function public.cloturer_mes_rendez_vous() returns int
language sql security definer set search_path = public as $$
  select case when public.mon_coach_id() is null then 0 else public._cloturer_rendez_vous(public.mon_coach_id()) end
$$;
revoke execute on function public.cloturer_mes_rendez_vous() from public, anon;
grant execute on function public.cloturer_mes_rendez_vous() to authenticated;

-- Réponse d'une personne inscrite, depuis l'app ou depuis le lien du mail. Actions : confirme, refuse, annule.
-- Annuler n'est possible que jusqu'au délai du coach (24 h par défaut) ; ensuite, on appelle le coach.
create function public._agir_rendez_vous(r public.rendez_vous, p_action text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if r.debut <= now() then raise exception 'Ce rendez-vous est déjà passé.'; end if;
  if p_action in ('confirme', 'refuse') then
    if r.statut not in ('propose', 'confirme', 'refuse') then raise exception 'Ce rendez-vous a été annulé.'; end if;
    update public.rendez_vous set statut = p_action, coach_prevenu_le = case when p_action = 'refuse' then null else coach_prevenu_le end
    where id = r.id;
    return p_action;
  elsif p_action = 'annule' then
    if r.statut not in ('propose', 'confirme') then raise exception 'Ce rendez-vous n’est plus à venir.'; end if;
    if r.debut - now() < public.delai_annulation(r.coach_id) then
      raise exception 'Trop tard pour annuler en ligne : appelle ton coach.';
    end if;
    update public.rendez_vous set statut = 'annule', annule_par = 'client', coach_prevenu_le = null where id = r.id;
    return 'annule';
  end if;
  raise exception 'Action inconnue : %', p_action;
end $$;
revoke execute on function public._agir_rendez_vous(public.rendez_vous, text) from public, anon, authenticated;

create function public.repondre_rendez_vous(p_id uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rendez_vous;
begin
  select * into r from public.rendez_vous where id = p_id and public.mon_rendez_vous(id) for update;
  if r.id is null then raise exception 'Rendez-vous introuvable.'; end if;
  return public._agir_rendez_vous(r, p_action);
end $$;
revoke execute on function public.repondre_rendez_vous(uuid, text) from public, anon;
grant execute on function public.repondre_rendez_vous(uuid, text) to authenticated;

-- Client connecté : ses rendez-vous avec le prénom des autres personnes inscrites.
create function public.mes_rendez_vous()
returns table (id uuid, type text, debut timestamptz, fin timestamptz, lieu text, lien_visio text, statut text, avec text, annulable_jusqu_au timestamptz)
language sql stable security definer set search_path = public as $$
  select r.id, r.type, r.debut, r.fin, r.lieu, r.lien_visio, r.statut,
    (select string_agg(c.prenom, ', ' order by c.prenom) from public.rendez_vous_participants o join public.clients c on c.id = o.client_id
      where o.rendez_vous_id = r.id and o.client_id <> public.mon_client_id()),
    r.debut - public.delai_annulation(r.coach_id)
  from public.rendez_vous r
  where public.mon_rendez_vous(r.id)
  order by r.debut
$$;
revoke execute on function public.mes_rendez_vous() from public, anon;
grant execute on function public.mes_rendez_vous() to authenticated;

-- Page ouverte depuis le mail, sans compte : seulement ce qu'il faut pour répondre.
create function public.rendez_vous_par_jeton(p_jeton uuid)
returns table (prenoms text, coach text, telephone text, type text, debut timestamptz, fin timestamptz, lieu text, lien_visio text, statut text, annulable_jusqu_au timestamptz)
language sql stable security definer set search_path = public as $$
  select
    (select string_agg(c.prenom, ' et ' order by c.prenom) from public.rendez_vous_participants o join public.clients c on c.id = o.client_id where o.rendez_vous_id = r.id),
    co.nom, co.telephone, r.type, r.debut, r.fin, r.lieu, r.lien_visio, r.statut, r.debut - public.delai_annulation(r.coach_id)
  from public.rendez_vous r
  join public.coachs co on co.id = r.coach_id
  where r.jeton = p_jeton
$$;
revoke execute on function public.rendez_vous_par_jeton(uuid) from public;
grant execute on function public.rendez_vous_par_jeton(uuid) to anon, authenticated;

create function public.repondre_par_jeton(p_jeton uuid, p_action text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rendez_vous;
begin
  select * into r from public.rendez_vous where jeton = p_jeton for update;
  if r.id is null then raise exception 'Lien inconnu ou expiré.'; end if;
  return public._agir_rendez_vous(r, p_action);
end $$;
revoke execute on function public.repondre_par_jeton(uuid, text) from public;
grant execute on function public.repondre_par_jeton(uuid, text) to anon, authenticated;

-- Tâche planifiée toutes les 15 minutes quand pg_cron est activé dans Supabase (Database > Extensions).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('agenda-cloture', '*/15 * * * *', 'select public._cloturer_rendez_vous(null)');
  end if;
end $$;
