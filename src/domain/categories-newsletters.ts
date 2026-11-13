// Bibliothèque des newsletters : les articles complets rangés par catégorie, chacune avec sa couleur et une phrase
// qui dit ce qu'on y trouve. Un article appartient à une seule catégorie (champ « categorie » des articles).
export type CleCategorie = 'force' | 'cardio' | 'nutrition' | 'recuperation' | 'feminin' | 'sante' | 'motivation' | 'progresser' | 'saison';

export type Categorie = { cle: CleCategorie; nom: string; accroche: string; couleur: string; fond: string; fonce: string };

// Couleurs reprises des PDF magazine : la couleur du thème, son fond pâle et sa teinte foncée.
export const CATEGORIES: readonly Categorie[] = [
  { cle: 'force', nom: 'Force', accroche: 'Le geste juste, du squat au gainage', couleur: '#D71920', fond: '#F6F1EA', fonce: '#111111' },
  { cle: 'cardio', nom: 'Cardio', accroche: 'Endurance, seuil, fractionné : le cœur qui progresse', couleur: '#E5512A', fond: '#FDEEE7', fonce: '#4E1709' },
  { cle: 'nutrition', nom: 'Nutrition', accroche: 'Ce qu’il y a dans l’assiette, sans dogme', couleur: '#2E7D4F', fond: '#EAF3EC', fonce: '#123A24' },
  { cle: 'recuperation', nom: 'Récupération', accroche: 'Sommeil, stress, repos : là où l’on progresse', couleur: '#3556A6', fond: '#EAEFF8', fonce: '#141F45' },
  { cle: 'feminin', nom: 'Santé au féminin', accroche: 'Cycle, grossesse, ménopause : s’entraîner avec son corps', couleur: '#A23B74', fond: '#F8EAF1', fonce: '#45132F' },
  { cle: 'sante', nom: 'Santé', accroche: 'Bouger pour aller mieux, à tout âge', couleur: '#14807D', fond: '#E6F3F2', fonce: '#0A3A39' },
  { cle: 'progresser', nom: 'Progresser', accroche: 'Programmes, cycles et suivi dans l’appli', couleur: '#5B4BD1', fond: '#EEECFB', fonce: '#211A5E' },
  { cle: 'motivation', nom: 'Motivation', accroche: 'Revenir, tenir, retrouver l’envie', couleur: '#E0920F', fond: '#FDF3DF', fonce: '#3F2B05' },
  { cle: 'saison', nom: 'Saison', accroche: 'Fêtes, hiver : garder le rythme', couleur: '#B3122E', fond: '#FBF0DD', fonce: '#3B0610' },
];

const PAR_CLE = new Map(CATEGORIES.map((c) => [c.cle, c]));

/** La catégorie d'après sa clé ; inconnue, la première. */
export const categorie = (cle?: string): Categorie => PAR_CLE.get(cle as CleCategorie) ?? CATEGORIES[0];
export const estCategorie = (cle: unknown): cle is CleCategorie => PAR_CLE.has(cle as CleCategorie);

/** Range des articles par catégorie, dans l'ordre des catégories ; les catégories vides sont omises. */
export function parCategorie<T extends { categorie?: string }>(articles: readonly T[]): { categorie: Categorie; articles: T[] }[] {
  return CATEGORIES.map((c) => ({ categorie: c, articles: articles.filter((a) => categorie(a.categorie).cle === c.cle) })).filter((g) => g.articles.length > 0);
}
