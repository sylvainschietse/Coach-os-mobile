// RecipePlanner.tsx d'origine (N02, N03) : les 200 recettes avec filtres et fiche détaillée (versions, remplacements
// de protéines à équivalence, portions), la semaine du client (proposition automatique, portions, enregistrement
// versionné) et la liste de courses. Ajout : quand le coach a composé la semaine (onglet Nutrition coach), elle
// s'affiche en lecture seule et la liste de courses en est tirée.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChefHat, ChevronLeft, ChevronRight, Flame, Leaf, Plus, RefreshCw, ShoppingBasket, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { nutrition, type DonneesNutrition } from '@/data/nutrition';
import { IDS_PAR_TITRE, PHOTOS_RECETTES } from '@/data/nutrition/photos-recettes';
import correspondance from '@/data/nutrition/recettes-uuid.json';
import { plansRepas } from '@/data/plan-repas';
import { applySwaps, proteinEquivalent, replacementFoods, replacementOptions } from '@/domain/nutrition/operations';
import {
  compatible,
  dateAt,
  dietFits,
  excluded,
  generateWeek,
  grocery,
  mealLabels,
  monday,
  multiply,
  norm,
  preferred,
  preparationFor,
  proteinRich,
  recipeOptions,
  recipes,
  round,
  slotLabels,
  total,
  targetNutrition,
  variantOf,
  weekShift,
  type Meal,
  type Nutrition,
  type Plan,
  type Recipe,
  type Slot,
  type Swap,
} from '@/domain/nutrition/recettes';
import { totalJour, type PlanRepas } from '@/domain/plan-repas';
import type { MomentRepas } from '@/domain/types';
import { brouillonsOuverts, demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';
import { roleWeb } from '@/lib/role-web';

import { BoutonContour, Selecteur } from '../coque';
import { CaseACocher, Modale, Repliable, Saisie } from '../crm/dossier';
import { Action, Confirmation, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';
import { Bloc, choixPortions, doux, Lien, Valeurs } from './commun';

const blank = (): Plan => Array.from({ length: 7 }, () => []);
const SLOTS = Object.entries(slotLabels).map(([cle, libelle]) => ({ cle: cle as Slot, libelle }));
const CATEGORIES = [{ cle: '', libelle: 'Tous les repas' }, ...Object.entries(mealLabels).map(([cle, libelle]) => ({ cle, libelle }))];
const CUISINES = [{ cle: '', libelle: 'Toutes les cuisines' }, ...Array.from(new Set(recipes.map((r) => r.cuisineGroup))).sort().map((c) => ({ cle: c, libelle: c }))];
const REGIMES = [
  { cle: '', libelle: 'Tous' },
  { cle: 'vegetarien', libelle: 'Végétarien' },
  { cle: 'vegan', libelle: 'Vegan' },
  { cle: 'pescetarien', libelle: 'Pescétarien' },
];
const planValide = (p: unknown): p is Plan =>
  Array.isArray(p) &&
  p.length === 7 &&
  p.every(
    (d) =>
      Array.isArray(d) &&
      d.length <= 12 &&
      d.every((m) => !!variantOf(m as Meal) && typeof (m as Meal).portions === 'number' && (m as Meal).portions >= 0.125 && (m as Meal).portions <= 4),
  );

// Semaine du coach (plans_repas) : ses recettes viennent des 200 recettes importées (identifiants uuid v5).
const ORIGINE = correspondance as Record<string, string>;
// Et dans l'autre sens, pour retrouver la photo d'une recette (rangée par uuid).
const UUID_DE = Object.fromEntries(Object.entries(ORIGINE).map(([uuid, cle]) => [cle, uuid]));
const photoDe = (id: string): number | undefined => PHOTOS_RECETTES[UUID_DE[id]];
// Recette du plan du coach : rangée par uuid, ou retrouvée par son titre pour une copie personnelle.
const photoPlan = (r: { recetteId: string; titre: string }): number | undefined =>
  PHOTOS_RECETTES[r.recetteId] ?? PHOTOS_RECETTES[IDS_PAR_TITRE[r.titre.trim()]];

// Miniature au-dessus d'un plat de la journée, pour donner envie.
function Miniature({ source }: { source?: number }) {
  if (!source) return null;
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 7, borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(195,24,30,0.05)' }}>
      <Image source={source} accessible={false} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
    </View>
  );
}
const MOMENT_SLOT: Record<MomentRepas, Slot> = { petit_dejeuner: 'breakfast', dejeuner: 'lunch', diner: 'dinner', collation: 'snack' };
function planDuCoach(p: PlanRepas) {
  const horsCatalogue = new Set<string>();
  const plan: Plan = p.jours.map((jour) =>
    jour.flatMap((r) => {
      const recette = recipes.find((x) => x.id === ORIGINE[r.recetteId]);
      const variantId = r.varianteId ?? recette?.variants.find((v) => v.id === 'original')?.id ?? recette?.variants[0]?.id;
      const meal: Meal | null = recette && variantId ? { recipeId: recette.id, variantId, portions: r.portions, slot: MOMENT_SLOT[r.moment] } : null;
      if (!meal || !variantOf(meal)) {
        horsCatalogue.add(r.titre);
        return [];
      }
      return [meal];
    }),
  );
  return { plan, horsCatalogue: [...horsCatalogue] };
}
const versNutrition = (m: { kcal: number; proteines: number; glucides: number; lipides: number }): Nutrition => ({
  kcal: m.kcal,
  protein: m.proteines,
  carbs: m.glucides,
  fat: m.lipides,
});

export function Planificateur({
  data,
  vue,
  onVue,
}: {
  data: DonneesNutrition;
  vue: 'recettes' | 'semaine';
  onVue: (s: 'recettes' | 'semaine') => void;
}) {
  const cible = data.objectifCoach || data.calcul.cible;
  const prefs = data.preferences;
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [diet, setDiet] = useState('');
  const [rich, setRich] = useState(false);
  const [personal, setPersonal] = useState(true);
  const [limit, setLimit] = useState(24);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [formats, setFormats] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [slot, setSlot] = useState<Slot>('lunch');
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [variant, setVariant] = useState('original');
  const [portion, setPortion] = useState(1);
  const [week, setWeek] = useState(() => monday());
  const [day, setDay] = useState(0);
  const [plan, setPlan] = useState<Plan>(blank);
  const [coachPlan, setCoachPlan] = useState<PlanRepas | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [showList, setShowList] = useState(false);
  const [remplacer, setRemplacer] = useState(false);
  const [jeton, setJeton] = useState({ n: 0, restaurer: true });
  const version = useRef('');
  const envoi = useRef(nouvelId());
  const sending = useRef(false);
  const key = `coachos-mealplan:${data.profilId}:${week}`;
  const cleFormats = `coachos-shopping-formats:${data.profilId}`;

  // Filtres changés : on repart des 24 premières recettes.
  const filtres = `${search}|${category}|${cuisine}|${diet}|${rich}|${personal}`;
  const [filtresVus, setFiltresVus] = useState(filtres);
  if (filtresVus !== filtres) {
    setFiltresVus(filtres);
    setLimit(24);
  }

  useEffect(() => {
    let actif = true;
    AsyncStorage.getItem(cleFormats)
      .then((brut) => {
        const raw = JSON.parse(brut || '{}') as Record<string, unknown>;
        if (actif) setFormats(Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'number' && v > 0 && v <= 10000)) as Record<string, number>);
      })
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [cleFormats]);
  const changerFormats = (suivants: Record<string, number>) => {
    setFormats(suivants);
    AsyncStorage.setItem(cleFormats, JSON.stringify(suivants)).catch(() => {});
  };

  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const [r, c] = await Promise.all([nutrition.semaine(data.profilId, week), plansRepas.plan(data.profilId, week)]);
        const draft = jeton.restaurer ? await lireBrouillon<{ plan: Plan; version: string; envoiId: string }>(key) : null;
        if (!actif) return;
        version.current = r.version;
        envoi.current = nouvelId();
        setPlan(r.plan);
        setCoachPlan(c && c.jours.some((j) => j.length) ? c : null);
        setDirty(false);
        setError('');
        setNotice('');
        if (draft && planValide(draft.plan)) {
          setPlan(draft.plan);
          version.current = draft.version;
          envoi.current = draft.envoiId;
          setDirty(true);
          ecrireBrouillon(key, draft);
          setNotice('Brouillon récupéré : enregistrez votre semaine.');
        }
        setReady(true);
      } catch (e) {
        if (actif) setError(e instanceof Error ? e.message : 'Planning indisponible');
      } finally {
        if (actif) setLoading(false);
      }
    })();
    return () => {
      actif = false;
      brouillonsOuverts.delete(key);
    };
  }, [data.profilId, week, key, jeton]);

  const actualiser = () =>
    demanderSortie(() => {
      ecrireBrouillon(key, null);
      setLoading(true);
      setReady(false);
      setJeton((j) => ({ n: j.n + 1, restaurer: false }));
    }, [key]);

  const change = (next: Plan) => {
    setPlan(next);
    setDirty(true);
    setError('');
    ecrireBrouillon(key, { plan: next, version: version.current, envoiId: envoi.current });
  };
  const save = async () => {
    if (sending.current || !ready) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await nutrition.enregistrerSemaine(data.profilId, week, plan, version.current, envoi.current);
      setPlan(r.plan);
      version.current = r.version;
      envoi.current = nouvelId();
      setDirty(false);
      ecrireBrouillon(key, null);
      setNotice('Semaine enregistrée et disponible dans la nutrition du client et du coach.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const mois = new Date(`${week}T12:00:00Z`).getUTCMonth() + 1;
  const options = (r: Recipe) => recipeOptions(r).filter((v) => (!diet || dietFits(v, diet)) && (!rich || proteinRich(v)) && (!personal || compatible(r, v, prefs, mois)));
  const list = useMemo(() => {
    const opts = (r: Recipe) => recipeOptions(r).filter((v) => (!diet || dietFits(v, diet)) && (!rich || proteinRich(v)) && (!personal || compatible(r, v, prefs, mois)));
    const s = norm(search);
    return recipes
      .filter(
        (r) =>
          (!category || r.meals.includes(category)) &&
          (!cuisine || r.cuisineGroup === cuisine) &&
          norm(r.name + ' ' + r.variants[0].ingredients.map((i) => i.label).join(' ')).includes(s) &&
          opts(r).length,
      )
      .sort((a, b) => (personal ? Math.max(...opts(b).map((v) => preferred(v, prefs))) - Math.max(...opts(a).map((v) => preferred(v, prefs))) : 0));
  }, [search, category, cuisine, diet, rich, personal, prefs, mois]);

  const open = (r: Recipe, v?: string, p = 1, index: number | null = null) => {
    setSwaps(index !== null ? plan[day][index].swaps || [] : !v ? options(r)[0]?.presetSwaps || [] : []);
    setEditing(index);
    setSlot(
      index !== null
        ? plan[day][index].slot || 'lunch'
        : r.meal === 'sucre' || r.meal === 'sale'
          ? 'breakfast'
          : r.meal === 'collation'
            ? 'snack'
            : plan[day].some((m) => m.slot === 'lunch')
              ? 'dinner'
              : 'lunch',
    );
    setSelected(r);
    setVariant(v || options(r)[0]?.id || 'original');
    setPortion(p);
  };
  const baseV = selected?.variants.find((x) => x.id === variant) || selected?.variants[0];
  let v = baseV;
  let swapError = '';
  if (selected && baseV) {
    try {
      v = applySwaps(selected, baseV, swaps);
    } catch (e) {
      swapError = e instanceof Error ? e.message : 'Remplacement indisponible';
    }
  }
  const add = () => {
    if (!selected || !v || !ready || busy || swapError) return;
    if (editing === null && plan[day].length >= 12) {
      setError('Maximum de 12 éléments par jour.');
      return;
    }
    const item: Meal = { recipeId: selected.id, variantId: v.id, portions: portion, slot, ...(swaps.length ? { swaps } : {}) };
    const next = plan.map((d, i) => (i === day ? (editing === null ? [...d, item] : d.map((m, j) => (j === editing ? item : m))) : d));
    change(next);
    setNotice((editing === null ? 'Ajouté au ' : 'Repas mis à jour pour le ') + dateAt(week, day) + '. Enregistrez la semaine.');
    setSelected(null);
    onVue('semaine');
  };
  const generate = () => {
    try {
      if (!cible || !ready) return;
      const r = generateWeek(prefs, cible, week);
      change(r.plan);
      setNotice(r.note);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Génération impossible');
    }
  };
  const update = (index: number, p: number) => change(plan.map((d, i) => (i === day ? d.map((m, j) => (j === index ? { ...m, portions: p } : m)) : d)));
  const remove = (index: number) => change(plan.map((d, i) => (i === day ? d.filter((_, j) => j !== index) : d)));
  const shift = (n: number) =>
    demanderSortie(() => {
      setLoading(true);
      setReady(false);
      setJeton((j) => ({ n: j.n + 1, restaurer: true }));
      setWeek(weekShift(week, n));
    }, [key]);
  const targetN = cible ? targetNutrition(cible) : null;
  const colonnes = width >= 1024 ? 3 : width >= 640 ? 2 : 1;
  const duCoach = coachPlan ? planDuCoach(coachPlan) : null;
  const semaineCourses = duCoach ? duCoach.plan : plan;
  const totalDuJour = (i: number) => (coachPlan ? versNutrition(totalJour(coachPlan.jours[i])) : total(plan[i]));

  return (
    <View style={{ gap: 16 }}>
      {!!error && (
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(195,24,30,0.3)', padding: 12, gap: 8 }}>
          <Etat erreur={error} />
          <View style={{ alignSelf: 'flex-start' }}>
            <Action petit variante="contour" libelle="Actualiser" desactive={loading || busy} onPress={actualiser} />
          </View>
        </View>
      )}
      {!!notice && (
        <View {...roleWeb('status')} style={{ borderRadius: 12, backgroundColor: 'rgba(195,24,30,0.05)', padding: 12 }}>
          <Text style={ts.texte}>{notice}</Text>
        </View>
      )}
      {vue === 'recettes' ? (
        <>
          <Bloc>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ChefHat size={20} color={couleurs.rouge} />
              <View style={{ flexShrink: 1 }}>
                <Text style={ts.titre}>200 recettes · cuisines du monde</Text>
                <Text style={doux}>Des idées notées par les lecteurs, à adapter à vos objectifs.</Text>
              </View>
            </View>
            <Saisie libelle="Rechercher une recette ou un ingrédient" placeholder="Poulet, porridge, lentilles…" valeur={search} onChange={setSearch} />
            <View style={{ flexDirection: width >= 640 ? 'row' : 'column', gap: 8 }}>
              <View style={{ flex: width >= 640 ? 1 : undefined }}>
                <Selecteur libelle="Repas" options={CATEGORIES} valeur={category} onChange={setCategory} />
              </View>
              <View style={{ flex: width >= 640 ? 1 : undefined }}>
                <Selecteur libelle="Famille de cuisine" options={CUISINES} valeur={cuisine} onChange={setCuisine} />
              </View>
              <View style={{ flex: width >= 640 ? 1 : undefined }}>
                <Selecteur libelle="Régime" options={REGIMES} valeur={diet} onChange={setDiet} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
              <CaseACocher libelle="Riche en protéines" valeur={rich} onChange={setRich} />
              <CaseACocher libelle="Mes préférences enregistrées" valeur={personal} onChange={setPersonal} />
            </View>
            <Text style={doux}>
              {list.length} recettes correspondent{personal ? ' · régime, ingrédients exclus, préparation, saison et budget indicatif' : ''}. « Riche en
              protéines » : au moins 20 % de l’énergie et 10 g par portion.
            </Text>
            <Repliable resume="Sources, photos et estimations">
              <View style={{ gap: 8 }}>
                <Text style={[doux, { color: couleurs.texte }]}>
                  Chaque recette source a une note d’au moins 4/5 et au moins 10 avis relevés le 12 octobre 2026. Ces avis concernent la recette
                  originale, pas nos adaptations. Les préparations sont reformulées en français dans chaque fiche. Les photos d’illustration de l’app
                  d’origine n’ont pas été fournies : les photos affichées sont des illustrations créées pour CoachGo, pas celles des sources.
                </Text>
                <Text style={[doux, { color: couleurs.texte }]}>
                  Les calories et macros originales sont celles de l’éditeur. Les adaptations sont estimées par différence à partir de Ciqual 2025 ; les
                  quantités en cuillères et millilitres peuvent être approximatives. Les poudres utilisent les étiquettes précises indiquées dans la
                  variante.
                </Text>
                <Text style={[doux, { color: couleurs.texte }]}>
                  Les exclusions textuelles sont des filtres par mots clés, pas une vérification exhaustive des allergies. Vérifiez les ingrédients, les
                  produits composés, leurs étiquettes et les traces. La saison est indicative pour la France métropolitaine ; le budget est une estimation
                  par type d’ingrédient, sans relevé de prix.
                </Text>
                <Lien url="https://doi.org/10.57745/RDMHWY">Anses · Ciqual 2025, licence Etalab 2.0</Lien>
              </View>
            </Repliable>
          </Bloc>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {list.slice(0, limit).map((r) => {
              const choice = options(r)[0];
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  accessibilityLabel={r.name}
                  onPress={() => open(r)}
                  style={(e) => [
                    ts.carte,
                    { borderRadius: 16, padding: 16, gap: 0, width: colonnes === 1 ? '100%' : `${100 / colonnes - 2}%`, flexGrow: 1 },
                    (e as { hovered?: boolean }).hovered && { borderColor: couleurs.rouge },
                  ]}
                >
                  {photoDe(r.id) ? (
                    <View style={{ marginBottom: 12, aspectRatio: 16 / 10, width: '100%', borderRadius: 12, overflow: 'hidden', backgroundColor: 'rgba(195,24,30,0.05)' }}>
                      <Image source={photoDe(r.id)} accessible={false} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
                    </View>
                  ) : (
                    <View style={{ marginBottom: 12, aspectRatio: 16 / 10, width: '100%', borderRadius: 12, backgroundColor: 'rgba(195,24,30,0.05)', alignItems: 'center', justifyContent: 'center' }}>
                      <ChefHat size={48} color="rgba(195,24,30,0.3)" />
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <View style={{ flexShrink: 1, borderRadius: 999, backgroundColor: 'rgba(195,24,30,0.1)', paddingHorizontal: 8, paddingVertical: 4 }}>
                      <Text style={{ fontFamily: polices.texteGras, fontSize: 10, textTransform: 'uppercase', color: couleurs.rouge }}>{r.cuisine}</Text>
                    </View>
                    <Text style={doux}>{r.minutes || '—'} min</Text>
                  </View>
                  <Text style={[ts.titre, { marginTop: 12, marginBottom: 4 }]}>{r.name}</Text>
                  <Text style={[doux, { marginBottom: 12 }]}>
                    {r.meals.map((m) => mealLabels[m]).join(' · ')}
                    {choice.id !== 'original' || choice.presetSwaps ? ' · ' + choice.label : ''}
                  </Text>
                  <View style={{ marginTop: 'auto' }}>
                    <Valeurs n={choice.macros} />
                    <Text style={[doux, { marginTop: 12 }]}>
                      ★ {r.rating}/5 · {r.votes.toLocaleString('fr-FR')} avis source
                      {choice.diet !== 'omnivore' ? ' · ' + (choice.diet === 'vegan' ? 'Vegan' : 'Végétarien') : ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
          {!list.length && (
            <Bloc>
              <Text style={ts.texte}>
                Aucune recette avec ces filtres. Changez les catégories ou consultez le catalogue complet en décochant « Mes préférences enregistrées ».
              </Text>
            </Bloc>
          )}
          {list.length > limit && <Action variante="contour" libelle={`Voir plus de recettes (${list.length - limit} restantes)`} onPress={() => setLimit(limit + 24)} />}
        </>
      ) : (
        <>
          <Bloc>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <BoutonContour icone={ChevronLeft} nom="Semaine précédente" desactive={loading || busy} onPress={() => shift(-1)} />
              <View style={{ alignItems: 'center', flexShrink: 1 }}>
                <Text style={ts.titre}>Ma semaine</Text>
                <Text style={[doux, { textAlign: 'center' }]}>
                  Du {dateAt(week, 0)} au {dateAt(week, 6)}
                </Text>
              </View>
              <BoutonContour icone={ChevronRight} nom="Semaine suivante" desactive={loading || busy} onPress={() => shift(1)} />
            </View>
            {coachPlan ? (
              <Text style={ts.texte}>
                Votre coach a composé cette semaine : elle s’affiche telle qu’il l’a enregistrée, en lecture seule. La liste de courses en est tirée.
              </Text>
            ) : (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Action
                    icone={Flame}
                    libelle="Proposer mes 7 jours"
                    desactive={!ready || busy || !cible}
                    onPress={() => (plan.some((d) => d.length) ? setRemplacer(true) : generate())}
                  />
                  <Action icone={Plus} variante="contour" libelle="Choisir une recette" desactive={!ready || busy} onPress={() => onVue('recettes')} />
                  <Action icone={RefreshCw} variante="contour" nom="Actualiser le planning" desactive={loading || busy} onPress={actualiser} />
                </View>
                {!cible && (
                  <Text style={doux}>
                    Enregistrez votre profil ou demandez des objectifs au coach pour activer la proposition automatique. Vous pouvez choisir vos recettes
                    manuellement.
                  </Text>
                )}
                <Text style={doux}>
                  La proposition utilise les préférences enregistrées et {prefs.repas} repas par jour. Les totaux restent estimés et peuvent être ajustés.
                  Seule une semaine enregistrée est partagée avec le coach.
                </Text>
              </>
            )}
          </Bloc>
          {loading ? (
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={couleurs.texteDoux} />
              <Text style={ts.texte}>Chargement de la semaine…</Text>
            </View>
          ) : (
            ready && (
              <>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
                  {Array.from({ length: 7 }, (_, i) => (
                    <View key={i} style={{ width: width >= 640 ? `${100 / 7}%` : '25%', padding: 4 }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: day === i }}
                        onPress={() => setDay(i)}
                        style={{
                          minHeight: 64,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: day === i ? couleurs.rouge : couleurs.bordure,
                          backgroundColor: day === i ? 'rgba(195,24,30,0.1)' : couleurs.carte,
                          paddingHorizontal: 4,
                          paddingVertical: 8,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Text style={{ fontFamily: polices.texteGras, fontSize: 12, textAlign: 'center', color: day === i ? couleurs.rouge : couleurs.texte }}>{dateAt(week, i)}</Text>
                        <Text style={{ marginTop: 4, fontFamily: polices.texte, fontSize: 12, color: day === i ? couleurs.rouge : couleurs.texte }}>
                          {Math.round(totalDuJour(i).kcal)} kcal
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
                <Bloc>
                  <Text style={ts.titreChamp}>
                    Total du {dateAt(week, day)} {targetN ? '· objectif sous chaque valeur' : ''}
                  </Text>
                  <Valeurs n={totalDuJour(day)} cible={targetN} />
                  {targetN && (coachPlan ? coachPlan.jours[day].length > 0 : plan[day].length > 0) && (
                    <Text style={doux}>
                      Écart : {Math.round(totalDuJour(day).kcal - targetN.kcal) > 0 ? '+' : ''}
                      {Math.round(totalDuJour(day).kcal - targetN.kcal)} kcal · P {round(totalDuJour(day).protein - targetN.protein)} g · G{' '}
                      {round(totalDuJour(day).carbs - targetN.carbs)} g · L {round(totalDuJour(day).fat - targetN.fat)} g.
                    </Text>
                  )}
                </Bloc>
                {coachPlan
                  ? coachPlan.jours[day].map((r) => (
                      <Bloc key={r.id}>
                        <Miniature source={photoPlan(r)} />
                        <Text style={[ts.kicker, { fontSize: 12 }]}>{slotLabels[MOMENT_SLOT[r.moment]]}</Text>
                        <Text style={ts.titre}>{r.titre}</Text>
                        <Text style={doux}>{r.portions.toLocaleString('fr-FR')} portion(s) · choisie par votre coach</Text>
                        <Valeurs n={versNutrition(r.macros)} />
                      </Bloc>
                    ))
                  : plan[day].map((m, index) => {
                      const r = recipes.find((x) => x.id === m.recipeId)!;
                      const mv = variantOf(m)!;
                      return (
                        <Bloc key={index}>
                          <Pressable accessibilityRole="button" accessibilityLabel={'Voir ' + r.name} onPress={() => open(r, m.variantId, m.portions, index)}>
                            <Miniature source={photoDe(r.id)} />
                          </Pressable>
                          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                            <Pressable accessibilityRole="button" style={{ flexShrink: 1 }} onPress={() => open(r, m.variantId, m.portions, index)}>
                              <Text style={[ts.kicker, { fontSize: 12 }]}>{m.slot ? slotLabels[m.slot] : mealLabels[r.meal]}</Text>
                              <Text style={[ts.titre, { marginTop: 4 }]}>{r.name}</Text>
                              <Text style={[doux, { marginTop: 4 }]}>
                                {mv.label} · {r.cuisine}
                              </Text>
                            </Pressable>
                            <Action variante="fantome" icone={Trash2} nom={'Retirer ' + r.name} desactive={busy} onPress={() => remove(index)} />
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                            <View style={{ minWidth: 120 }}>
                              <Selecteur libelle="Portions" options={choixPortions(m.portions)} valeur={String(m.portions)} onChange={(p) => update(index, Number(p))} />
                            </View>
                            {!compatible(r, mv, prefs, mois) && <Text style={[doux, { color: couleurs.rouge }]}>À revoir avec vos préférences actuelles.</Text>}
                          </View>
                          <Valeurs n={multiply(mv.macros, m.portions)} />
                        </Bloc>
                      );
                    })}
                {!(coachPlan ? coachPlan.jours[day].length : plan[day].length) && (
                  <View style={{ borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, padding: 24, alignItems: 'center', gap: 12 }}>
                    <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Aucun repas prévu ce jour.</Text>
                    {!coachPlan && <Action variante="contour" libelle="Choisir dans les 200 recettes" onPress={() => onVue('recettes')} />}
                  </View>
                )}
                {!coachPlan && (
                  <Action
                    libelle={busy ? 'Enregistrement…' : dirty ? 'Enregistrer ma semaine' : 'Semaine enregistrée'}
                    chargement={busy}
                    desactive={!dirty || busy}
                    onPress={save}
                  />
                )}
                <Action
                  variante="contour"
                  icone={ShoppingBasket}
                  libelle={`${showList ? 'Masquer' : 'Voir'} la liste de courses`}
                  desactive={!(coachPlan ? coachPlan.jours.some((d) => d.length) : plan.some((d) => d.length))}
                  onPress={() => setShowList(!showList)}
                />
                {showList && <Courses plan={semaineCourses} formats={formats} onFormats={changerFormats} horsCatalogue={duCoach?.horsCatalogue ?? []} />}
              </>
            )
          )}
        </>
      )}
      {remplacer && (
        <Confirmation
          titre="Nouvelle proposition"
          texte="Remplacer les recettes de cette semaine par une nouvelle proposition ?"
          action="Remplacer"
          onConfirmer={generate}
          onFermer={() => setRemplacer(false)}
        />
      )}
      {selected && v && (
        <Modale titre={selected.name} onFermer={() => setSelected(null)}>
          {photoDe(selected.id) && (
            <View style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' }}>
              <Image source={photoDe(selected.id)} accessible={false} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
            </View>
          )}
          <Text style={doux}>
            {selected.cuisine} · {selected.minutes} min · ★ {selected.rating}/5 ({selected.votes} avis sur la recette source)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {selected.variants.map((choice) => (
              <Action
                key={choice.id}
                petit
                variante={baseV?.id === choice.id ? 'plein' : 'contour'}
                libelle={choice.label}
                onPress={() => {
                  setVariant(choice.id);
                  setSwaps([]);
                }}
              />
            ))}
          </View>
          <Selecteur
            libelle="Version"
            options={selected.variants.map((x) => ({
              cle: x.id,
              libelle: x.label + (x.diet === 'vegan' ? ' · Vegan' : x.diet === 'vegetarien' ? ' · Végétarien' : ''),
            }))}
            valeur={baseV?.id ?? ''}
            onChange={(id) => {
              setVariant(id);
              setSwaps([]);
            }}
          />
          <View style={{ borderRadius: 12, borderWidth: 1, borderColor: 'rgba(195,24,30,0.25)', backgroundColor: 'rgba(195,24,30,0.05)', padding: 16, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Leaf size={16} color={couleurs.rouge} />
              <Text style={[ts.titreChamp, { fontFamily: polices.texteGras, flexShrink: 1 }]}>Remplacer la viande, le poisson ou les fruits de mer</Text>
            </View>
            {baseV && baseV.ingredients.some((i) => replacementOptions(i, selected).length) ? (
              <>
                <Text style={doux}>
                  Choisissez une alternative : sa quantité est calculée automatiquement pour conserver le même apport en protéines. Ingrédients, macros et
                  courses se recalculent. Les quantités ci-dessous correspondent à une portion.
                </Text>
                {baseV.ingredients.map((i, index) => {
                  const choices = replacementOptions(i, selected);
                  const swap = swaps.find((s) => s.ingredientIndex === index);
                  if (!choices.length) return null;
                  return (
                    <View key={index} style={{ marginTop: 8, gap: 8 }}>
                      <Selecteur
                        libelle={i.descriptionFr || i.label}
                        options={[{ cle: '', libelle: 'Garder cet ingrédient' }, ...choices.map((c) => ({ cle: c.id, libelle: c.name }))]}
                        valeur={swap?.foodId || ''}
                        onChange={(foodId) => {
                          const next = swaps.filter((s) => s.ingredientIndex !== index);
                          if (foodId) next.push({ ingredientIndex: index, foodId, grams: proteinEquivalent(i, foodId).grams });
                          setSwaps(next);
                        }}
                      />
                      <Text style={[doux, { fontSize: 11 }]}>
                        Quantité d’origine : {i.proteinApprox ? '≈ ' : ''}
                        {round(i.proteinGrams!)} g comestibles par portion{i.proteinApprox ? ' · poids ou référence nutritionnelle estimés' : ''}.
                      </Text>
                      {swap && (
                        <>
                          <Grammes
                            valeur={swap.grams}
                            onChange={(g) => setSwaps(swaps.map((s) => (s.ingredientIndex === index ? { ...s, grams: g } : s)))}
                          />
                          <Text style={doux}>
                            Équivalence calculée : {Number(proteinEquivalent(i, swap.foodId).grams.toFixed(2))} g pour{' '}
                            {Number(proteinEquivalent(i, swap.foodId).protein.toFixed(2))} g de protéines par portion. Pour {portion} portion(s) :{' '}
                            {Number((swap.grams * portion).toFixed(2))} g de cet aliment.
                          </Text>
                          <Pressable
                            accessibilityRole="button"
                            style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}
                            onPress={() => setSwaps(swaps.map((s) => (s.ingredientIndex === index ? { ...s, grams: proteinEquivalent(i, s.foodId).grams } : s)))}
                          >
                            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.rouge, textDecorationLine: 'underline' }}>
                              Recalculer l’équivalence protéique
                            </Text>
                          </Pressable>
                          <Text style={[doux, { color: couleurs.texte }]}>{replacementFoods[swap.foodId].cook}</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <Text style={doux}>
                Cette version ne contient pas de protéine animale avec une quantité suffisamment précisée pour ce remplacement. Les autres versions
                disponibles restent dans « Version ».
              </Text>
            )}
            {!!swapError && <Etat erreur={swapError} />}
            {swaps.length > 0 && !swapError && (
              <Text style={[doux, { color: couleurs.texte }]}>
                Version obtenue : {v.diet === 'vegan' ? 'végétalienne' : v.diet === 'vegetarien' ? 'végétarienne' : 'contient encore un ingrédient animal'}. Les
                valeurs sont estimées à partir des références Ciqual ; vérifiez la composition des produits.
              </Text>
            )}
          </View>
          <Selecteur libelle="Nombre de portions" options={choixPortions(portion)} valeur={String(portion)} onChange={(p) => setPortion(Number(p))} />
          <Valeurs n={multiply(v.macros, portion)} />
          <Text style={doux}>
            1 portion = 1/{selected.yield} de la recette source ({selected.sourceYield}). Les quantités précises sont recalculées ; les dosages libres sont à
            ajuster au goût. Les ingrédients en conserve indiquent le poids net avant égouttage. Les garnitures facultatives peuvent modifier les macros.
          </Text>
          {v.adapted && (
            <View style={{ borderRadius: 8, backgroundColor: 'rgba(195,24,30,0.05)', padding: 12 }}>
              <Text style={[doux, { color: couleurs.texte }]}>
                Adaptation proposée, non évaluée par les avis de la recette source. Macros estimées ; texture et goût à ajuster.
              </Text>
            </View>
          )}
          <View>
            <Text style={ts.titre}>Ingrédients</Text>
            {v.ingredients.map((i, n) => (
              <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: n ? 1 : 0, borderTopColor: couleurs.bordure }}>
                <View style={{ flexShrink: 1 }}>
                  <Text style={ts.texte}>{i.foodName || i.descriptionFr || i.label}</Text>
                  <Text style={[doux, { fontSize: 10, marginTop: 2 }]}>
                    {i.purchaseBasis}
                    {i.amountApprox ? ' · quantité estimée à partir d’un poids moyen' : ''}
                  </Text>
                </View>
                <Text style={[ts.texte, { flexShrink: 0 }]}>{i.quantity === null ? 'À ajuster' : (i.amountApprox ? '≈ ' : '') + round(i.quantity * portion) + ' ' + i.unit}</Text>
              </View>
            ))}
          </View>
          <View style={{ gap: 12 }}>
            <Text style={ts.titre}>Préparation · étape par étape</Text>
            {preparationFor(selected, v, portion).map((step, index) => (
              <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: couleurs.rouge, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: '#FFFFFF' }}>{index + 1}</Text>
                </View>
                <Text style={[ts.texte, { flexShrink: 1, paddingTop: 4, lineHeight: 22 }]}>{step}</Text>
              </View>
            ))}
            {v.notes.map((n, i) => (
              <View key={i} style={{ borderRadius: 8, backgroundColor: couleurs.discret, padding: 12 }}>
                <Text style={ts.texte}>{n}</Text>
              </View>
            ))}
            <Lien url={selected.source} icone>{`Source et avis · ${selected.sourceName}`}</Lien>
          </View>
          <Text style={doux}>
            Allergènes repérés : {Array.from(new Set(v.ingredients.flatMap((i) => i.allergens))).join(', ') || 'aucun repéré'}. Vérifier les produits et les
            traces ; cette liste n’est pas une certification.
          </Text>
          {!compatible(selected, v, prefs, mois) && <Text style={[doux, { color: couleurs.rouge }]}>Cette version ne correspond pas à toutes vos préférences enregistrées.</Text>}
          {coachPlan ? (
            <Text style={doux}>Votre coach a composé cette semaine : elle ne se modifie pas ici.</Text>
          ) : (
            <>
              {editing === null ? (
                <Selecteur
                  libelle="Ajouter au jour"
                  options={Array.from({ length: 7 }, (_, i) => ({ cle: String(i), libelle: dateAt(week, i) }))}
                  valeur={String(day)}
                  onChange={(d) => setDay(Number(d))}
                />
              ) : (
                <View style={{ gap: 4 }}>
                  <Text style={ts.titreChamp}>Jour du repas</Text>
                  <Text style={ts.texte}>{dateAt(week, day)}</Text>
                </View>
              )}
              <Selecteur libelle="Repas" options={SLOTS} valeur={slot} onChange={setSlot} />
              <Action
                icone={Plus}
                libelle={editing === null ? 'Ajouter à ma semaine' : 'Mettre à jour ce repas'}
                desactive={!ready || busy || !!swapError || excluded(v, prefs.allergies, true)}
                onPress={add}
              />
              {excluded(v, prefs.allergies, true) && <Text style={[doux, { color: couleurs.rouge }]}>Un allergène indiqué dans votre profil est repéré dans cette version.</Text>}
              {loading && <Text style={doux}>Chargement du planning…</Text>}
            </>
          )}
        </Modale>
      )}
    </View>
  );
}

/** Quantité de remplacement (g par portion, ajustable) : le texte saisi reste tel quel, la valeur suit dès qu'elle est un nombre. */
function Grammes({ valeur, onChange }: { valeur: number; onChange: (g: number) => void }) {
  const [texte, setTexte] = useState(String(Number(valeur.toFixed(2))));
  const [vu, setVu] = useState(valeur);
  if (vu !== valeur) {
    setVu(valeur);
    if (Number(texte.replace(',', '.')) !== valeur) setTexte(String(Number(valeur.toFixed(2))));
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={doux}>Quantité de remplacement (g par portion, ajustable)</Text>
      <TextInput
        accessibilityLabel="Quantité de remplacement (g par portion, ajustable)"
        value={texte}
        inputMode="decimal"
        keyboardType="decimal-pad"
        onChangeText={(t) => {
          setTexte(t);
          onChange(Number(t.replace(',', '.')));
        }}
        style={{ minHeight: 44, borderWidth: 1, borderColor: couleurs.saisie, borderRadius: 11, paddingHorizontal: 12, fontFamily: polices.texte, fontSize: 14, color: couleurs.texte, backgroundColor: couleurs.carte }}
      />
    </View>
  );
}

function Courses({
  plan,
  formats,
  onFormats,
  horsCatalogue,
}: {
  plan: Plan;
  formats: Record<string, number>;
  onFormats: (f: Record<string, number>) => void;
  horsCatalogue: string[];
}) {
  const items = grocery(plan, formats);
  const champ = (libelle: string, cle: string, defaut: number, ok: (n: number) => boolean) => (
    <Format libelle={libelle} valeur={formats[cle] || defaut} onChange={(n) => ok(n) && onFormats({ ...formats, [cle]: n })} />
  );
  return (
    <Bloc>
      <Text style={ts.titre}>Courses · toute la semaine</Text>
      <Text style={doux}>
        Achats regroupés pour toute la semaine, avec formats indicatifs modifiables. Les besoins restent distincts selon le produit : cru ou cuit, frais ou
        conserve. Les poids moyens des pièces et les conversions estimées sont signalés ; vérifiez le format de votre paquet.
      </Text>
      {horsCatalogue.length > 0 && (
        <Text style={[doux, { color: couleurs.rouge }]}>
          Non comptées dans la liste, faute de fiche détaillée : {horsCatalogue.join(', ')}.
        </Text>
      )}
      <View>
        {items.map((i, n) => (
          <View key={i.key} style={{ paddingVertical: 12, borderTopWidth: n ? 1 : 0, borderTopColor: couleurs.bordure, gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <Text style={[ts.titreChamp, { flexShrink: 1 }]}>{i.label}</Text>
              <Text style={{ maxWidth: '55%', textAlign: 'right', fontFamily: polices.texteGras, fontSize: 14, color: couleurs.rouge }}>{i.purchase}</Text>
            </View>
            <Text style={doux}>Besoin total : {i.needed}</Text>
            <Repliable resume={<Text style={doux}>Détail par recette et format d’achat</Text>}>
              <View style={{ gap: 4 }}>
                {i.contributions.map((c, j) => (
                  <Text key={j} style={[doux, { color: couleurs.texte }]}>
                    {c.recipe} : {c.unknown ? 'dosage libre' : round(c.amount) + ' ' + c.unit}
                  </Text>
                ))}
                {!!i.product?.size && i.product.unit === i.unit && i.product.pack !== 'pièce' &&
                  champ(`Format réel du conditionnement (${i.unit})`, i.key, i.product.size, (v) => v > 0 && v <= 10000)}
                {!!i.product?.drainedSize && champ('Poids égoutté réel de la boîte (g)', i.key + ':drained', i.product.drainedSize, (v) => v > 0)}
                {!!i.product?.dryFactor && i.product.dryFactor > 1 &&
                  champ('Multiplicateur de poids après réhydratation (selon l’emballage)', i.key + ':ratio', i.product.dryFactor, (v) => v >= 1 && v <= 10)}
              </View>
            </Repliable>
          </View>
        ))}
      </View>
    </Bloc>
  );
}

function Format({ libelle, valeur, onChange }: { libelle: string; valeur: number; onChange: (n: number) => void }) {
  const [texte, setTexte] = useState(String(valeur));
  return (
    <View style={{ marginTop: 8 }}>
      <Saisie
        libelle={libelle}
        type="nombre"
        valeur={texte}
        onChange={(t) => {
          setTexte(t);
          onChange(Number(t.replace(',', '.')));
        }}
      />
    </View>
  );
}
