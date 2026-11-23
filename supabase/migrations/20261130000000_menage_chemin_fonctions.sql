-- Ménage (plan d'amélioration, lot 8) : chemin de recherche fixe pour les 5 fonctions signalées par Supabase.
--
-- Sans chemin fixe, une fonction cherche les tables et fonctions qu'elle cite dans le « search_path » de la personne
-- qui l'appelle. Ce n'est pas exploitable aujourd'hui (personne ne peut créer de schéma), mais Supabase le signale et le
-- réglage est sans effet sur ce que font ces fonctions : elles ne citent que des objets du schéma public ou de base.
-- Écrit pour fonctionner même si une fonction n'existe pas (encore) dans la base où on le colle.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public._type_rdv(text)',
    'public._apercu_message(text, text)',
    'public.ecart_bilan(integer)',
    'public.version_nutrition()',
    'public.piliers_valides(jsonb)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('alter function %s set search_path = public, pg_temp', f);
    end if;
  end loop;
end $$;
