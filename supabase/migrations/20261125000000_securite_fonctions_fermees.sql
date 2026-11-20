-- Sécurité, lot 1 : fermer aux visiteurs les fonctions qui n'ont rien à leur offrir.
--
-- Dans Supabase, toute nouvelle fonction est appelable par le rôle « anon » (visiteur sans compte), même après
-- « revoke … from public » : il faut le lui retirer nommément. Deux fonctions de facturation (facturer_mois,
-- facturer_paiement) sautaient en plus leur vérification quand l'appelant n'est pas connecté (auth.uid() vide,
-- prévu pour les tâches automatiques) : un visiteur pouvait donc créer une facture chez le coach.
--
-- · fonctions des comptes connectés : retirées aux visiteurs, gardées pour les comptes connectés ;
-- · fonctions de déclencheurs (notifications, facturation automatique) : retirées à tout le monde, la base les
--   appelle elle-même ;
-- · restent ouvertes aux visiteurs, et c'est voulu : le questionnaire public, la réponse à un rendez-vous par le lien
--   du mail et la désinscription des newsletters.
-- Écrit pour fonctionner même si une fonction n'existe pas (encore) dans la base où on le colle.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.facturer_mois(uuid, text)',
    'public.facturer_paiement(uuid)',
    'public.confirmer_paiement_facture(uuid)',
    'public.signaler_virement(uuid)',
    'public.est_mon_client(uuid)',
    'public.enregistrer_seance(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon', f);
      execute format('grant execute on function %s to authenticated', f);
    end if;
  end loop;

  foreach f in array array[
    'public._formats_minuteur_limite()',
    'public._notif_activite()',
    'public._notif_bilan()',
    'public._notif_cycle()',
    'public._notif_facture()',
    'public._notif_fin_pack()',
    'public._notif_message()',
    'public._notif_paiement_confirme()',
    'public._notif_programme()',
    'public._notif_rdv_propose()',
    'public._notif_realisation()',
    'public._notif_rendez_vous()',
    'public._notif_video()',
    'public.facturer_prelevement()',
    'public.noter_facture_paiement()',
    'public.regler_facture_du_mois()'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end $$;
