-- Le compte rendu d'origine (createBoosterReport) est de type « Bilan » : l'unicité vaut pour tout document lié à un Booster.
create unique index documents_un_par_booster on public.documents (booster_id) where booster_id is not null;
