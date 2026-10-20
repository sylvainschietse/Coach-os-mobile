-- Recommandations de sécurité de Supabase : les fonctions « qui suis-je » ne servent qu'aux comptes connectés,
-- et normaliser_telephone a un search_path fixe. soumettre_questionnaire reste ouverte aux visiteurs (voulu).
revoke execute on function public.mon_coach_id(), public.mon_client_id(), public.coach_de_mon_client() from public, anon;
alter function public.normaliser_telephone(text) set search_path = public;
