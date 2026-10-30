// lib/recipes.ts d'origine (N02, N03) : 200 recettes, variantes, filtres de préférences, proposition de semaine et courses.
// Repris tel quel ; seules les importations changent.
import raw from '@/data/nutrition/recipes.json';

import { Preferences, Target, macros as targetMacros } from './calcul';
import { applySwaps, buildGrocery, replacementOptions, proteinEquivalent, Swap } from './operations';
export type { Swap } from './operations';
export type Nutrition = { kcal: number; protein: number; carbs: number; fat: number };
export type Ingredient = {
  label: string;
  quantity: number | null;
  unit: string;
  original: string;
  descriptionFr?: string;
  animal: string;
  allergens: string[];
  foodKey: string;
  foodName: string;
  amount: number | null;
  amountUnit: string;
  amountApprox: boolean;
  proteinRef?: string;
  proteinGrams?: number | null;
  proteinApprox?: boolean;
  purchaseBasis?: string;
  optional?: boolean;
};
export type Variant = {
  id: string;
  label: string;
  diet: string;
  macros: Nutrition;
  ingredients: Ingredient[];
  notes: string[];
  presetSwaps?: Swap[];
  steps?: string[];
  adapted: boolean;
};
export type Recipe = {
  id: string;
  name: string;
  meal: string;
  meals: string[];
  cuisine: string;
  cuisineGroup: string;
  method: string;
  prepMinutes: number;
  minutes: number;
  source: string;
  sourceName: string;
  rating: number;
  votes: number;
  checked: string;
  sourceYield: string;
  yield: number;
  summary: string;
  steps: string[];
  photo?: { path: string; author: string; license: string; licenseUrl: string; source: string; title: string; illustrative: boolean };
  variants: Variant[];
};
export const recipes = raw as Recipe[];
export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const slotLabels: Record<Slot, string> = { breakfast: 'Petit déjeuner', lunch: 'Déjeuner', dinner: 'Dîner', snack: 'Collation' };
export type Meal = { swaps?: Swap[]; slot?: Slot; recipeId: string; variantId: string; portions: number };
export type Plan = Meal[][];
export const mealLabels: Record<string, string> = {
  sucre: 'Petit déjeuner sucré',
  sale: 'Petit déjeuner salé',
  collation: 'Collation',
  plat: 'Déjeuner / dîner',
};
export const round = (n: number) => Math.round(n * 10) / 10;
export const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .toLowerCase();
export const proteinRich = (v: Variant) => v.macros.protein * 4 >= v.macros.kcal * 0.2 && v.macros.protein >= 10;
const variantCache = new Map<string, Variant>();
export function variantOf(m: Meal) {
  const r = recipes.find((r) => r.id === m.recipeId),
    v = r?.variants.find((v) => v.id === m.variantId);
  if (!r || !v) return;
  if (!m.swaps?.length) return v;
  const key = m.recipeId + '|' + m.variantId + '|' + JSON.stringify(m.swaps);
  if (variantCache.has(key)) return variantCache.get(key);
  try {
    const result = applySwaps(r, v, m.swaps);
    if (variantCache.size > 1000) variantCache.clear();
    variantCache.set(key, result);
    return result;
  } catch {
    return undefined;
  }
}
const optionCache = new Map<string, Variant[]>();
export function recipeOptions(r: Recipe): Variant[] {
  if (optionCache.has(r.id)) return optionCache.get(r.id)!;
  const list = [...r.variants],
    base = r.variants[0];
  for (const foodId of ['tofu', 'tempeh']) {
    const swaps: Swap[] = base.ingredients.flatMap((i, index) =>
      replacementOptions(i, r).some((f) => f.id === foodId) ? [{ ingredientIndex: index, foodId, grams: proteinEquivalent(i, foodId).grams }] : [],
    );
    if (swaps.length) {
      try {
        const v = applySwaps(r, base, swaps);
        if (v.diet !== 'omnivore')
          list.push({ ...v, presetSwaps: swaps, label: 'Alternative ' + foodId + ' · ' + (v.diet === 'vegan' ? 'vegan' : 'végétarienne') });
      } catch {}
    }
  }
  optionCache.set(r.id, list);
  return list;
}
export function multiply(n: Nutrition, p: number): Nutrition {
  return { kcal: n.kcal * p, protein: n.protein * p, carbs: n.carbs * p, fat: n.fat * p };
}
export const zero = (): Nutrition => ({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
export function total(day: Meal[]): Nutrition {
  return day.reduce((a, m) => {
    const v = variantOf(m);
    if (v) {
      const n = multiply(v.macros, m.portions);
      for (const k of Object.keys(a) as (keyof Nutrition)[]) a[k] += n[k];
    }
    return a;
  }, zero());
}
const aliases: Record<string, string[]> = {
  lait: ['lait', 'lactose', 'milk', 'yaourt', 'yogurt', 'yoghurt', 'fromage', 'whey', 'beurre', 'cream'],
  oeuf: ['oeuf', 'egg', 'mayonnaise'],
  gluten: ['gluten', 'ble', 'wheat', 'bread', 'flour', 'pasta', 'oat', 'avoine'],
  soja: ['soja', 'soy', 'soya', 'tofu', 'edamame', 'miso'],
  arachide: ['arachide', 'cacahuete', 'peanut'],
  noix: ['noix', 'amande', 'almond', 'walnut', 'pecan', 'hazelnut', 'cashew', 'fruits a coque'],
  sesame: ['sesame', 'tahini'],
  poisson: ['poisson', 'fish', 'saumon', 'salmon', 'thon', 'tuna', 'cabillaud', 'cod', 'haddock', 'anchovies'],
  crevette: ['crevette', 'prawn', 'shrimp'],
  celeri: ['celeri', 'celery'],
  moutarde: ['moutarde', 'mustard'],
  sulfite: ['sulfite', 'wine', 'vinegar'],
  poulet: ['poulet', 'chicken'],
  dinde: ['dinde', 'turkey'],
  boeuf: ['boeuf', 'beef'],
  porc: ['porc', 'pork', 'bacon', 'ham'],
  agneau: ['agneau', 'lamb'],
  banane: ['banane', 'banana'],
  champignon: ['champignon', 'mushroom'],
  tomate: ['tomate', 'tomato'],
  coriandre: ['coriandre', 'coriander'],
  avocat: ['avocat', 'avocado'],
  courgette: ['courgette', 'zucchini'],
  brocoli: ['brocoli', 'broccoli'],
};
const allergyTag: Record<string, string> = {
  lait: 'Lait',
  oeuf: 'Œuf',
  gluten: 'Gluten',
  soja: 'Soja',
  arachide: 'Arachide',
  noix: 'Fruits à coque',
  sesame: 'Sésame',
  poisson: 'Poisson',
  crevette: 'Crustacés',
  celeri: 'Céleri',
  moutarde: 'Moutarde',
  sulfite: 'Sulfites',
};
const word = (text: string, term: string) => new RegExp('(^|[^a-z])' + term.replace(/[^a-z ]/g, '') + 's?($|[^a-z])').test(text);
export function excluded(v: Variant, text: string, isAllergy = false): boolean {
  const t = norm(text),
    hay = norm(v.ingredients.map((i) => i.label + ' ' + i.original).join(' '));
  for (const [key, terms] of Object.entries(aliases)) {
    if (!terms.some((s) => word(t, s))) continue;
    if (isAllergy && allergyTag[key]) {
      if (v.ingredients.some((i) => i.allergens.includes(allergyTag[key]))) return true;
    } else if (terms.some((s) => word(hay, s))) return true;
  }
  const custom = t
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 35 && !s.includes(' '));
  return custom.some((s) => word(hay, s));
}
const seasonal: Record<string, number[]> = {
  strawberry: [4, 5, 6, 7, 8, 9],
  strawberries: [4, 5, 6, 7, 8, 9],
  tomato: [6, 7, 8, 9, 10],
  tomatoes: [6, 7, 8, 9, 10],
  courgette: [5, 6, 7, 8, 9, 10],
  asparagus: [4, 5, 6],
  aubergine: [6, 7, 8, 9, 10],
  raspberries: [6, 7, 8, 9],
  blueberries: [6, 7, 8, 9],
  squash: [9, 10, 11, 12, 1, 2, 3],
  leek: [9, 10, 11, 12, 1, 2, 3, 4],
  leeks: [9, 10, 11, 12, 1, 2, 3, 4],
};
export function inSeason(v: Variant, month: number) {
  return v.ingredients.every((i) => {
    const t = norm(i.original);
    if (/frozen|canned|tin|dried|puree|passata|juice/.test(t)) return true;
    return Object.entries(seasonal).every(([k, months]) => !word(t, k) || months.includes(month));
  });
}
export function dietFits(v: Variant, diet: string) {
  if (diet === 'vegetalien' || diet === 'vegan') return v.diet === 'vegan';
  if (diet === 'vegetarien') return ['vegan', 'vegetarien'].includes(v.diet);
  if (diet === 'pescetarien')
    return !v.ingredients.some(
      (i) => i.animal === 'meat' && /\b(chicken|turkey|beef|lamb|pork|ham|bacon|chorizo|duck|gelatine|gelatin)\b/i.test(i.original),
    );
  return true;
}
export function compatible(r: Recipe, v: Variant, p: Preferences, month = new Date().getMonth() + 1) {
  return (
    dietFits(v, p.regime) &&
    !excluded(v, p.exclut) &&
    !excluded(v, p.allergies, true) &&
    (!p.saison || inSeason(v, month)) &&
    (r.prepMinutes || r.minutes) <= p.preparation &&
    (p.budget !== 'economique' || !/\b(salmon|prawns|shrimp|beef|lamb|pine nuts)\b/i.test(v.ingredients.map((i) => i.original).join(' ')))
  );
}
export function preferred(v: Variant, p: Preferences) {
  const h = norm(v.ingredients.map((i) => i.label + ' ' + i.original).join(' ')),
    t = norm(p.aime);
  return Object.values(aliases).reduce((n, terms) => n + (terms.some((s) => word(t, s)) && terms.some((s) => word(h, s)) ? 1 : 0), 0);
}
export function monday(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function weekShift(s: string, n: number) {
  const d = new Date(s + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return d.toISOString().slice(0, 10);
}
export function dateAt(s: string, d: number) {
  const t = new Date(s + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + d);
  return t.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });
}
export function targetNutrition(t: Target): Nutrition {
  const m = targetMacros(t);
  return { kcal: t.calories, protein: m.proteines, carbs: m.glucides, fat: m.lipides };
}
export function grocery(plan: Plan, formats: Record<string, number> = {}) {
  return buildGrocery(
    plan
      .flatMap((day) =>
        day.map((m) => ({ variant: variantOf(m)!, portions: m.portions, recipe: recipes.find((r) => r.id === m.recipeId)?.name || 'Recette' })),
      )
      .filter((x) => !!x.variant),
    formats,
  );
}
export function generateWeek(p: Preferences, t: Target, week: string): { plan: Plan; note: string } {
  const month = new Date(week + 'T12:00:00Z').getUTCMonth() + 1;
  const pool = recipes.flatMap((r) =>
    recipeOptions(r)
      .filter((v) => compatible(r, v, p, month))
      .map((v) => ({ recipeId: r.id, variantId: v.id, portions: 1, recipe: r, variant: v, like: preferred(v, p) })),
  );
  const slots =
    p.repas === 1 ? ['plat'] : p.repas === 2 ? ['plat', 'plat'] : ['breakfast', 'plat', 'plat', ...Array(Math.max(0, p.repas - 3)).fill('collation')];
  const groups = slots.map((s) =>
    pool.filter((x) => (s === 'breakfast' ? x.recipe.meals.some((m) => ['sucre', 'sale'].includes(m)) : x.recipe.meals.includes(s))),
  );
  if (groups.some((g) => !g.length))
    throw Error('Pas assez de recettes compatibles pour chaque repas. Ajoutez des recettes manuellement ou ajustez les préférences.');
  const target = targetNutrition(t);
  let state = Date.now() % 2147483647;
  const random = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    },
    used = new Map<string, number>();
  const score = (day: Meal[]) => {
    const n = total(day);
    return (Object.keys(n) as (keyof Nutrition)[]).reduce(
      (s, k) => s + Math.pow((n[k] - target[k]) / Math.max(target[k], k === 'kcal' ? 100 : 15), 2) * (k === 'kcal' ? 2 : 1),
      0,
    );
  };
  const plan: Plan = [];
  for (let d = 0; d < 7; d++) {
    const ranked = groups.map((g) =>
      g
        .map((x) => ({ ...x, rank: random() + x.like * 0.4 - (used.get(x.recipeId) || 0) * 0.4 }))
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 35),
    );
    let best: Meal[] = [],
      bestScore = Infinity;
    for (let attempt = 0; attempt < 35; attempt++) {
      let dayMain = 0;
      const day: Meal[] = ranked.map((g, index) => {
        const x = g[Math.floor(random() * g.length)];
        return {
          recipeId: x.recipeId,
          variantId: x.variantId,
          portions: 1,
          ...(x.variant.presetSwaps ? { swaps: x.variant.presetSwaps } : {}),
          slot: (slots[index] === 'breakfast'
            ? 'breakfast'
            : slots[index] === 'collation'
              ? 'snack'
              : slots.length === 1 || dayMain++ > 0
                ? 'dinner'
                : 'lunch') as Slot,
        };
      });
      for (let pass = 0; pass < 3; pass++)
        for (let s = 0; s < day.length; s++) {
          let current = score(day),
            choice = { ...day[s] };
          for (let q = 0.5; q <= 2.5; q += 0.125) {
            day[s] = { ...choice, portions: q };
            const n = score(day);
            if (n < current) {
              current = n;
              choice = { ...day[s] };
            }
          }
          day[s] = choice;
        }
      const value = score(day) + day.reduce((v, m) => v + (used.get(m.recipeId) || 0) * 0.025, 0);
      if (value < bestScore) {
        bestScore = value;
        best = day.map((m) => ({ ...m }));
      }
    }
    plan.push(best);
    for (const m of best) used.set(m.recipeId, (used.get(m.recipeId) || 0) + 1);
  }
  const gap = Math.max(...plan.map((day) => Math.abs(total(day).kcal - target.kcal) / target.kcal));
  return {
    plan,
    note:
      'Proposition automatique à relire. Les portions cherchent à rapprocher calories et macros ; aucune égalité exacte n’est garantie.' +
      (gap > 0.15 ? ' Certains jours restent à plus de 15 % de l’objectif calorique : ajustez les repas.' : ''),
  };
}
export function preparationFor(r: Recipe, v: Variant, portions = 1): string[] {
  let steps = [...(v.steps || r.steps)];
  const base = r.variants[0];
  if (v.adapted && !v.steps) {
    for (let i = 0; i < base.ingredients.length; i++) {
      const from = base.ingredients[i],
        to = v.ingredients[i];
      if (!to || from.original === to.original) continue;
      const english = from.original.toLowerCase();
      const token = /chicken/.test(english)
        ? 'poulet'
        : /turkey/.test(english)
          ? 'dinde'
          : /beef/.test(english)
            ? 'bœuf'
            : /salmon/.test(english)
              ? 'saumon'
              : /cod|haddock/.test(english)
                ? 'cabillaud|poisson'
                : /prawn|shrimp/.test(english)
                  ? 'crevettes?'
                  : /egg/.test(english)
                    ? 'œufs?'
                    : /yog/.test(english)
                      ? 'yaourt'
                      : /milk/.test(english)
                        ? 'lait'
                        : '';
      if (token) {
        const replacement = to.label.replace(/\s*\([^)]*\)/g, '');
        steps = steps.map((s) => {
          if (/egg/.test(english) && /tofu/.test(to.original) && /pocher|logements|creux|casser|omelette|battre les|battre l’œuf|brouiller/i.test(s))
            return 'Émietter le tofu et le faire revenir 5 à 8 min avec un peu de l’huile prévue. Le répartir avec les légumes ou la sauce déjà préparés ; cette version ne se poche pas et ne forme pas une omelette.';
          if (/milk/.test(english)) s = s.replace(/du lait/gi, 'de la boisson au soja').replace(/le lait/gi, 'la boisson au soja');
          return s.replace(new RegExp(token, 'gi'), replacement);
        });
      }
    }
    if (v.id.endsWith('-protein'))
      steps.push(
        'Après cuisson éventuelle et tiédissement, incorporer la poudre protéinée indiquée dans les ingrédients. Ajouter un peu d’eau progressivement si nécessaire et ajuster l’arôme à votre goût.',
      );
  }
  return steps.map((s) =>
    s.replace(/\{(\d+(?:\.\d+)?)ml\}/g, (_, amount) => round((Number(amount) * portions) / r.yield).toLocaleString('fr-FR') + ' ml'),
  );
}
