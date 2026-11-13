// lib/personalFood.ts et lib/foodSearch.ts d'origine : journal, recettes personnelles, fiches Open Food Facts.
import { z } from 'zod';
export const nutrient = z.number().finite().min(0).max(2000);
export const food = z.object({
  name: z.string().trim().min(1).max(200),
  barcode: z.string().max(20).default(''),
  source: z.enum(['manual', 'off', 'recipe', 'ciqual']).default('manual'),
  reference: z.string().max(30).default(''),
  note: z.string().max(2000).default(''),
  basis: z.enum(['g', 'ml', 'portion']),
  kcal: nutrient,
  protein: nutrient,
  carbs: nutrient,
  fat: nutrient,
});
export const entry = z.object({
  id: z.string().min(1).max(64),
  food,
  amount: z.number().finite().positive().max(10000),
  measure: z.string().max(100).optional(),
  measureCount: z.number().finite().positive().max(10000).optional(),
  measureSize: z.number().finite().positive().max(10000).optional(),
  meal: z.enum(['Petit déjeuner', 'Déjeuner', 'Dîner', 'Collation']),
});
export const personalRecipe = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  servings: z.number().finite().positive().max(100),
  ingredients: z.array(entry).min(1).max(100),
  steps: z.string().max(10000),
});
export const library = z.array(personalRecipe).max(200);
export const diary = z.array(entry).max(100);
export type Food = z.infer<typeof food>;
export type Entry = z.infer<typeof entry>;
export type PersonalRecipe = z.infer<typeof personalRecipe>;
export function foodTotal(entries: Entry[]) {
  return entries.reduce(
    (total, e) => {
      const ratio = e.amount / (e.food.basis === 'portion' ? 1 : 100);
      for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) total[key] += e.food[key] * ratio;
      return total;
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
export function recipeFood(recipe: PersonalRecipe): Food {
  const sum = foodTotal(recipe.ingredients);
  return {
    name: recipe.name,
    barcode: '',
    source: 'recipe',
    reference: '',
    note: '',
    basis: 'portion',
    kcal: sum.kcal / recipe.servings,
    protein: sum.protein / recipe.servings,
    carbs: sum.carbs / recipe.servings,
    fat: sum.fat / recipe.servings,
  };
}
export function parseProduct(payload: any, barcode: string) {
  const p = payload?.product;
  if (payload?.status !== 1 || !p) return null;
  const n = p.nutriments || {};
  const value = (key: string) => {
    const v = n[key];
    if (v === null || v === undefined || v === '') return null;
    const num = Number(v);
    return Number.isFinite(num) && num >= 0 && num <= 2000 ? num : null;
  };
  const kj = value('energy-kj_100g');
  return {
    name: String(p.product_name_fr || p.product_name || p.generic_name_fr || 'Produit ' + barcode).slice(0, 200),
    brand: String(p.brands || '').slice(0, 200),
    barcode,
    basis: /100\s*ml/i.test(p.nutrition_data_per || '') ? ('ml' as const) : ('g' as const),
    kcal: value('energy-kcal_100g') ?? (kj !== null ? kj / 4.184 : null),
    protein: value('proteins_100g'),
    carbs: value('carbohydrates_100g'),
    fat: value('fat_100g'),
    ingredients: String(p.ingredients_text_fr || p.ingredients_text || '').slice(0, 4000),
    allergens: String(p.allergens || '').slice(0, 1000),
    sourceUrl: 'https://world.openfoodfacts.org/product/' + barcode,
  };
}
export const namedProduct = z.object({ barcode: z.string(), name: z.string(), brand: z.string(), quantity: z.string() });
export type NamedProduct = z.infer<typeof namedProduct>;
export function foodSearchQuery(value: string, france: boolean) {
  const words = value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) throw Error('Saisissez un nom de produit ou de marque.');
  return words.map((word) => word.toLowerCase()).join(' ') + (france ? ' AND countries_tags:"en:france"' : '');
}
export function namedProducts(payload: any): NamedProduct[] {
  const codes = new Set<string>();
  return (Array.isArray(payload?.hits) ? payload.hits : [])
    .flatMap((p: any) => {
      const barcode = String(p.code || '');
      if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(barcode) || codes.has(barcode)) return [];
      codes.add(barcode);
      const raw = p.product_name,
        name = typeof raw === 'string' ? raw : raw?.fr || raw?.en || '';
      const brands = Array.isArray(p.brands) ? p.brands : String(p.brands || '').split(',');
      return [
        {
          barcode,
          name: String(name || 'Produit ' + barcode).slice(0, 200),
          brand: [...new Set(brands.map((s: any) => String(s).trim()).filter(Boolean))].join(', ').slice(0, 200),
          quantity: String(p.quantity || '').slice(0, 100),
        },
      ];
    })
    .slice(0, 12);
}
