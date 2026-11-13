// lib/foodOperations.ts d'origine : remplacements de protéines à équivalence, recalcul des macros et des étapes, liste de courses.
// Repris tel quel ; seules les importations changent.
import catalog from '@/data/nutrition/recipeFoods.json';
import type { Recipe, Variant, Ingredient, Nutrition } from './recettes';
export type Swap = { ingredientIndex: number; foodId: string; grams: number };
type Food = { id: string; name: string; allergens: string[]; nutrition: Nutrition & { code: string; name: string }; foodKey: string; cook: string };
type Product = {
  id: string;
  name: string;
  pack: string;
  size: number | null;
  unit: string;
  piece?: number | null;
  tbsp?: number | null;
  drained?: boolean;
  dryFactor?: number;
  drainedSize?: number;
};
export const replacementFoods = catalog.replacements as Record<string, Food>;
const refs = catalog.refs as Record<string, (Nutrition & { name: string; code: string }) | null>;
export const products = catalog.products as Record<string, Product>;
export function replacementOptions(i: Ingredient, r: Recipe) {
  if (!i.proteinRef || !i.proteinGrams || !refs[i.proteinRef]) return [];
  const shaped = /burger|meatball|kofte|kebab|skewer|kafta/.test(r.id);
  return Object.values(replacementFoods).filter((f) => !shaped || ['tofu', 'tempeh', 'seitan', 'soyText'].includes(f.id));
}
export function applySwaps(r: Recipe, base: Variant, swaps: Swap[] = []): Variant {
  if (!swaps.length) return base;
  if (swaps.length > 12 || new Set(swaps.map((s) => s.ingredientIndex)).size !== swaps.length)
    throw Error('Remplacements en double ou trop nombreux.');
  const ingredients = base.ingredients.map((i) => ({ ...i })),
    nutrition = { ...base.macros },
    notes = [...base.notes],
    changes: { from: string; to: string; cook: string }[] = [];
  for (const swap of swaps) {
    const i = base.ingredients[swap.ingredientIndex],
      food = replacementFoods[swap.foodId];
    if (
      !Number.isInteger(swap.ingredientIndex) ||
      !i ||
      !food ||
      !replacementOptions(i, r).some((f) => f.id === food.id) ||
      !Number.isFinite(swap.grams) ||
      swap.grams < 1 ||
      swap.grams > 1000
    )
      throw Error('Remplacement invalide.');
    const old = refs[i.proteinRef!]!,
      oldGrams = i.proteinGrams!;
    for (const key of ['kcal', 'protein', 'carbs', 'fat'] as const) nutrition[key] += (food.nutrition[key] * swap.grams - old[key] * oldGrams) / 100;
    ingredients[swap.ingredientIndex] = {
      ...i,
      label: food.name,
      descriptionFr: food.name,
      original:
        food.id === 'chickpeas'
          ? 'canned chickpeas drained'
          : food.id === 'lentils'
            ? 'cooked lentils'
            : food.id === 'whiteBeans'
              ? 'canned white beans drained'
              : food.id === 'soyText'
                ? 'rehydrated soy textured protein'
                : food.id,
      quantity: swap.grams,
      unit: 'g',
      animal: '',
      allergens: food.allergens,
      foodKey: food.foodKey,
      foodName: food.name,
      amount: swap.grams,
      amountUnit: 'g',
      amountApprox: false,
      proteinRef: undefined,
      proteinGrams: undefined,
      purchaseBasis:
        food.id === 'soyText'
          ? 'poids après réhydratation'
          : food.id === 'chickpeas' || food.id === 'whiteBeans'
            ? 'poids égoutté'
            : 'quantité des ingrédients',
    };
    notes.push(
      i.foodName +
        ' → ' +
        food.name +
        ' : ' +
        Math.round(swap.grams) +
        ' g par portion. ' +
        food.cook +
        (i.proteinApprox ? ' La quantité de protéine d’origine est estimée.' : ''),
    );
    changes.push({ from: i.original, to: food.name, cook: food.cook });
  }
  if (Object.values(nutrition).some((n) => !Number.isFinite(n) || n < -0.5))
    throw Error('Les valeurs de la source ne permettent pas ce remplacement avec ces quantités. Choisissez une autre quantité ou alternative.');
  for (const k of Object.keys(nutrition) as (keyof Nutrition)[]) nutrition[k] = Math.max(0, nutrition[k]);
  const diet = ingredients.some((i) => i.animal === 'meat')
    ? 'omnivore'
    : ingredients.some((i) => ['egg', 'dairy', 'honey'].includes(i.animal))
      ? 'vegetarien'
      : 'vegan';
  // The replacement is cooked separately. Protein-only operations are replaced;
  // steps involving vegetables keep their method and explicitly omit the source protein.
  const steps = (base.steps || r.steps).map((step) => {
    const involves = changes.filter((c) => {
      const t = c.from.toLowerCase();
      const pattern = /chicken/.test(t)
        ? /poulet/i
        : /turkey/.test(t)
          ? /dinde/i
          : /beef/.test(t)
            ? /bœuf|boeuf/i
            : /lamb/.test(t)
              ? /agneau/i
              : /pork|ham|bacon/.test(t)
                ? /porc|jambon|bacon/i
                : /prawn|shrimp/.test(t)
                  ? /crevette/i
                  : /salmon/.test(t)
                    ? /saumon/i
                    : /tuna/.test(t)
                      ? /thon/i
                      : /trout/.test(t)
                        ? /truite/i
                        : /poisson|cabillaud|églefin|fruits de mer/i;
      return pattern.test(step);
    });
    if (!involves.length) return step;
    const vegetables =
      /oignon|carotte|courgette|poivron|tomate|riz|pomme de terre|légume|champignon|sauce|bouillon|nouille|épice|marinade|persil|huile|ail/i.test(
        step,
      );
    if (!vegetables) return 'Préparer la protéine végétale séparément : ' + involves.map((c) => c.cook).join(' ');
    return (
      step +
      ' Pour ce remplacement : réaliser cette étape sans la protéine d’origine ; préparer l’alternative séparément selon la consigne ci-dessous et l’ajouter en fin de cuisson.'
    );
  });
  steps.push(
    'Ajouter les alternatives à la sauce ou aux légumes cuits : ' +
      changes.map((c) => c.to + ' — ' + c.cook).join(' ') +
      ' Garder les cuissons du riz, des pâtes et des légumes. Les durées longues de cuisson de la viande ne s’appliquent pas aux alternatives déjà cuites.',
  );
  if (ingredients.some((i) => i.animal === 'meat'))
    notes.push(
      'Il reste un ingrédient animal dans cette recette (par exemple un bouillon ou une sauce). Ce remplacement seul ne rend pas toute la recette végétarienne.',
    );
  return { ...base, ingredients, macros: nutrition, diet, notes, steps, label: 'Mes remplacements', adapted: true };
}
export type GroceryItem = {
  key: string;
  label: string;
  unit: string;
  quantity: number;
  drainedQuantity: number;
  packageQuantity: number;
  unknown: boolean;
  approx: boolean;
  purchase: string;
  needed: string;
  product?: Product;
  contributions: { recipe: string; amount: number; unit: string; unknown: boolean }[];
};
const precise = (q: number, u: string) => Math.round(q * 10) / 10 + ' ' + u;
function purchaseText(item: GroceryItem, override?: number) {
  const p = item.product,
    size = override || p?.size;
  if (!p || !size || p.unit !== item.unit) return 'Format à choisir en magasin';
  const dry = p.dryFactor || 1,
    q = item.quantity / dry,
    count = Math.max(item.unknown ? 1 : 0, Math.ceil(q / size + item.drainedQuantity / (p.drainedSize || size) + item.packageQuantity - 1e-8));
  const amount = size >= 1000 && p.unit === 'ml' ? (size / 1000).toLocaleString('fr-FR') + ' l' : size + ' ' + p.unit;
  if (p.pack === 'pièce') {
    const singular: Record<string, string> = {
      'Tomates fraîches': 'tomate',
      Oignons: 'oignon',
      'Oignons rouges': 'oignon rouge',
      Carottes: 'carotte',
      Courgettes: 'courgette',
      Aubergines: 'aubergine',
      'Poivrons rouges': 'poivron rouge',
      'Poivrons jaunes': 'poivron jaune',
      'Poivrons verts': 'poivron vert',
      Poivrons: 'poivron',
      Concombres: 'concombre',
      Poireaux: 'poireau',
      Avocats: 'avocat',
      Bananes: 'banane',
      Pommes: 'pomme',
      Citrons: 'citron',
      'Citrons verts': 'citron vert',
      Oranges: 'orange',
      Mangues: 'mangue',
      'Patates douces': 'patate douce',
    };
    return count + ' ' + (count === 1 ? singular[item.label] || item.label.toLowerCase() : item.label.toLowerCase());
  }
  if (p.pack === 'boîte de 6') return count + ' boîte' + (count > 1 ? 's' : '') + ' de 6 œufs';
  if (p.pack === 'tête') return count + ' tête' + (count > 1 ? 's' : '') + ' d’ail';
  if (['botte', 'pied', 'morceau'].includes(p.pack)) return count + ' ' + p.pack + (count > 1 ? 's' : '') + ' de ' + item.label.toLowerCase();
  return (
    count +
    ' ' +
    p.pack +
    (count > 1 ? 's' : '') +
    ' de ' +
    amount +
    (p.drained ? ' égouttés' : p.drainedSize ? ' (dont ' + p.drainedSize + ' g égouttés)' : '')
  );
}
export function buildGrocery(entries: { variant: Variant; portions: number; recipe: string }[], formats: Record<string, number> = {}): GroceryItem[] {
  const map = new Map<string, GroceryItem>();
  for (const entry of entries)
    for (const i of entry.variant.ingredients) {
      if (i.optional) continue;
      const q = i.amount === null || i.amount === undefined ? null : i.amount * entry.portions,
        originalUnit = i.amountUnit || i.unit,
        u = originalUnit === 'boîte' ? products[i.foodKey]?.unit || 'g' : originalUnit,
        key = i.foodKey + '|' + u;
      let item = map.get(key);
      if (!item) {
        item = {
          key,
          label: i.foodName || i.label,
          unit: u,
          quantity: 0,
          drainedQuantity: 0,
          packageQuantity: 0,
          unknown: false,
          approx: false,
          purchase: '',
          needed: '',
          product: products[i.foodKey],
          contributions: [],
        };
        map.set(key, item);
      }
      if (q === null) item.unknown = true;
      else if (originalUnit === 'boîte') item.packageQuantity += q;
      else if (item.product?.drainedSize && i.purchaseBasis === 'poids égoutté') item.drainedQuantity += q;
      else item.quantity += q;
      item.approx ||= i.amountApprox;
      item.contributions.push({ recipe: entry.recipe, amount: q || 0, unit: originalUnit, unknown: q === null });
    }
  // Unknown garnish amounts join the known amount for the same actual product.
  for (const [key, item] of [...map])
    if (item.unknown && !item.quantity && !item.drainedQuantity && !item.packageQuantity) {
      const same = [...map.values()].find((x) => x !== item && x.product?.id === item.product?.id && (x.quantity > 0 || x.drainedQuantity > 0));
      if (same) {
        same.unknown = true;
        same.contributions.push(...item.contributions);
        map.delete(key);
      }
    }
  return [...map.values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'))
    .map((item) => {
      if (item.product)
        item.product = {
          ...item.product,
          drainedSize: formats[item.key + ':drained'] || item.product.drainedSize,
          dryFactor: formats[item.key + ':ratio'] || item.product.dryFactor,
        };
      return {
        ...item,
        purchase: purchaseText(item, formats[item.key]),
        needed:
          (item.approx ? '≈ ' : '') +
          (item.drainedQuantity
            ? (item.quantity ? precise(item.quantity, item.unit) + ' net + ' : '') + precise(item.drainedQuantity, item.unit) + ' égouttés'
            : precise(item.quantity, item.unit) + (item.product?.drainedSize ? ' net' : '')) +
          (item.packageQuantity ? ' + ' + Math.round(item.packageQuantity * 100) / 100 + ' boîte(s), format de la recette non précisé' : '') +
          (item.unknown ? ' + un dosage libre' : '') +
          (item.product?.dryFactor && item.product.dryFactor > 1
            ? ' réhydratés · achat sec ≈ ' + Math.round(item.quantity / item.product.dryFactor) + ' g (ratio indicatif)'
            : ''),
      };
    });
}

export const proteinReference = (i: Ingredient) => (i.proteinRef ? refs[i.proteinRef]?.name || 'Référence non disponible' : '');

// Keep full precision in stored quantities and macro calculations.
export function proteinEquivalent(i: Ingredient, foodId: string) {
  const original = i.proteinRef ? refs[i.proteinRef] : null,
    food = replacementFoods[foodId];
  if (!original || !food || !i.proteinGrams || original.protein <= 0 || food.nutrition.protein <= 0)
    throw Error('Équivalence protéique indisponible.');
  const protein = (i.proteinGrams * original.protein) / 100;
  const grams = (protein * 100) / food.nutrition.protein;
  if (!Number.isFinite(grams) || grams <= 0) throw Error('Équivalence protéique invalide.');
  return { protein, grams };
}
