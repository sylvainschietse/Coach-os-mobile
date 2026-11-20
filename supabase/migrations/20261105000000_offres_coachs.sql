-- Chaque coach crée ses offres et fixe ses prix, et ses clients le paient directement (Stripe Connect).
-- · offres : nom, prix, durée (mois, trimestre, année ou paiement unique) et contenu coché
--   (programme dans l'appli, nutrition complète, messagerie, vidéos corrigées, séances avec le coach, essai gratuit).
-- · coachs.stripe_compte : le compte Stripe du coach (ouvert depuis l'appli), où arrive l'argent de ses clients.
-- · clients.offre_id / offre_prix : l'offre du client et le prix qu'il paie. Quand le coach change le prix d'une offre,
--   ceux qui sont déjà abonnés gardent leur prix (offre_prix ne bouge pas, et Stripe garde l'ancien tarif).
-- Les 4 formules d'avant deviennent les offres de départ des coachs déjà inscrits, qu'ils modifient à leur guise.

create table public.offres (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default public.mon_coach_id() references public.coachs (id) on delete cascade,
  -- Modèle de départ choisi par le coach (sert seulement à pré-remplir et à l'icône).
  modele text not null default 'libre' check (modele in ('en_ligne', 'hybride', 'presentiel', 'seances', 'libre')),
  nom text not null check (length(btrim(nom)) between 1 and 60),
  accroche text check (accroche is null or length(accroche) <= 140),
  prix numeric(8, 2) not null check (prix >= 0 and prix <= 10000),
  periodicite text not null default 'mois' check (periodicite in ('mois', 'trimestre', 'annee', 'unique')),
  acces_appli boolean not null default true,
  nutrition boolean not null default false,
  messagerie boolean not null default true,
  videos_mois integer not null default 0 check (videos_mois between 0 and 30),
  -- Séances avec le coach : par période pour un abonnement, dans le pack pour un paiement unique.
  seances integer not null default 0 check (seances between 0 and 100),
  essai_jours integer not null default 0 check (essai_jours between 0 and 60),
  active boolean not null default true,
  ordre integer not null default 0,
  -- Tenus par le serveur : produit et prix sur le compte Stripe du coach, et ce que ce prix facture.
  stripe_produit text,
  stripe_prix text,
  stripe_prix_cle text,
  cree_le timestamptz not null default now(),
  constraint offres_unique_sans_option check (periodicite <> 'unique' or (not acces_appli and not nutrition and videos_mois = 0 and essai_jours = 0 and seances > 0))
);
create index on public.offres (coach_id, ordre);

alter table public.offres enable row level security;
create policy "coach : ses offres" on public.offres for all
  using (coach_id = public.mon_coach_id()) with check (coach_id = public.mon_coach_id());
create policy "client : les offres de son coach" on public.offres for select
  using (active and coach_id = public.coach_de_mon_client());
grant select on public.offres to authenticated;
grant insert (coach_id, modele, nom, accroche, prix, periodicite, acces_appli, nutrition, messagerie, videos_mois, seances, essai_jours, active, ordre)
  on public.offres to authenticated;
grant update (modele, nom, accroche, prix, periodicite, acces_appli, nutrition, messagerie, videos_mois, seances, essai_jours, active, ordre)
  on public.offres to authenticated;
grant delete on public.offres to authenticated;

-- Compte Stripe du coach : écrit seulement par le serveur (aucun droit de modification côté appli).
alter table public.coachs
  add column stripe_compte text unique,
  add column stripe_pret boolean not null default false;

alter table public.clients
  add column offre_id uuid references public.offres (id) on delete set null,
  add column offre_prix numeric(8, 2) check (offre_prix is null or offre_prix >= 0);
create index on public.clients (offre_id);

-- Le coach ne rattache un client qu'à ses propres offres.
create function public.verifier_offre_client() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.offre_id is not null and new.offre_id is distinct from old.offre_id
     and not exists (select 1 from public.offres o where o.id = new.offre_id and o.coach_id = new.coach_id) then
    raise exception 'Cette offre n’est pas à toi.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger clients_verifier_offre before insert or update of offre_id on public.clients
  for each row execute function public.verifier_offre_client();

-- Offres de départ des coachs déjà inscrits : les 4 formules d'avant, avec leurs prix.
insert into public.offres (coach_id, modele, nom, accroche, prix, periodicite, acces_appli, nutrition, messagerie, videos_mois, seances, ordre)
select c.id, f.modele, f.nom, f.accroche, f.prix, 'mois', true, f.nutrition, true, f.videos, f.seances, f.ordre
from public.coachs c
cross join (values
  ('en_ligne', 'Appli', 'Pour t’entraîner seul, bien guidé.', 59, false, 0, 0, 1),
  ('en_ligne', 'Appli + nutrition', 'Pour des résultats aussi dans l’assiette.', 99, true, 0, 0, 2),
  ('hybride', 'Hybride léger', 'Pour garder le contact avec ton coach.', 149, true, 0, 1, 3),
  ('hybride', 'Hybride complet', 'Pour progresser vite, aux côtés de ton coach.', 269, true, 2, 4, 4)
) as f (modele, nom, accroche, prix, nutrition, videos, seances, ordre);

-- Chaque client garde ce qu'il a : sa formule s'il en avait une, sinon l'offre qui correspond à ses accès, au même prix.
update public.clients k set offre_id = o.id, offre_prix = o.prix
from public.offres o
where o.coach_id = k.coach_id and k.acces_appli and o.nom = case k.formule
  when 'appli' then 'Appli'
  when 'appli_nutrition' then 'Appli + nutrition'
  when 'hybride_leger' then 'Hybride léger'
  when 'hybride_complet' then 'Hybride complet'
  else case when k.option_nutrition then 'Appli + nutrition' else 'Appli' end
end;
