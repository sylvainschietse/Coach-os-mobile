-- Sécurité, lot 7 : prêt pour d'autres coachs.
--
-- 1. Cloisonnement. Les règles d'accès vérifiaient qu'une ligne appartient au coach, mais pas toujours que le client,
--    le contact, le Booster ou le coaching auquel elle renvoie lui appartient aussi. Un coach pouvait ainsi relier un
--    de ses contacts au client d'un autre coach, puis « Créer l'accès » : le serveur changeait l'e-mail et le mot de
--    passe de ce client. Chaque renvoi est désormais vérifié (contacts, Boosters, documents, relances, recettes,
--    aliments, vidéos), et seul le serveur relie un compte de connexion à une fiche client.
-- 2. Plafond d'appels à l'IA : 200 par jour pour un coach, 40 par jour pour un client. Les fonctions d'IA appellent
--    compter_appel_ia() avant de parler à Claude et s'arrêtent quand le plafond est atteint.

-- 1. Cloisonnement -----------------------------------------------------------------------------------------------

alter policy "coach : ses contacts" on public.contacts
  with check (coach_id = public.mon_coach_id() and (client_id is null or public.est_mon_client(client_id)));

alter policy "coach : ses boosters" on public.boosters
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, null, null));

alter policy "coach : ses documents" on public.documents
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, booster_id, coaching_id));

alter policy "coach : ses relances" on public.relances
  with check (coach_id = public.mon_coach_id() and public.liens_du_coach(contact_id, booster_id, coaching_id));

alter policy "coach : recettes" on public.recettes
  with check (coach_id = public.mon_coach_id() and (client_id is null or public.est_mon_client(client_id)));

alter policy "coach : ses aliments" on public.aliments
  with check (coach_id = public.mon_coach_id() and source in ('coach', 'off') and (client_id is null or public.est_mon_client(client_id)));
alter policy "coach : modifier ses aliments" on public.aliments
  with check (coach_id = public.mon_coach_id() and (client_id is null or public.est_mon_client(client_id)));

alter policy "coach : répond" on public.videos_mouvement
  with check (coach_id = public.mon_coach_id() and public.est_mon_client(client_id));

-- Le compte de connexion d'un client (clients.user_id) n'est posé que par le serveur (« Créer l'accès »,
-- fonction acces-client) : ni le coach ni le client ne peuvent le choisir depuis l'appli. Le retirer reste permis.
create function public.proteger_compte_client() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.user_id is not null
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    raise exception 'Le compte de connexion d’un client se crée depuis sa fiche (« Créer l’accès »).' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger clients_proteger_compte before insert or update of user_id on public.clients
  for each row execute function public.proteger_compte_client();

-- 2. Plafond d'appels à l'IA -------------------------------------------------------------------------------------

create table public.usage_ia (
  user_id uuid not null references auth.users (id) on delete cascade,
  jour date not null default (now() at time zone 'Europe/Paris')::date,
  appels integer not null default 0,
  primary key (user_id, jour)
);
alter table public.usage_ia enable row level security;
revoke all on public.usage_ia from public, anon, authenticated;

-- Compte un appel pour la personne connectée ; renvoie false quand son plafond du jour est atteint.
create function public.compter_appel_ia() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_plafond integer;
  v_appels integer;
  v_jour date := (now() at time zone 'Europe/Paris')::date;
begin
  if auth.uid() is null then return false; end if;
  if public.mon_coach_id() is not null then v_plafond := 200;
  elsif public.mon_client_id() is not null then v_plafond := 40;
  else return false;
  end if;
  insert into usage_ia (user_id, jour, appels) values (auth.uid(), v_jour, 1)
  on conflict (user_id, jour) do update set appels = usage_ia.appels + 1
    where usage_ia.appels < v_plafond
  returning appels into v_appels;
  -- Au-delà du plafond, rien n'est écrit (la ligne n'est pas touchée) : v_appels reste vide.
  delete from usage_ia where jour < v_jour - 30;
  return v_appels is not null;
end $$;
revoke execute on function public.compter_appel_ia() from public, anon;
grant execute on function public.compter_appel_ia() to authenticated;
