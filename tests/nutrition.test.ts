// Lot 5 : moteur nutrition d'origine (lib/nutrition.ts, lib/recipes.ts, lib/foodOperations.ts) porté tel quel.
import { describe, expect, it } from 'vitest';

import correspondance from '../src/data/nutrition/recettes-uuid.json';
import demo from '../src/data/recettes-demo.json';
import { blankPreferences, calculate, macros } from '../src/domain/nutrition/calcul';
import { searchCiqual } from '../src/domain/nutrition/ciqual';
import { applySwaps, proteinEquivalent, replacementOptions } from '../src/domain/nutrition/operations';
import { generateWeek, grocery, recipes, recipeOptions, total, variantOf } from '../src/domain/nutrition/recettes';

const prefs = { ...blankPreferences(), sexe: 'femme' as const, age: 34, poids: 62, taille: 168, activite: 'moderee' as const };

describe('calcul Mifflin–St Jeor', () => {
  it('donne le maintien et la répartition 20 / 30 / 50', () => {
    const c = calculate(prefs);
    // 10×62 + 6,25×168 − 5×34 − 161 = 1339 ; × 1,8 = 2410
    expect(c.repos).toBe(1339);
    expect(c.entretien).toBe(2410);
    expect(c.cible).toMatchObject({ calories: 2410, proteinesPct: 20, lipidesPct: 30, glucidesPct: 50 });
    expect(macros(c.cible!)).toEqual({ proteines: 121, lipides: 80, glucides: 301 });
  });
  it('refuse les cas réservés à un professionnel', () => {
    expect(calculate({ ...prefs, age: 17 }).cible).toBeNull();
    expect(calculate({ ...prefs, specifique: true }).cible).toBeNull();
    expect(calculate({ ...prefs, poids: 50, objectif: 'perte' }).raison).toMatch(/professionnel/);
  });
});

describe('recettes, alternatives et courses', () => {
  it('embarque les 200 recettes et des alternatives tofu ou tempeh', () => {
    expect(recipes).toHaveLength(200);
    expect(recipes.some((r) => recipeOptions(r).some((v) => v.presetSwaps?.length))).toBe(true);
  });
  it('un remplacement garde les protéines et recalcule les macros', () => {
    const r = recipes.find((x) => x.variants[0].ingredients.some((i) => replacementOptions(i, x).some((f) => f.id === 'tofu')))!;
    const index = r.variants[0].ingredients.findIndex((i) => replacementOptions(i, r).some((f) => f.id === 'tofu'));
    const { grams } = proteinEquivalent(r.variants[0].ingredients[index], 'tofu');
    const v = applySwaps(r, r.variants[0], [{ ingredientIndex: index, foodId: 'tofu', grams }]);
    expect(v.adapted).toBe(true);
    expect(v.ingredients[index].foodName).toMatch(/Tofu/);
    expect(Math.abs(v.macros.protein - r.variants[0].macros.protein)).toBeLessThan(0.5);
  });
  it('propose 7 jours de repas compatibles et en tire une liste de courses', () => {
    const c = calculate(prefs).cible!;
    const { plan, note } = generateWeek({ ...prefs, regime: 'vegetarien' }, c, '2026-10-19');
    expect(plan).toHaveLength(7);
    expect(note).toMatch(/Proposition automatique/);
    for (const jour of plan) {
      expect(jour).toHaveLength(3);
      for (const m of jour) expect(['vegan', 'vegetarien']).toContain(variantOf(m)!.diet);
      expect(total(jour).kcal).toBeGreaterThan(0);
    }
    const courses = grocery(plan);
    expect(courses.length).toBeGreaterThan(5);
    expect(courses.every((i) => i.purchase && i.needed)).toBe(true);
  });
  it('les recettes de la banque du coach se retrouvent dans le catalogue d’origine', () => {
    const map = correspondance as Record<string, string>;
    for (const r of demo as { id: string }[]) expect(recipes.some((x) => x.id === map[r.id])).toBe(true);
  });
  it('trouve un aliment Ciqual cru', () => {
    expect(searchCiqual('riz', '', 'cru').length).toBeGreaterThan(0);
  });
});
