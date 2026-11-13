// Bibliothèque des newsletters : les articles complets rangés par catégorie, chacune avec sa couleur et une phrase
// qui dit ce qu'on y trouve. Un article appartient à une seule catégorie (champ « categorie » des articles).
export type CleCategorie = 'force' | 'cardio' | 'nutrition' | 'recuperation' | 'feminin' | 'sante' | 'motivation' | 'progresser' | 'saison';

export type Categorie = { cle: CleCategorie; nom: string; accroche: string; couleur: string };

export const CATEGORIES: readonly Categorie[] = [
  { cle: 'force', nom: 'Force', accroche: 'Le geste juste, du squat au périnée', couleur: '#B23A2E' },
  { cle: 'cardio', nom: 'Cardio', accroche: 'Endurance, seuil, fractionné : le cœur qui progresse', couleur: '#C46A2B' },
  { cle: 'nutrition', nom: 'Nutrition', accroche: 'Ce qu’il y a dans l’assiette, sans dogme', couleur: '#5E7A3A' },
  { cle: 'recuperation', nom: 'Récupération', accroche: 'Sommeil, eau, repos : là où l’on progresse', couleur: '#3D6E86' },
  { cle: 'feminin', nom: 'Santé au féminin', accroche: 'Cycle, grossesse, ménopause : s’entraîner avec son corps', couleur: '#9A4A6B' },
  { cle: 'sante', nom: 'Santé', accroche: 'Bouger pour aller mieux, à tout âge', couleur: '#2F6B5E' },
  { cle: 'motivation', nom: 'Motivation', accroche: 'Revenir, tenir, retrouver l’envie', couleur: '#6A5A9C' },
  { cle: 'progresser', nom: 'Progresser', accroche: 'Programmes, cycles et suivi dans l’appli', couleur: '#2B2D33' },
  { cle: 'saison', nom: 'Saison', accroche: 'Fêtes, hiver : garder le rythme', couleur: '#8A6A2E' },
];

const PAR_CLE = new Map(CATEGORIES.map((c) => [c.cle, c]));

/** La catégorie d'après sa clé ; inconnue, la première. */
export const categorie = (cle?: string): Categorie => PAR_CLE.get(cle as CleCategorie) ?? CATEGORIES[0];
export const estCategorie = (cle: unknown): cle is CleCategorie => PAR_CLE.has(cle as CleCategorie);

/** Range des articles par catégorie, dans l'ordre des catégories ; les catégories vides sont omises. */
export function parCategorie<T extends { categorie?: string }>(articles: readonly T[]): { categorie: Categorie; articles: T[] }[] {
  return CATEGORIES.map((c) => ({ categorie: c, articles: articles.filter((a) => categorie(a.categorie).cle === c.cle) })).filter((g) => g.articles.length > 0);
}
