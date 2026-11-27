// « Remplacer ce repas » : trois recettes du même moment, compatibles avec le profil, aux macros proches.
import { describe, expect, it } from 'vitest';

import { blankPreferences } from '../src/domain/nutrition/calcul';
import { dietFits, multiply, recipes, variantOf, type Meal } from '../src/domain/nutrition/recettes';
import { alternativesRepas, distanceMacros } from '../src/domain/nutrition/remplacement';

const prefs = { ...blankPreferences(), preparation: 180 };
const plat = recipes.find((r) => r.meals.includes('plat'))!;
const repas: Meal = { recipeId: plat.id, variantId: plat.variants[0].id, portions: 1, slot: 'lunch' };

describe('remplacer un repas', () => {
  it('propose trois autres recettes de déjeuner / dîner', () => {
    const a = alternativesRepas(repas, prefs, { mois: 11 });
    expect(a).toHaveLength(3);
    expect(new Set(a.map((x) => x.recipe.id)).size).toBe(3);
    for (const x of a) {
      expect(x.recipe.id).not.toBe(plat.id);
      expect(x.recipe.meals).toContain('plat');
      expect(x.meal.slot).toBe('lunch');
    }
  });

  it('ajuste les portions pour rester près des calories du repas remplacé', () => {
    const cible = multiply(variantOf(repas)!.macros, 1);
    const a = alternativesRepas(repas, prefs, { mois: 11 });
    for (const x of a) {
      expect(Math.abs(x.ecartKcal)).toBeLessThan(cible.kcal * 0.15);
      expect(x.meal.portions).toBeGreaterThanOrEqual(0.5);
      expect(x.meal.portions).toBeLessThanOrEqual(2.5);
      expect(distanceMacros(x.macros, cible)).toBeLessThan(1);
    }
  });

  it('respecte le régime et les recettes exclues', () => {
    const vege = { ...prefs, regime: 'vegetarien' as const };
    const premieres = alternativesRepas(repas, vege, { mois: 11 });
    for (const x of premieres) expect(dietFits(x.variant, 'vegetarien')).toBe(true);
    const suivantes = alternativesRepas(repas, vege, { mois: 11, exclues: premieres.map((x) => x.recipe.id) });
    expect(suivantes.some((x) => premieres.some((p) => p.recipe.id === x.recipe.id))).toBe(false);
  });

  it('remplace un petit déjeuner par un petit déjeuner', () => {
    const pdj = recipes.find((r) => r.meals.includes('sucre') || r.meals.includes('sale'))!;
    const a = alternativesRepas({ recipeId: pdj.id, variantId: pdj.variants[0].id, portions: 1, slot: 'breakfast' }, prefs, { mois: 11 });
    expect(a.length).toBeGreaterThan(0);
    for (const x of a) expect(x.recipe.meals.some((m) => m === 'sucre' || m === 'sale')).toBe(true);
  });

  it('ne propose rien pour une recette inconnue', () => {
    expect(alternativesRepas({ recipeId: 'inconnue', variantId: 'x', portions: 1 }, prefs)).toEqual([]);
  });
});
