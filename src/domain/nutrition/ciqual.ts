// lib/ciqual.ts d'origine : recherche dans la table Ciqual 2025 (Anses, Licence Ouverte Etalab 2.0).
import catalogue from '@/data/nutrition/ciqual.json';
export type CiqualFood = (typeof catalogue.foods)[number];
export const ciqualFoods = catalogue.foods;
export const ciqualGroups = [...new Set(ciqualFoods.map((f) => f.group))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
export const normalizeFoodName = (value: string) =>
  value
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const indexed = ciqualFoods.map((food) => ({ food, text: normalizeFoodName(food.name) }));
export function searchCiqual(query: string, group = '', state = '', limit = 30) {
  const normalized = normalizeFoodName(query),
    terms = normalized.split(' ').filter(Boolean);
  if (normalized.length < 2 && !group && !state) return [];
  return indexed
    .filter(
      ({ food, text }) =>
        (!group || food.group === group) &&
        terms.every((term) => text.includes(term)) &&
        (!state ||
          (state === 'cru'
            ? /\bcru(?:e|s|es)?\b/.test(text)
            : /\b(?:cuit(?:e|s|es)?|bouilli(?:e|s|es)?|grille(?:e|s|es)?|roti(?:e|s|es)?|vapeur)\b/.test(text))),
    )
    .sort((a, b) => {
      const score = (x: typeof a) => (x.text === normalized ? 0 : x.text.startsWith(normalized) ? 1 : 2);
      return score(a) - score(b) || a.food.name.localeCompare(b.food.name, 'fr');
    })
    .slice(0, limit)
    .map((x) => x.food);
}
