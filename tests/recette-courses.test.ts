// Recette REC-081 / REC-082 : la liste de courses ne fusionne pas des produits différents et distingue le besoin de l'achat.
import { describe, expect, it } from 'vitest';

import { buildGrocery } from '../src/domain/nutrition/operations';
import type { Ingredient, Variant } from '../src/domain/nutrition/recettes';

const ing = (foodKey: string, foodName: string, amount: number, amountUnit: string): Ingredient =>
  ({ label: foodName, quantity: amount, unit: amountUnit, original: foodName, animal: '', allergens: [], foodKey, foodName, amount, amountUnit, amountApprox: false }) as Ingredient;
const variante = (ingredients: Ingredient[]): Variant => ({ id: 'v', label: 'Base', diet: '', macros: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, ingredients, notes: [], adapted: false });

describe('liste de courses', () => {
  it('tomates fraîches, concassées et pelées restent trois lignes', () => {
    const liste = buildGrocery([
      { variant: variante([ing('tomatoFresh', 'Tomates fraîches', 240, 'g'), ing('tomatoCanCrushed', 'Tomates concassées en conserve', 200, 'g')]), portions: 1, recipe: 'A' },
      { variant: variante([ing('tomatoCanWhole', 'Tomates entières en conserve', 400, 'g')]), portions: 1, recipe: 'B' },
    ]);
    expect(liste.map((l) => l.label).sort()).toEqual(['Tomates concassées en conserve', 'Tomates entières en conserve', 'Tomates fraîches']);
  });

  it('700 ml de lait : besoin exact et brique de 1 L distincts', () => {
    const [lait] = buildGrocery([
      { variant: variante([ing('milkSemi', 'Lait demi-écrémé', 350, 'ml')]), portions: 2, recipe: 'A' },
    ]);
    expect(lait.quantity).toBe(700);
    expect(lait.needed).toMatch(/700\s?ml/);
    expect(lait.purchase).toMatch(/1 brique/);
    expect(lait.purchase).not.toMatch(/700/);
  });
});
