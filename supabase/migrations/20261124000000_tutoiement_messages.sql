-- Tutoiement partout : les messages d'erreur renvoyés par la base passent du « vous » au « tu ».
-- Mêmes fonctions qu'avant, seul le texte des messages change.

CREATE OR REPLACE FUNCTION public.activer_cycle(c uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v public.cycles;
  jour date := (now() at time zone 'Europe/Paris')::date;
begin
  select * into v from public.cycles where id = c for update;
  if not found then raise exception 'Cycle introuvable'; end if;
  if v.statut = 'Actif' then return; end if;
  if v.statut <> 'Prêt' then
    raise exception 'Activation refusée : le cycle est « % ». Passe-le d''abord en « Prêt ».', v.statut;
  end if;
  if jour < v.debut or jour > v.fin then
    raise exception 'Activation refusée : aujourd''hui (%, Paris) est hors du cycle (% → %). Replanifie les dates ou attends le début.',
      to_char(jour, 'DD/MM/YYYY'), to_char(v.debut, 'DD/MM/YYYY'), to_char(v.fin, 'DD/MM/YYYY');
  end if;
  if v.programme_id is null then raise exception 'Activation refusée : aucun programme lié.'; end if;
  perform set_config('coachos.activation', 'oui', true);
  update public.cycles set statut = 'Terminé' where suivi_id = v.suivi_id and statut = 'Actif' and id <> c;
  update public.cycles set statut = 'Actif' where id = c;
  perform set_config('coachos.activation', '', true);
end $function$;

CREATE OR REPLACE FUNCTION public.annuler_creneau(c uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ancien public.planifications;
begin
  select * into ancien from public.planifications where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Créneau introuvable'; end if;
  if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans ton historique'; end if;
  update public.planifications set statut = 'Annulée' where id = c;
end $function$;

CREATE OR REPLACE FUNCTION public.controler_cycle()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.statut = 'Actif' and (tg_op = 'INSERT' or old.statut <> 'Actif')
     and coalesce(current_setting('coachos.activation', true), '') <> 'oui' then
    raise exception 'Utilise « Activer » pour rendre un cycle actif';
  end if;
  if new.statut = 'Actif' and new.programme_id is null then
    raise exception 'Un cycle actif doit garder un programme';
  end if;
  if tg_op = 'UPDATE' and old.statut = 'Terminé' and new.programme_id is distinct from old.programme_id then
    raise exception 'Cycle terminé : programme figé';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_activite_libre(a jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  v_id uuid;
  t timestamptz;
  v_duree numeric;
  v_ressenti int;
  e jsonb;
  s jsonb;
  k text;
  v_exercices jsonb := coalesce(a->'exercices', '[]');
begin
  if moi is null then raise exception 'Activité hors de ton dossier'; end if;
  begin
    v_id := (a->>'id')::uuid;
    t := (a->>'debut')::timestamptz;
  exception when others then
    raise exception 'Activité invalide';
  end;
  if v_id is null or t is null then raise exception 'Activité incomplète'; end if;
  if t > now() + interval '1 hour' then raise exception 'Une activité ne peut pas être dans le futur'; end if;
  if t < now() - interval '1 year' then raise exception 'Date trop ancienne'; end if;
  if jsonb_typeof(a->'sport') <> 'string' then raise exception 'Type d’activité manquant'; end if;
  if jsonb_typeof(a->'dureeS') <> 'number' then raise exception 'Durée manquante'; end if;
  v_duree := (a->>'dureeS')::numeric;
  if v_duree < 60 or v_duree > 86400 then raise exception 'Durée invalide'; end if;
  if a ? 'ressenti' and jsonb_typeof(a->'ressenti') not in ('number', 'null') then raise exception 'Ressenti invalide'; end if;
  v_ressenti := round((a->>'ressenti')::numeric);
  if a ? 'calories' and jsonb_typeof(a->'calories') not in ('number', 'null') then raise exception 'Calories invalides'; end if;
  if a ? 'distanceM' and jsonb_typeof(a->'distanceM') not in ('number', 'null') then raise exception 'Distance invalide'; end if;
  if length(coalesce(a->>'note', '')) > 2000 then raise exception 'Note trop longue'; end if;

  -- Exercices : un tableau d'au plus 40 exercices de 20 séries, valeurs chiffrées seulement.
  if jsonb_typeof(v_exercices) <> 'array' or jsonb_array_length(v_exercices) > 40 then raise exception 'Exercices invalides'; end if;
  for e in select * from jsonb_array_elements(v_exercices) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'nom') <> 'string' or length(e->>'nom') not between 1 and 200
      or jsonb_typeof(e->'series') <> 'array' or jsonb_array_length(e->'series') > 20 then
      raise exception 'Exercice invalide';
    end if;
    if e ? 'exerciceId' and jsonb_typeof(e->'exerciceId') <> 'null' then
      begin
        perform (e->>'exerciceId')::uuid;
      exception when others then
        raise exception 'Exercice invalide';
      end;
    end if;
    for s in select * from jsonb_array_elements(e->'series') loop
      if jsonb_typeof(s) <> 'object' then raise exception 'Série invalide'; end if;
      for k in select jsonb_object_keys(s) loop
        if k not in ('repetitions', 'charge', 'duree', 'distance') or jsonb_typeof(s->k) not in ('number', 'null') then
          raise exception 'Série invalide';
        end if;
        if (s->>k)::numeric < 0 or (s->>k)::numeric > 100000 then raise exception 'Série invalide'; end if;
      end loop;
    end loop;
  end loop;

  -- Une activité existante ne peut être modifiée que par son client, et seulement si c'est une saisie libre.
  if exists (select 1 from public.activites_sport where id = v_id and (client_id <> moi or source <> 'manuel')) then
    raise exception 'Activité introuvable';
  end if;

  insert into public.activites_sport (id, coach_id, client_id, source, id_externe, sport, titre, debut, duree_s, distance_m, calories, ressenti, note, exercices)
  values (v_id, mon_coach, moi, 'manuel', v_id::text, a->>'sport', left(coalesce(trim(a->>'titre'), ''), 200), t, round(v_duree),
    round((a->>'distanceM')::numeric), round((a->>'calories')::numeric), v_ressenti, coalesce(trim(a->>'note'), ''), v_exercices)
  on conflict (id) do update set sport = excluded.sport, titre = excluded.titre, debut = excluded.debut, duree_s = excluded.duree_s,
    distance_m = excluded.distance_m, calories = excluded.calories, ressenti = excluded.ressenti, note = excluded.note, exercices = excluded.exercices, importee_le = now()
  where public.activites_sport.client_id = moi and public.activites_sport.source = 'manuel' and not public.activites_sport.retiree;
  if not found then raise exception 'Activité introuvable'; end if;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_activites(lot jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  a jsonb;
  n int := 0;
  k text;
  t timestamptz;
begin
  if moi is null then raise exception 'Activités hors de ton dossier'; end if;
  if jsonb_typeof(lot) <> 'array' or jsonb_array_length(lot) > 200 then raise exception 'Lot d’activités invalide'; end if;
  for a in select * from jsonb_array_elements(lot) loop
    if jsonb_typeof(a->'idExterne') <> 'string' or jsonb_typeof(a->'source') <> 'string' or jsonb_typeof(a->'sport') <> 'string'
      or jsonb_typeof(a->'debut') <> 'string' or jsonb_typeof(a->'dureeS') <> 'number' then
      raise exception 'Activité incomplète';
    end if;
    foreach k in array array['distanceM', 'deniveleM', 'fcMoy', 'fcMax', 'calories'] loop
      if a ? k and jsonb_typeof(a->k) not in ('number', 'null') then raise exception 'Activité invalide'; end if;
    end loop;
    begin
      t := (a->>'debut')::timestamptz;
    exception when others then
      raise exception 'Date de début invalide';
    end;
    if t > now() + interval '1 hour' then raise exception 'Date de début invalide'; end if;
    insert into public.activites_sport (coach_id, client_id, source, id_externe, sport, titre, debut, duree_s, distance_m, denivele_m, fc_moy, fc_max, calories, appareil)
    values (mon_coach, moi, a->>'source', a->>'idExterne', a->>'sport', coalesce(a->>'titre', ''), t, round((a->>'dureeS')::numeric),
      round((a->>'distanceM')::numeric), round((a->>'deniveleM')::numeric), round((a->>'fcMoy')::numeric), round((a->>'fcMax')::numeric),
      round((a->>'calories')::numeric), coalesce(a->>'appareil', ''))
    on conflict (client_id, source, id_externe) do update set sport = excluded.sport, titre = excluded.titre, debut = excluded.debut,
      duree_s = excluded.duree_s, distance_m = excluded.distance_m, denivele_m = excluded.denivele_m, fc_moy = excluded.fc_moy,
      fc_max = excluded.fc_max, calories = excluded.calories, appareil = excluded.appareil, importee_le = now()
    where not public.activites_sport.retiree;
    if found then n := n + 1; end if;
  end loop;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_alimentation_personnelle(p_client uuid, p_type text, p_date date, p_donnees jsonb, p_version integer, p_envoi text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ligne public.alimentation_personnelle;
  k text;
begin
  if not public.acces_nutrition(p_client) then raise exception 'Dossier alimentaire hors de ton dossier'; end if;
  if p_type not in ('recipes', 'diary') then raise exception 'Type inconnu'; end if;
  if p_type = 'diary' and p_date is null then raise exception 'Date manquante'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Enregistrement incomplet'; end if;
  if p_donnees is null or jsonb_typeof(p_donnees) <> 'array' then raise exception 'Données manquantes'; end if;
  if jsonb_array_length(p_donnees) > (case when p_type = 'recipes' then 200 else 100 end) then raise exception 'Trop d’éléments'; end if;
  k := case when p_type = 'recipes' then 'library' else to_char(p_date, 'YYYY-MM-DD') end;
  select * into ligne from public.alimentation_personnelle where client_id = p_client and type = p_type and cle = k for update;
  if found and ligne.envoi_id = p_envoi then return ligne.version; end if;
  if coalesce(ligne.version, 0) <> coalesce(p_version, 0) then raise exception 'Ces données ont changé. Actualise avant de réessayer.'; end if;
  insert into public.alimentation_personnelle (client_id, type, cle, donnees, version, envoi_id) values (p_client, p_type, k, p_donnees, coalesce(ligne.version, 0) + 1, p_envoi)
  on conflict (client_id, type, cle) do update set donnees = excluded.donnees, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
  return coalesce(ligne.version, 0) + 1;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_bilan(b jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moi uuid := public.mon_client_id();
  mon_coach uuid := public.coach_de_mon_client();
  s date;
  jour date := (now() at time zone 'Europe/Paris')::date;
  r jsonb := b->'reponses';
  ancien public.bilans_hebdo;
  prec public.bilans_hebdo;
  cible int;
  syn record;
  k text;
begin
  if moi is null then raise exception 'Bilan hors de ton dossier'; end if;
  begin
    s := (b->>'semaine')::date;
  exception when others then
    raise exception 'Semaine invalide ou future';
  end;
  if s is null or b->>'semaine' <> to_char(s, 'YYYY-MM-DD') or extract(isodow from s) <> 1 or s > jour - (extract(isodow from jour)::int - 1) then
    raise exception 'Semaine invalide ou future';
  end if;
  if length(coalesce(b->>'envoiId', '')) not between 8 and 80 then raise exception 'Envoi invalide'; end if;
  foreach k in array array['energie', 'sommeil', 'stress', 'motivation'] loop
    if jsonb_typeof(r->k) <> 'number' or (r->>k)::numeric not between 1 and 10 or (r->>k)::numeric <> trunc((r->>k)::numeric) then
      raise exception 'Complète les quatre scores et le nombre de séances réalisées.';
    end if;
  end loop;
  if jsonb_typeof(r->'seances') <> 'number' or (r->>'seances')::numeric not between 0 and 30 or (r->>'seances')::numeric <> trunc((r->>'seances')::numeric) then
    raise exception 'Complète les quatre scores et le nombre de séances réalisées.';
  end if;
  if jsonb_typeof(r->'difficultes') <> 'string' or jsonb_typeof(r->'douleurs') <> 'string' or jsonb_typeof(r->'victoire') <> 'string'
    or length(r->>'difficultes') > 2000 or length(r->>'douleurs') > 1500 or length(r->>'victoire') > 1000 then
    raise exception 'Réponse trop longue.';
  end if;
  if exists (select 1 from public.bilans_hebdo where client_id = moi and envoi_id = b->>'envoiId') then return 'doublon'; end if;
  select * into ancien from public.bilans_hebdo where client_id = moi and semaine = s;
  if found and ancien.repondu_le is not null and ancien.source_retour = 'Coach' then
    raise exception 'Ton coach a déjà répondu à ce bilan. Il reste conservé dans ton historique.';
  end if;
  select * into prec from public.bilans_hebdo where client_id = moi and semaine < s order by semaine desc limit 1;
  select p.seances_par_semaine into cible
  from public.cycles c join public.programmes p on p.id = c.programme_id
  where c.client_id = moi and c.statut in ('Actif', 'Terminé') and c.debut <= s + 6 and c.fin >= s
  order by c.debut desc limit 1;
  r := jsonb_build_object('energie', (r->>'energie')::int, 'sommeil', (r->>'sommeil')::int, 'stress', (r->>'stress')::int, 'motivation', (r->>'motivation')::int,
    'seances', (r->>'seances')::int, 'difficultes', r->>'difficultes', 'douleurs', r->>'douleurs', 'victoire', r->>'victoire');
  select * into syn from public.synthese_bilan(r, prec.reponses, prec.semaine, cible);
  insert into public.bilans_hebdo (coach_id, client_id, semaine, reponses, envoye_le, envoi_id, retour_coach, priorite, repondu_le, source_retour, a_revoir)
  values (mon_coach, moi, s, r, now(), b->>'envoiId', syn.retour, syn.priorite, now(), 'Automatique', syn.a_revoir)
  on conflict (client_id, semaine) do update set reponses = excluded.reponses, envoye_le = excluded.envoye_le, envoi_id = excluded.envoi_id,
    retour_coach = excluded.retour_coach, priorite = excluded.priorite, repondu_le = excluded.repondu_le, source_retour = excluded.source_retour,
    a_revoir = excluded.a_revoir;
  return 'enregistre';
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_objectif(o jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moi uuid := public.mon_client_id();
  envoi text := o->>'envoiId';
  action text := o->>'action';
  g public.objectifs;
  v jsonb := o->'objectif';
  val numeric;
  jour date := (now() at time zone 'Europe/Paris')::date;
  nouvel uuid;
begin
  if moi is null then raise exception 'Objectif hors de ton dossier'; end if;
  if length(coalesce(envoi, '')) not between 8 and 80 then raise exception 'Envoi invalide'; end if;
  if action = 'creer' then
    select id into nouvel from public.objectifs where client_id = moi and (dernier_envoi = envoi or historique->0->>'envoiId' = envoi);
    if found then return nouvel; end if;
    if length(btrim(coalesce(v->>'titre', ''))) not between 3 and 120 then raise exception 'Nomme ton objectif (3 à 120 caractères)'; end if;
    if jsonb_typeof(v->'depart') <> 'number' or jsonb_typeof(v->'cible') <> 'number'
      or (v->>'depart')::numeric not between 0 and 1000000 or (v->>'cible')::numeric not between 0 and 1000000 then
      raise exception 'Renseigne le départ et la cible';
    end if;
    if (v->>'depart')::numeric = (v->>'cible')::numeric then raise exception 'La cible doit être différente du point de départ'; end if;
    if coalesce(v->>'echeance', '') <> '' and ((v->>'echeance')::date < jour or (v->>'echeance')::date > '2100-12-31') then raise exception 'Échéance invalide'; end if;
    insert into public.objectifs (coach_id, client_id, titre, unite, depart, cible, echeance, historique, dernier_envoi)
    values (public.coach_de_mon_client(), moi, btrim(v->>'titre'), v->>'unite', (v->>'depart')::numeric, (v->>'cible')::numeric,
      nullif(v->>'echeance', '')::date, jsonb_build_array(jsonb_build_object('date', now(), 'valeur', (v->>'depart')::numeric, 'envoiId', envoi)), envoi)
    returning id into nouvel;
    return nouvel;
  end if;
  select * into g from public.objectifs where id = (o->>'id')::uuid and client_id = moi for update;
  if not found then raise exception 'Objectif hors de ton dossier'; end if;
  if g.dernier_envoi = envoi or g.historique @> jsonb_build_array(jsonb_build_object('envoiId', envoi)) then return g.id; end if;
  if nullif(o->>'version', '') is null or g.modifie_le <> (o->>'version')::timestamptz then raise exception 'Cet objectif a changé. Actualise avant de réessayer.'; end if;
  if action = 'progresser' then
    if g.archive then raise exception 'Cet objectif est archivé'; end if;
    if jsonb_typeof(o->'valeur') <> 'number' or (o->>'valeur')::numeric not between 0 and 1000000 then raise exception 'Valeur actuelle invalide'; end if;
    if jsonb_array_length(g.historique) >= 500 then raise exception 'Historique complet : crée un nouvel objectif'; end if;
    val := (o->>'valeur')::numeric;
    update public.objectifs set
      historique = historique || jsonb_build_array(jsonb_build_object('date', now(), 'valeur', val, 'envoiId', envoi)),
      atteint_le = case when (cible > depart and val >= cible) or (cible < depart and val <= cible) then coalesce(atteint_le, now()) end,
      modifie_le = now(), dernier_envoi = envoi
    where id = g.id;
  elsif action in ('archiver', 'restaurer') then
    update public.objectifs set archive = action = 'archiver', modifie_le = now(), dernier_envoi = envoi where id = g.id;
  else
    raise exception 'Action inconnue';
  end if;
  return g.id;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_plan_alimentaire(p_client uuid, p_semaine date, p_plan jsonb, p_version text, p_envoi text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ligne public.plans_alimentaires;
  jour jsonb;
  repas jsonb;
  v text;
begin
  if not public.acces_nutrition(p_client) then raise exception 'Planning hors de ton dossier'; end if;
  if p_semaine is null or extract(isodow from p_semaine) <> 1 then raise exception 'Choisis un lundi'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Planning incomplet'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) <> 7 then raise exception 'Planning incomplet'; end if;
  for jour in select * from jsonb_array_elements(p_plan) loop
    if jsonb_typeof(jour) <> 'array' or jsonb_array_length(jour) > 12 then raise exception 'Maximum de 12 éléments par jour.'; end if;
    for repas in select * from jsonb_array_elements(jour) loop
      if jsonb_typeof(repas->'recipeId') <> 'string' or jsonb_typeof(repas->'variantId') <> 'string' or jsonb_typeof(repas->'portions') <> 'number'
        or (repas->>'portions')::numeric not between 0.125 and 4 then
        raise exception 'Recette ou variante inconnue';
      end if;
    end loop;
  end loop;
  select * into ligne from public.plans_alimentaires where client_id = p_client and semaine = p_semaine for update;
  if found and ligne.envoi_id = p_envoi then return ligne.version; end if;
  if coalesce(ligne.version, '') <> coalesce(p_version, '') then raise exception 'Le planning a été modifié. Actualise avant de réessayer.'; end if;
  v := public.version_nutrition();
  insert into public.plans_alimentaires (client_id, semaine, plan, version, envoi_id) values (p_client, p_semaine, p_plan, v, p_envoi)
  on conflict (client_id, semaine) do update set plan = excluded.plan, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_profil_alimentaire(p_client uuid, p_action text, p_preferences jsonb, p_objectif jsonb, p_version text, p_envoi text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ligne public.profils_alimentaires;
  prefs jsonb;
  ancien jsonb;
  jour date := (now() at time zone 'Europe/Paris')::date;
  poids_actuel numeric;
  poids numeric;
  total numeric;
begin
  if p_action not in ('preferences', 'coach', 'auto') then raise exception 'Action inconnue'; end if;
  if p_action in ('coach', 'auto') and not public.est_mon_client(p_client) then raise exception 'Réservé au coach du client'; end if;
  if not public.acces_nutrition(p_client) then raise exception 'Profil hors de ton dossier'; end if;
  if length(coalesce(p_envoi, '')) not between 8 and 64 then raise exception 'Identifiant de saisie manquant'; end if;
  select * into ligne from public.profils_alimentaires where client_id = p_client for update;
  if found and ligne.envoi_id = p_envoi then return; end if;
  if coalesce(ligne.version, '') <> coalesce(p_version, '') then raise exception 'Le profil a changé. Actualise avant de réessayer.'; end if;

  if p_action = 'preferences' then
    if p_preferences is null or jsonb_typeof(p_preferences) <> 'object' then raise exception 'Profil alimentaire incomplet'; end if;
    prefs := p_preferences;
    -- Âge déclaré : on garde la date de saisie tant qu'il ne change pas (pas de date de naissance dans le dossier).
    ancien := coalesce(ligne.preferences, '{}'::jsonb);
    if jsonb_typeof(prefs->'age') = 'number' then
      prefs := prefs || jsonb_build_object('ageSaisiLe',
        case when ancien->'age' = prefs->'age' and coalesce(ancien->>'ageSaisiLe', '') <> '' then ancien->>'ageSaisiLe' else to_char(jour, 'YYYY-MM-DD') end);
    else
      prefs := prefs || '{"ageSaisiLe": ""}'::jsonb;
    end if;
    -- syncNutritionMeasures : une mesure datée du jour seulement si le poids diffère de la dernière mesure.
    if jsonb_typeof(prefs->'poids') = 'number' then
      poids := (prefs->>'poids')::numeric;
      select m.poids_kg into poids_actuel from public.mensurations m
      where m.client_id = p_client and m.poids_kg is not null and m.date <= jour order by m.date desc, m.created_at desc limit 1;
      if poids is distinct from poids_actuel and poids between 20 and 400
        and not exists (select 1 from public.mensurations where client_id = p_client and envoi_id = 'nutrition:' || p_envoi) then
        insert into public.mensurations (client_id, date, poids_kg, envoi_id) values (p_client, jour, poids, 'nutrition:' || p_envoi);
      end if;
    end if;
    insert into public.profils_alimentaires (client_id, preferences, objectifs, version, envoi_id)
    values (p_client, prefs, null, public.version_nutrition(), p_envoi)
    on conflict (client_id) do update set preferences = excluded.preferences, version = excluded.version, envoi_id = excluded.envoi_id, maj_le = now();
    return;
  end if;

  if ligne.preferences is null then raise exception 'Le client doit d’abord enregistrer son profil alimentaire.'; end if;
  if p_action = 'coach' then
    if p_objectif is null or jsonb_typeof(p_objectif->'calories') <> 'number' or (p_objectif->>'calories')::numeric not between 1 and 10000
      or (p_objectif->>'calories')::numeric <> trunc((p_objectif->>'calories')::numeric) then
      raise exception 'Objectifs incomplets';
    end if;
    total := coalesce((p_objectif->>'proteinesPct')::numeric, -1000) + coalesce((p_objectif->>'lipidesPct')::numeric, -1000)
      + coalesce((p_objectif->>'glucidesPct')::numeric, -1000);
    if abs(total - 100) >= 0.01 then raise exception 'La répartition doit totaliser 100 %%'; end if;
    if length(coalesce(p_objectif->>'note', '')) > 1500 then raise exception 'Note trop longue'; end if;
  end if;
  update public.profils_alimentaires
  set objectifs = case when p_action = 'auto' then null else p_objectif end, version = public.version_nutrition(), envoi_id = p_envoi, maj_le = now()
  where client_id = p_client;
end $function$;

CREATE OR REPLACE FUNCTION public.enregistrer_realisation(r jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  moi uuid := public.mon_client_id();
  v_id uuid := (r->>'id')::uuid;
  s public.seances;
  c public.cycles;
  prog public.programmes;
  plan public.planifications;
  jour date := (now() at time zone 'Europe/Paris')::date;
  v_fin timestamptz := coalesce(nullif(r->>'fin', '')::timestamptz, now());
  doublon boolean;
  serie jsonb;
begin
  if moi is null or moi <> (r->>'clientId')::uuid then raise exception 'Séance hors de ton dossier'; end if;
  select * into s from public.seances where id = (r->>'seanceId')::uuid and supprime_le is null;
  if not found then raise exception 'Séance introuvable ou retirée par ton coach'; end if;
  if nullif(r->>'cycleId', '') is not null then
    select * into c from public.cycles where id = (r->>'cycleId')::uuid and client_id = moi;
    if not found or c.statut <> 'Actif' or c.programme_id is null then raise exception 'Ce cycle n''est pas en cours'; end if;
    if jour < c.debut or jour > c.fin then raise exception 'Cette séance est en dehors des dates du cycle actif'; end if;
    if s.programme_id is distinct from c.programme_id then raise exception 'Séance hors du cycle en cours'; end if;
    select * into prog from public.programmes where id = c.programme_id;
  elsif s.client_id is distinct from moi then
    raise exception 'Séance hors de ton dossier';
  end if;
  if nullif(r->>'planificationId', '') is not null then
    select * into plan from public.planifications where id = (r->>'planificationId')::uuid;
    if not found or plan.client_id <> moi or plan.cycle_id is distinct from c.id or plan.seance_id <> s.id or plan.statut = 'Annulée' then
      raise exception 'Créneau hors de cette séance';
    end if;
    if plan.statut = 'Réalisée' and plan.realisation_id is distinct from v_id then raise exception 'Ce créneau est déjà réalisé'; end if;
  end if;

  select exists (select 1 from public.realisations where id = v_id) into doublon;
  if doublon then
    if not exists (select 1 from public.realisations where id = v_id and client_id = moi and seance_id = s.id) then
      raise exception 'Envoi déjà utilisé pour une autre séance';
    end if;
    select realisations.fin into v_fin from public.realisations where id = v_id;
  else
    if jsonb_array_length(coalesce(r->'series', '[]')) = 0 and nullif(r->>'note', '') is null and coalesce(trim(r->>'commentaire'), '') = '' then
      raise exception 'Renseigne au moins un résultat ou un ressenti';
    end if;
    insert into public.realisations (id, seance_id, client_id, coach_id, debut, fin, commentaire, note, cycle_id, programme_id,
      planification_id, seance_titre, programme_nom, cycle_nom)
    values (v_id, s.id, moi, s.coach_id, coalesce(nullif(r->>'debut', '')::timestamptz, v_fin), v_fin, nullif(trim(r->>'commentaire'), ''),
      nullif(r->>'note', '')::int, c.id, c.programme_id, plan.id, s.titre, prog.titre, c.nom);
    for serie in select * from jsonb_array_elements(coalesce(r->'series', '[]')) loop
      if not exists (select 1 from public.lignes l join public.blocs b on b.id = l.bloc_id
                     where l.id = (serie->>'ligneId')::uuid and b.seance_id = s.id) then
        raise exception 'Exercice hors de cette séance';
      end if;
      -- Exercice remplacé par le client : pris seulement dans le catalogue commun ou celui de son coach.
      insert into public.series_realisees (id, realisation_id, ligne_id, exercice_id, index, valeurs, suggestion, exercice_nom, exercice_prevu_id)
      select (serie->>'id')::uuid, v_id, l.id, coalesce(alt.id, l.exercice_id), (serie->>'index')::int, coalesce(serie->'valeurs', '{}'),
        coalesce(serie->'suggestion', '{}'), coalesce(alt.nom, e.nom), case when alt.id is not null then l.exercice_id end
      from public.lignes l join public.exercices e on e.id = l.exercice_id
      left join public.exercices alt on alt.id = nullif(serie->>'exerciceId', '')::uuid and alt.id <> l.exercice_id
        and (alt.coach_id is null or alt.coach_id = s.coach_id)
      where l.id = (serie->>'ligneId')::uuid;
    end loop;
  end if;

  -- Calendrier (markCompleted) : le créneau choisi, sinon celui prévu ce jour-là, sinon un créneau réalisé créé.
  if c.id is not null and not exists (select 1 from public.planifications where realisation_id = v_id) then
    if plan.id is null then
      select * into plan from public.planifications
      where client_id = moi and cycle_id = c.id and seance_id = s.id and statut = 'Prévue' and date = (v_fin at time zone 'Europe/Paris')::date
      order by cree_le limit 1;
    end if;
    if plan.id is not null then
      update public.planifications set statut = 'Réalisée', realisee_le = v_fin, realisation_id = v_id where id = plan.id;
    else
      insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, statut, realisee_le, realisation_id, envoi_id)
      values (moi, c.id, s.id, s.titre, (v_fin at time zone 'Europe/Paris')::date, 'Réalisée', v_fin, v_id, 'realisation-' || v_id);
    end if;
  end if;
  return case when doublon then 'doublon' else 'enregistree' end;
end $function$;

CREATE OR REPLACE FUNCTION public.mon_cycle(c uuid)
 RETURNS cycles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cycles;
begin
  select * into v from public.cycles where id = c and client_id = public.mon_client_id();
  if not found then raise exception 'Cycle hors de ton dossier'; end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.planifier_seance(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cycles := public.mon_cycle((p->>'cycleId')::uuid);
  ancien public.planifications;
  s public.seances;
  jour date := (now() at time zone 'Europe/Paris')::date;
  d date := nullif(p->>'date', '')::date;
  h text := nullif(p->>'heure', '');
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if exists (select 1 from public.planifications where envoi_id = p->>'envoiId' and client_id = v.client_id) then
    return (select id from public.planifications where envoi_id = p->>'envoiId');
  end if;
  if v_id is not null then
    select * into ancien from public.planifications where id = v_id and client_id = v.client_id and cycle_id = v.id;
    if not found then raise exception 'Créneau hors de ton dossier'; end if;
    if ancien.statut = 'Réalisée' then raise exception 'Une séance réalisée reste conservée dans ton historique'; end if;
  end if;
  if v.statut <> 'Actif' or v.programme_id is null then raise exception 'Le coach doit activer ce cycle avant de planifier'; end if;
  if d is null or d < jour or d < v.debut or d > v.fin or coalesce(p->>'envoiId', '') = '' then
    raise exception 'Choisis une date à venir dans les dates du cycle actif';
  end if;
  if h is not null and h !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'Heure invalide'; end if;
  select * into s from public.seances where id = (p->>'seanceId')::uuid and supprime_le is null;
  if not found or s.programme_id is distinct from v.programme_id then raise exception 'Séance hors de ton programme actif'; end if;
  if exists (select 1 from public.planifications where client_id = v.client_id and cycle_id = v.id and statut = 'Prévue'
             and seance_id = s.id and date = d and id is distinct from v_id) then
    raise exception 'Cette séance est déjà prévue ce jour-là';
  end if;
  if v_id is not null then
    update public.planifications set seance_id = s.id, seance_titre = s.titre, date = d, heure = h, envoi_id = p->>'envoiId' where id = v_id;
    return v_id;
  end if;
  insert into public.planifications (client_id, cycle_id, seance_id, seance_titre, date, heure, envoi_id)
  values (v.client_id, v.id, s.id, s.titre, d, h, p->>'envoiId') returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.repondre_bilan(p_id uuid, p_message text, p_priorite text, p_envoye_le timestamp with time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  b public.bilans_hebdo;
begin
  select * into b from public.bilans_hebdo where id = p_id and coach_id = public.mon_coach_id();
  if not found then raise exception 'Bilan introuvable'; end if;
  if b.envoye_le <> p_envoye_le then raise exception 'Le client a modifié son bilan. Actualise avant de répondre.'; end if;
  if length(btrim(coalesce(p_message, ''))) not between 1 and 4000 or length(btrim(coalesce(p_priorite, ''))) not between 1 and 1000 then
    raise exception 'Renseigne le message et la priorité';
  end if;
  update public.bilans_hebdo set retour_coach = btrim(p_message), priorite = btrim(p_priorite), source_retour = 'Coach', a_revoir = false, repondu_le = now()
  where id = b.id;
end $function$;

CREATE OR REPLACE FUNCTION public.reserver_envoi_compte_rendu(p_document uuid, p_version integer, p_relancer boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d documents;
  v_cle text := p_document::text || ':' || p_version;
  v_etat text;
begin
  select * into d from documents where id = p_document and coach_id = mon_coach_id();
  if d.id is null then raise exception 'Document introuvable'; end if;
  if d.envoye then return 'envoye'; end if;
  if d.chemin is null then raise exception 'Génère le PDF avant l’envoi'; end if;
  if d.version <> p_version then raise exception 'Ce n’est plus la version courante du document'; end if;
  perform pg_advisory_xact_lock(hashtext(v_cle));
  select etat into v_etat from journal_automatisations where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
  if v_etat is null then
    insert into journal_automatisations (coach_id, flux, cle, etat, contact_id, document_id, version, detail)
    values (d.coach_id, 'compte_rendu', v_cle, 'en_cours', d.contact_id, d.id, p_version, 'Transmission à Make');
    return 'ok';
  end if;
  -- Une transmission restée « en cours » plus de 15 minutes a été interrompue (fonction arrêtée) : relançable comme un échec.
  if p_relancer and (v_etat in ('echec', 'bloque') or (v_etat = 'en_cours' and exists (
    select 1 from journal_automatisations where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle and maj_le < now() - interval '15 minutes'
  ))) then
    update journal_automatisations set etat = 'en_cours', detail = 'Nouvelle transmission demandée par le coach',
      tentatives = tentatives + 1, maj_le = now()
    where coach_id = d.coach_id and flux = 'compte_rendu' and cle = v_cle;
    return 'ok';
  end if;
  return v_etat;
end $function$;

