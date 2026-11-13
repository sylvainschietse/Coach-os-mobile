// lib/foodMeasures.ts d'origine : unités pratiques (cuillères, pièces, tasses) et poids estimés.
type Measure = { id: string; label: string; size: number; approx: boolean };
const clean = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe');
export function foodMeasures(name: string, basis: 'g' | 'ml' | 'portion'): Measure[] {
  if (basis === 'portion') return [];
  if (basis === 'ml')
    return [
      { id: 'tsp', label: 'Cuillère à café rase', size: 5, approx: false },
      { id: 'tbsp', label: 'Cuillère à soupe rase', size: 15, approx: false },
      { id: 'cup', label: 'Tasse de 250 ml', size: 250, approx: false },
    ];
  const n = clean(name),
    spoons = (tsp: number, tbsp: number): Measure[] => [
      { id: 'tsp', label: 'Cuillère à café rase', size: tsp, approx: true },
      { id: 'tbsp', label: 'Cuillère à soupe rase', size: tbsp, approx: true },
    ];
  // Solid food names take precedence over a filling/brand such as Nutella.
  if (/crepe/.test(n)) return [{ id: 'piece', label: 'Crêpe (pièce)', size: 60, approx: true }];
  if (/pancake/.test(n)) return [{ id: 'piece', label: 'Pancake (pièce)', size: 40, approx: true }];
  if (/gaufre/.test(n)) return [{ id: 'piece', label: 'Gaufre (pièce)', size: 50, approx: true }];
  if (/muffin/.test(n)) return [{ id: 'piece', label: 'Muffin (pièce)', size: 70, approx: true }];
  if (/biscuit|cookie/.test(n)) return [{ id: 'piece', label: 'Biscuit (pièce)', size: 15, approx: true }];
  if (/barre|b-ready/.test(n)) return [{ id: 'piece', label: 'Barre (pièce)', size: 25, approx: true }];
  if (/nutella|pate a tartiner|confiture/.test(n)) return spoons(5, 15);
  if (/miel/.test(n)) return spoons(7, 21);
  if (/huile/.test(n)) return spoons(4.5, 13.5);
  if (/beurre/.test(n)) return spoons(5, 15);
  if (/farine|whey|poudre.*proteine|proteine.*poudre/.test(n)) return [...spoons(3, 9), { id: 'cup', label: 'Tasse', size: 120, approx: true }];
  if (/flocon|avoine/.test(n)) return [...spoons(2, 6), { id: 'cup', label: 'Tasse', size: 90, approx: true }];
  if (/sucre/.test(n)) return spoons(4, 12);
  if (/riz/.test(n)) return [{ id: 'cup', label: 'Tasse', size: /\bcuit/.test(n) ? 200 : 185, approx: true }];
  if (/lait|boisson|jus|cafe|the|eau,/.test(n)) return [{ id: 'cup', label: 'Tasse', size: 250, approx: true }];
  if (/oeuf/.test(n) && !/blanc|jaune|omelette|brouille/.test(n)) return [{ id: 'piece', label: 'Œuf (sans coquille)', size: 50, approx: true }];
  if (/banane/.test(n)) return [{ id: 'piece', label: 'Banane (sans peau)', size: 120, approx: true }];
  if (/pomme,|pomme \(/.test(n) && !/terre/.test(n)) return [{ id: 'piece', label: 'Pomme (partie comestible)', size: 150, approx: true }];
  if (/tomate/.test(n) && !/conserve|pelee|concassee|sauce|concentre|sechee/.test(n))
    return [{ id: 'piece', label: 'Tomate', size: 120, approx: true }];
  if (/yaourt|yogurt|skyr/.test(n)) return [{ id: 'pot', label: 'Pot (format à vérifier)', size: 125, approx: true }];
  if (/pain/.test(n)) return [{ id: 'slice', label: 'Tranche', size: 30, approx: true }];
  return [];
}
export function measuredAmount(count: number, size: number) {
  if (!Number.isFinite(count) || !Number.isFinite(size) || count <= 0 || size <= 0 || count * size > 10000)
    throw Error('Quantité ou poids par unité invalide');
  return count * size;
}
