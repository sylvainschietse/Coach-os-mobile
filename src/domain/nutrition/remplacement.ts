// « Remplacer ce repas » : pour un repas de la semaine, trois recettes d'une autre idée, du même moment de la journée,
// compatibles avec les préférences du client, dont les portions sont ajustées pour approcher les mêmes macros.
import type { Preferences } from './calcul';
import { compatible, multiply, preferred, recipeOptions, recipes, variantOf, type Meal, type Nutrition, type Recipe, type Slot, type Variant } from './recettes';

export interface Alternative {
  meal: Meal;
  recipe: Recipe;
  variant: Variant;
  /** Macros pour les portions proposées. */
  macros: Nutrition;
  /** Écart en kcal avec le repas remplacé (positif : plus calorique). */
  ecartKcal: number;
}

const PORTIONS = Array.from({ length: 17 }, (_, i) => 0.5 + i * 0.125); // 0,5 → 2,5

/** Les catégories de recettes qui conviennent à ce moment de repas (comme la proposition de semaine). */
function convientAuMoment(r: Recipe, slot: Slot | undefined, origine: Recipe) {
  if (slot === 'breakfast') return r.meals.some((m) => m === 'sucre' || m === 'sale');
  if (slot === 'snack') return r.meals.includes('collation');
  if (slot === 'lunch' || slot === 'dinner') return r.meals.includes('plat');
  return r.meals.some((m) => origine.meals.includes(m));
}

/** Distance entre deux apports : les calories comptent double, chaque macro est rapportée à la valeur visée. */
export function distanceMacros(n: Nutrition, cible: Nutrition) {
  return (Object.keys(cible) as (keyof Nutrition)[]).reduce(
    (s, k) => s + Math.pow((n[k] - cible[k]) / Math.max(cible[k], k === 'kcal' ? 100 : 10), 2) * (k === 'kcal' ? 2 : 1),
    0,
  );
}

/**
 * Jusqu'à `nombre` recettes pour remplacer `meal`. `exclues` : recettes déjà au menu ce jour-là ou déjà proposées
 * (pour « D'autres idées »). Une seule version par recette, la plus proche.
 */
export function alternativesRepas(
  meal: Meal,
  prefs: Preferences,
  opts: { exclues?: string[]; nombre?: number; mois?: number } = {},
): Alternative[] {
  const origine = recipes.find((r) => r.id === meal.recipeId);
  const v0 = variantOf(meal);
  if (!origine || !v0) return [];
  const cible = multiply(v0.macros, meal.portions);
  const exclues = new Set([meal.recipeId, ...(opts.exclues ?? [])]);
  const mois = opts.mois ?? new Date().getMonth() + 1;
  const candidats: (Alternative & { score: number })[] = [];
  for (const r of recipes) {
    if (exclues.has(r.id) || !convientAuMoment(r, meal.slot, origine)) continue;
    let meilleur: (Alternative & { score: number }) | undefined;
    for (const v of recipeOptions(r)) {
      if (!compatible(r, v, prefs, mois)) continue;
      for (const p of PORTIONS) {
        const n = multiply(v.macros, p);
        // Un peu de bonus pour les aliments aimés, sans passer devant un écart de macros net.
        const score = distanceMacros(n, cible) - preferred(v, prefs) * 0.02;
        if (!meilleur || score < meilleur.score)
          meilleur = {
            meal: { recipeId: r.id, variantId: v.id, portions: p, ...(meal.slot ? { slot: meal.slot } : {}), ...(v.presetSwaps ? { swaps: v.presetSwaps } : {}) },
            recipe: r,
            variant: v,
            macros: n,
            ecartKcal: Math.round(n.kcal - cible.kcal),
            score,
          };
      }
    }
    if (meilleur) candidats.push(meilleur);
  }
  return candidats
    .sort((a, b) => a.score - b.score)
    .slice(0, opts.nombre ?? 3)
    .map(({ score: _score, ...a }) => a);
}
