-- Adresse postale du client, pour ses factures : saisie par le coach (fiche contact) ou par le client (« Mon compte »).
alter table public.contacts add column if not exists adresse text;
alter table public.clients add column if not exists adresse text;
