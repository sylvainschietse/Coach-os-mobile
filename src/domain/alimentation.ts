// Alimentation : besoins du client, macros des aliments et des recettes, régimes et adaptations.
// Règles pures, sans écran ni base.
import type {
  Aliment,
  Contient,
  EntreeRepas,
  Ingredient,
  Macros,
  MomentRepas,
  NiveauActivite,
  ObjectifNutrition,
  PlanNutrition,
  ProfilNutrition,
  Recette,
  Regime,
  TypeRecette,
  VarianteRecette,
} from './types';
import { formaterNombre } from './suivi';

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ——— Besoins ———

export const NIVEAUX_ACTIVITE: {
  cle: NiveauActivite;
  libelle: string;
  detail: string;
  facteur: number;
}[] = [
  {
    cle: 'sedentaire',
    libelle: 'Sédentaire',
    detail: 'Travail assis, peu de marche, pas de sport',
    facteur: 1.2,
  },
  {
    cle: 'leger',
    libelle: 'Légèrement actif',
    detail: '1 à 2 séances par semaine, ou beaucoup de marche',
    facteur: 1.375,
  },
  {
    cle: 'modere',
    libelle: 'Modérément actif',
    detail: '3 à 4 séances par semaine',
    facteur: 1.55,
  },
  {
    cle: 'actif',
    libelle: 'Très actif',
    detail: '5 à 6 séances par semaine, ou métier physique',
    facteur: 1.725,
  },
  {
    cle: 'tres_actif',
    libelle: 'Extrêmement actif',
    detail: 'Entraînement quotidien intense et métier physique',
    facteur: 1.9,
  },
];

export const OBJECTIFS: {
  cle: ObjectifNutrition;
  libelle: string;
  ajustement: number;
  proteinesParKg: number;
}[] = [
  {
    cle: 'perte',
    libelle: 'Perdre du gras',
    ajustement: 0.8,
    proteinesParKg: 2,
  },
  {
    cle: 'maintien',
    libelle: 'Me maintenir',
    ajustement: 1,
    proteinesParKg: 1.6,
  },
  {
    cle: 'prise',
    libelle: 'Prendre du muscle',
    ajustement: 1.1,
    proteinesParKg: 1.8,
  },
];

export const REGIMES: { cle: Regime; libelle: string }[] = [
  { cle: 'vegetarien', libelle: 'Végétarien' },
  { cle: 'vegan', libelle: 'Végan' },
  { cle: 'pescetarien', libelle: 'Pescétarien' },
  { cle: 'sans_gluten', libelle: 'Sans gluten' },
  { cle: 'sans_lactose', libelle: 'Sans lactose' },
  { cle: 'low_carb', libelle: 'Low carb' },
  { cle: 'high_protein', libelle: 'High protein' },
];

/** Ce que chaque régime exclut. Low carb et high protein se jugent sur les macros, pas sur les ingrédients. */
const EXCLUS: Partial<Record<Regime, Contient[]>> = {
  vegetarien: ['viande', 'poisson', 'fruits_de_mer'],
  vegan: ['viande', 'poisson', 'fruits_de_mer', 'oeuf', 'lait', 'miel'],
  pescetarien: ['viande'],
  sans_gluten: ['gluten'],
  sans_lactose: ['lait'],
};

export function age(naissance: string, aujourdhui: string): number {
  const [a, m, j] = naissance.split('-').map(Number);
  const [A, M, J] = aujourdhui.split('-').map(Number);
  return A - a - (M < m || (M === m && J < j) ? 1 : 0);
}

export interface Besoins extends Macros {
  metabolisme: number;
  depense: number;
  eauL: number;
  poidsKg: number;
}

const arrondir = (n: number, pas: number) => Math.round(n / pas) * pas;

/**
 * Besoins du jour à partir du profil : métabolisme de base de Mifflin-St Jeor × niveau d'activité,
 * ajusté selon l'objectif. Protéines en g par kg, lipides au moins 25 % des calories (0,8 g/kg minimum),
 * glucides pour le reste. Renvoie ce qui manque si le profil est incomplet.
 */
export function calculerBesoins(
  profil: ProfilNutrition | null | undefined,
  aujourdhui: string,
  dernierPoids?: number,
): { besoins: Besoins; manque: [] } | { besoins?: undefined; manque: string[] } {
  const poids = profil?.poidsKg ?? dernierPoids;
  const manque: string[] = [];
  if (!profil?.sexe) manque.push('sexe');
  if (!profil?.naissance) manque.push('date de naissance');
  if (!profil?.tailleCm) manque.push('taille');
  if (!poids) manque.push('poids');
  if (!profil?.activite) manque.push('niveau d’activité');
  if (!profil?.objectif) manque.push('objectif');
  if (manque.length || !profil || !poids) return { manque };

  const ans = age(profil.naissance!, aujourdhui);
  const metabolisme = 10 * poids + 6.25 * profil.tailleCm! - 5 * ans + (profil.sexe === 'homme' ? 5 : -161);
  const facteur = NIVEAUX_ACTIVITE.find((n) => n.cle === profil.activite)!.facteur;
  const objectif = OBJECTIFS.find((o) => o.cle === profil.objectif)!;
  const depense = metabolisme * facteur;
  // On ne descend jamais sous le métabolisme de base.
  const kcal = arrondir(Math.max(depense * objectif.ajustement, metabolisme), 10);

  const regimes = profil.regimes ?? [];
  const proteines = arrondir(poids * (regimes.includes('high_protein') ? 2.2 : objectif.proteinesParKg), 5);
  let lipides = Math.ceil(Math.max((kcal * 0.25) / 9, poids * 0.8) / 5) * 5;
  let glucides = arrondir((kcal - proteines * 4 - lipides * 9) / 4, 5);
  if (regimes.includes('low_carb')) {
    // Glucides limités à 20 % des calories, les lipides prennent le reste.
    glucides = arrondir((kcal * 0.2) / 4, 5);
    lipides = arrondir((kcal - proteines * 4 - glucides * 4) / 9, 5);
  }
  glucides = Math.max(glucides, 0);
  return {
    besoins: {
      metabolisme: Math.round(metabolisme),
      depense: Math.round(depense),
      kcal,
      proteines,
      glucides,
      lipides,
      eauL: Math.round(poids * 0.035 * 10) / 10,
      poidsKg: poids,
    },
    manque: [],
  };
}

/** Les objectifs du jour : ceux du coach s'il en a écrit, sinon le calcul automatique. */
export function objectifsDuJour(plan: PlanNutrition | null | undefined, besoins: Besoins | undefined) {
  if (plan?.calories) {
    return {
      source: 'coach' as const,
      kcal: plan.calories,
      proteines: plan.proteinesG ?? besoins?.proteines ?? 0,
      glucides: plan.glucidesG ?? besoins?.glucides ?? 0,
      lipides: plan.lipidesG ?? besoins?.lipides ?? 0,
      eauL: plan.eauL ?? besoins?.eauL,
    };
  }
  if (besoins) return { source: 'calcul' as const, ...besoins };
  return undefined;
}

export const MOMENTS: {
  cle: MomentRepas;
  libelle: string;
  au: string;
  part: number;
}[] = [
  {
    cle: 'petit_dejeuner',
    libelle: 'Petit-déjeuner',
    au: 'au petit-déjeuner',
    part: 0.25,
  },
  { cle: 'dejeuner', libelle: 'Déjeuner', au: 'au déjeuner', part: 0.35 },
  { cle: 'collation', libelle: 'Collation', au: 'à la collation', part: 0.1 },
  { cle: 'diner', libelle: 'Dîner', au: 'au dîner', part: 0.3 },
];

export function cibleDuRepas(objectifs: Macros, moment: MomentRepas): Macros {
  const part = MOMENTS.find((m) => m.cle === moment)!.part;
  return {
    kcal: Math.round(objectifs.kcal * part),
    proteines: Math.round(objectifs.proteines * part),
    glucides: Math.round(objectifs.glucides * part),
    lipides: Math.round(objectifs.lipides * part),
  };
}

/** Le moment du repas selon l'heure, pour préremplir. */
export function momentSelonHeure(d: Date): MomentRepas {
  const h = d.getHours();
  if (h < 11) return 'petit_dejeuner';
  if (h < 15) return 'dejeuner';
  if (h < 18) return 'collation';
  return 'diner';
}

// ——— Macros ———

const zero = (): Macros => ({ kcal: 0, proteines: 0, glucides: 0, lipides: 0 });

/** Macros d'une quantité en grammes, à partir des valeurs pour 100 g. */
export function macrosPour(pour100: Macros, grammes: number): Macros {
  const f = grammes / 100;
  return {
    kcal: pour100.kcal * f,
    proteines: pour100.proteines * f,
    glucides: pour100.glucides * f,
    lipides: pour100.lipides * f,
  };
}

export function additionner(liste: Macros[]): Macros {
  return liste.reduce(
    (t, m) => ({
      kcal: t.kcal + m.kcal,
      proteines: t.proteines + m.proteines,
      glucides: t.glucides + m.glucides,
      lipides: t.lipides + m.lipides,
    }),
    zero(),
  );
}

export const arrondirMacros = (m: Macros): Macros => ({
  kcal: Math.round(m.kcal),
  proteines: Math.round(m.proteines * 10) / 10,
  glucides: Math.round(m.glucides * 10) / 10,
  lipides: Math.round(m.lipides * 10) / 10,
});

const fois = (m: Macros, f: number): Macros => ({
  kcal: m.kcal * f,
  proteines: m.proteines * f,
  glucides: m.glucides * f,
  lipides: m.lipides * f,
});
const moins = (a: Macros, b: Macros): Macros => ({
  kcal: Math.max(0, a.kcal - b.kcal),
  proteines: Math.max(0, a.proteines - b.proteines),
  glucides: Math.max(0, a.glucides - b.glucides),
  lipides: Math.max(0, a.lipides - b.lipides),
});

/**
 * Macros d'une recette. Une recette importée garde les valeurs par portion publiées par sa source ;
 * les autres se calculent ingrédient par ingrédient. Le poids d'une portion n'est connu que si tout est en grammes.
 */
export function totalRecette(r: Pick<Recette, 'ingredients' | 'portions' | 'macrosPortion'>) {
  const portions = Math.max(1, r.portions);
  const parIngredients = additionner(r.ingredients.map((i) => macrosPour(i, i.quantiteG)));
  const parPortion = r.macrosPortion ?? fois(parIngredients, 1 / portions);
  const toutEnGrammes = r.ingredients.every((i) => !i.unite || i.unite === 'g');
  const poids = r.ingredients.reduce((n, i) => n + i.quantiteG, 0);
  return {
    total: fois(parPortion, portions),
    parPortion,
    poidsPortionG: toutEnGrammes ? poids / portions : undefined,
  };
}

/** Complète un ingrédient enregistré au format compact (recettes importées). */
export function lireIngredient(i: Partial<Ingredient> & { nom: string }): Ingredient {
  return {
    ...i,
    quantiteG: i.quantiteG ?? 0,
    kcal: i.kcal ?? 0,
    proteines: i.proteines ?? 0,
    glucides: i.glucides ?? 0,
    lipides: i.lipides ?? 0,
    contient: i.contient ?? [],
  };
}

export function lireRecette(r: Recette): Recette {
  return {
    ...r,
    ingredients: (r.ingredients ?? []).map(lireIngredient),
    variantes: r.variantes?.map((v) => ({
      ...v,
      ingredients: v.ingredients.map(lireIngredient),
    })),
  };
}

/** La recette telle que sa variante (végé, végane, + protéines) la décrit. */
export function recetteDeVariante(r: Recette, v: VarianteRecette): Recette {
  return {
    ...r,
    ingredients: v.ingredients,
    macrosPortion: v.macrosPortion,
    etapes: v.etapes ?? r.etapes,
    regimeSource: v.regime,
  };
}

const PLURIELS: Record<string, string> = { pièce: 'pièces', boîte: 'boîtes' };

/** « 120 g », « 2 pièces », « env. 1 c. à soupe », « selon goût ». */
export function quantiteLisible(i: Ingredient): string {
  const env = i.approximatif ? 'env. ' : '';
  if (i.unite && i.unite !== 'g') {
    if (i.quantite === undefined) return i.unite;
    const q = Math.round(i.quantite * 100) / 100;
    return `${env}${formaterNombre(q)} ${q > 1 ? (PLURIELS[i.unite] ?? i.unite) : i.unite}`;
  }
  const g = i.quantite ?? i.quantiteG;
  return `${env}${formaterNombre(Math.round(g))} g`;
}

export function totauxDuJour(entrees: EntreeRepas[], date: string) {
  const du = entrees.filter((e) => e.date === date);
  return {
    total: additionner(du),
    parMoment: MOMENTS.map((m) => ({
      ...m,
      entrees: du.filter((e) => e.moment === m.cle),
      total: additionner(du.filter((e) => e.moment === m.cle)),
    })),
  };
}

/** Une entrée du journal à partir d'un aliment et d'une quantité. */
export function entreeAliment(
  a: Pick<Aliment, 'id' | 'nom' | 'marque' | 'kcal' | 'proteines' | 'glucides' | 'lipides'>,
  grammes: number,
  base: Pick<EntreeRepas, 'id' | 'clientId' | 'date' | 'moment' | 'source'>,
): EntreeRepas {
  return {
    ...base,
    ...arrondirMacros(macrosPour(a, grammes)),
    libelle: a.marque ? `${a.nom} (${a.marque})` : a.nom,
    quantiteG: grammes,
    alimentId: a.id.startsWith('photo-') ? undefined : a.id,
  };
}

export function entreeRecette(r: Recette, portions: number, base: Pick<EntreeRepas, 'id' | 'clientId' | 'date' | 'moment'>): EntreeRepas {
  const { parPortion } = totalRecette(r);
  return {
    ...base,
    source: 'recette',
    ...arrondirMacros({
      kcal: parPortion.kcal * portions,
      proteines: parPortion.proteines * portions,
      glucides: parPortion.glucides * portions,
      lipides: parPortion.lipides * portions,
    }),
    libelle: r.titre,
    portions,
    recetteId: r.id,
  };
}

export function erreursAliment(a: Partial<Aliment>): string[] {
  const erreurs: string[] = [];
  if (!a.nom?.trim()) erreurs.push('Donne un nom à l’aliment.');
  for (const [cle, v, max] of [
    ['calories', a.kcal, 900],
    ['protéines', a.proteines, 100],
    ['glucides', a.glucides, 100],
    ['lipides', a.lipides, 100],
  ] as const) {
    if (v === undefined || Number.isNaN(v)) erreurs.push(`Indique les ${cle} pour 100 g.`);
    else if (v < 0 || v > max) erreurs.push(`${cle[0].toUpperCase() + cle.slice(1)} pour 100 g : entre 0 et ${max}.`);
  }
  if (a.proteines !== undefined && a.glucides !== undefined && a.lipides !== undefined && a.proteines + a.glucides + a.lipides > 100.5) {
    erreurs.push('Protéines, glucides et lipides dépassent 100 g pour 100 g.');
  }
  return erreurs;
}

export function erreursRecette(r: Pick<Recette, 'titre' | 'portions' | 'ingredients'>): string[] {
  const erreurs: string[] = [];
  if (!r.titre.trim()) erreurs.push('Donne un nom à la recette.');
  if (!(r.portions >= 1 && r.portions <= 50)) erreurs.push('Portions : entre 1 et 50.');
  if (r.ingredients.length === 0) erreurs.push('Ajoute au moins un ingrédient.');
  // Les quantités hors grammes (pièce, selon goût) viennent d'une recette importée : rien à peser.
  for (const i of r.ingredients) {
    if (i.unite && i.unite !== 'g') continue;
    if (!(i.quantiteG > 0 && i.quantiteG <= 5000)) erreurs.push(`${i.nom} : quantité entre 1 et 5000 g.`);
  }
  return erreurs;
}

// ——— Recherche ———

export function rechercherAliments(aliments: Aliment[], recherche: string, limite = 30) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return [];
  const trouves = aliments.filter((a) => {
    const texte = sansAccents([a.nom, a.marque, a.categorie].filter(Boolean).join(' '));
    return mots.every((m) => texte.includes(m));
  });
  const rang = (a: Aliment) => {
    const nom = sansAccents(a.nom);
    if (nom === mots.join(' ')) return 0;
    if (nom.startsWith(mots.join(' '))) return 1;
    if (nom.startsWith(mots[0])) return 2;
    // Les aliments de la base commune avant les produits de marque.
    return a.source === 'base' ? 3 : 4;
  };
  trouves.sort((a, b) => rang(a) - rang(b) || a.nom.length - b.nom.length || a.nom.localeCompare(b.nom, 'fr'));
  return trouves.slice(0, limite);
}

/** Les recettes qui répondent à la recherche (titre, ingrédients, cuisine) et au type de repas. */
export function rechercherRecettes(recettes: Recette[], recherche: string, type?: TypeRecette): Set<string> {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  return new Set(
    recettes
      .filter((r) => !type || r.types?.includes(type))
      .filter((r) => {
        if (!mots.length) return true;
        const texte = sansAccents([r.titre, r.origine?.cuisine, ...r.ingredients.map((i) => i.nom)].filter(Boolean).join(' '));
        return mots.every((m) => texte.includes(m));
      })
      .map((r) => r.id),
  );
}

// ——— Régimes ———

const contientDe = (r: Pick<Recette, 'ingredients'>) => new Set(r.ingredients.flatMap((i) => i.contient));

/** La recette convient-elle au régime ? Sans gluten seulement si c'est confirmé : un ingrédient peut en cacher. */
export function convientAuRegime(r: Pick<Recette, 'ingredients' | 'portions' | 'regimesConfirmes' | 'macrosPortion'>, regime: Regime): boolean {
  if (r.regimesConfirmes?.includes(regime)) return true;
  if (regime === 'low_carb' || regime === 'high_protein') {
    const { parPortion: m } = totalRecette(r);
    if (m.kcal <= 0) return false;
    return regime === 'low_carb' ? (m.glucides * 4) / m.kcal <= 0.25 : (m.proteines * 4) / m.kcal >= 0.3;
  }
  if (regime === 'sans_gluten') return false;
  const exclus = EXCLUS[regime] ?? [];
  const contient = contientDe(r);
  return !exclus.some((c) => contient.has(c));
}

export const regimesDeLaRecette = (r: Pick<Recette, 'ingredients' | 'portions' | 'regimesConfirmes' | 'macrosPortion'>) =>
  REGIMES.filter((g) => convientAuRegime(r, g.cle)).map((g) => g.cle);

/** Mots de l'exclusion (allergies, aliments refusés) trouvés dans les ingrédients. */
export function exclusionsTrouvees(r: Pick<Recette, 'ingredients'>, exclusions?: string): string[] {
  const mots = (exclusions ?? '')
    .split(/[,;\n]/)
    .map((m) => sansAccents(m.trim()))
    .filter((m) => m.length >= 3);
  return mots.filter((m) => r.ingredients.some((i) => sansAccents(i.nom).includes(m.replace(/s$/, ''))));
}

/** Les remplacements proposés quand un ingrédient ne va pas avec le régime (valeurs Ciqual 2025 pour le tofu et le tempeh). */
export const SUBSTITUTS: {
  pour: Contient;
  regimes: Regime[];
  remplacement: Omit<Ingredient, 'quantiteG'>;
  equivalence: 'proteines' | 'poids';
}[] = [
  {
    pour: 'viande',
    regimes: ['vegetarien', 'vegan', 'pescetarien'],
    remplacement: {
      nom: 'Tofu nature',
      kcal: 147,
      proteines: 13.4,
      glucides: 2.9,
      lipides: 8.5,
      contient: [],
    },
    equivalence: 'proteines',
  },
  {
    pour: 'poisson',
    regimes: ['vegetarien', 'vegan'],
    remplacement: {
      nom: 'Tempeh',
      kcal: 157,
      proteines: 16.1,
      glucides: 7.9,
      lipides: 4.7,
      contient: [],
    },
    equivalence: 'proteines',
  },
  {
    pour: 'fruits_de_mer',
    regimes: ['vegetarien', 'vegan'],
    remplacement: {
      nom: 'Tofu nature',
      kcal: 147,
      proteines: 13.4,
      glucides: 2.9,
      lipides: 8.5,
      contient: [],
    },
    equivalence: 'proteines',
  },
  {
    pour: 'oeuf',
    regimes: ['vegan'],
    remplacement: {
      nom: 'Tofu soyeux',
      kcal: 55,
      proteines: 5.5,
      glucides: 1.5,
      lipides: 3,
      contient: [],
    },
    equivalence: 'poids',
  },
  {
    pour: 'lait',
    regimes: ['vegan', 'sans_lactose'],
    remplacement: {
      nom: 'Équivalent végétal au soja (boisson, yaourt ou crème)',
      kcal: 45,
      proteines: 3.5,
      glucides: 2,
      lipides: 2,
      contient: [],
    },
    equivalence: 'poids',
  },
  {
    pour: 'gluten',
    regimes: ['sans_gluten'],
    remplacement: {
      nom: 'Version sans gluten (pâtes, pain, farine)',
      kcal: 355,
      proteines: 7,
      glucides: 76,
      lipides: 1.5,
      contient: [],
    },
    equivalence: 'poids',
  },
  {
    pour: 'miel',
    regimes: ['vegan'],
    remplacement: {
      nom: 'Sirop d’érable',
      kcal: 260,
      proteines: 0,
      glucides: 67,
      lipides: 0,
      contient: [],
    },
    equivalence: 'poids',
  },
];

export interface Adaptation {
  avant: Ingredient;
  apres: Ingredient;
}

/**
 * Adapte la recette aux régimes : chaque ingrédient qui ne convient pas est remplacé.
 * Pour les protéines animales, la quantité est ajustée pour garder les mêmes protéines (au plus 1,5 fois le poids).
 */
export function adapterAuxRegimes(r: Recette, regimes: Regime[]): { recette: Recette; adaptations: Adaptation[]; impossibles: string[] } {
  const adaptations: Adaptation[] = [];
  const impossibles: string[] = [];
  const ingredients = r.ingredients.map((i) => {
    const genant = i.contient.filter((c) => regimes.some((g) => EXCLUS[g]?.includes(c)));
    if (genant.length === 0) return i;
    const sub = SUBSTITUTS.find((s) => genant.includes(s.pour) && regimes.some((g) => s.regimes.includes(g)));
    // Un substitut ne règle qu'un problème : un ingrédient qui en a deux (ex. lait et gluten) reste à revoir.
    // Sans valeurs connues pour l'ingrédient, l'écart de macros ne se calcule pas : à revoir aussi.
    if (!sub || genant.length > 1 || i.valeursInconnues) {
      impossibles.push(i.nom);
      return i;
    }
    const quantiteG =
      sub.equivalence === 'proteines' && sub.remplacement.proteines > 0
        ? Math.round(Math.min((i.quantiteG * i.proteines) / sub.remplacement.proteines, i.quantiteG * 1.5))
        : i.quantiteG;
    const apres: Ingredient = {
      ...sub.remplacement,
      quantiteG,
      ...(i.unite ? { unite: 'g' } : {}),
    };
    adaptations.push({ avant: i, apres });
    return apres;
  });
  // Valeurs publiées : on leur ajoute l'écart entre le remplaçant et l'ingrédient remplacé.
  const macrosPortion = r.macrosPortion
    ? additionner([
        r.macrosPortion,
        fois(additionner(adaptations.map((a) => macrosPour(a.apres, a.apres.quantiteG))), 1 / Math.max(1, r.portions)),
        fois(additionner(adaptations.map((a) => macrosPour(a.avant, a.avant.quantiteG))), -1 / Math.max(1, r.portions)),
      ])
    : undefined;
  return {
    recette: { ...r, ingredients, ...(macrosPortion ? { macrosPortion } : {}) },
    adaptations,
    impossibles: [...new Set(impossibles)],
  };
}

// ——— Adapter aux besoins ———

/** Un ingrédient « protéique » : plus de 40 % de ses calories viennent des protéines. */
const estProteique = (i: Macros) => i.kcal > 0 && (i.proteines * 4) / i.kcal >= 0.4;

/**
 * Ajuste les quantités d'une portion pour coller à la cible du repas : les sources de protéines
 * et le reste sont multipliés séparément (de 0,5 à 2 fois) pour viser à la fois les calories et les protéines.
 * Pour une recette importée, « le reste » est ce que les valeurs publiées laissent une fois les protéines connues retirées.
 */
export function adapterAuxBesoins(r: Recette, cible: Macros) {
  const { parPortion } = totalRecette(r);
  const portions = Math.max(1, r.portions);
  const proteique = (i: Ingredient) => !i.valeursInconnues && estProteique(i);
  const P = additionner(r.ingredients.filter(proteique).map((i) => macrosPour(i, i.quantiteG / portions)));
  const A = moins(parPortion, P);
  const borne = (x: number) => Math.min(2, Math.max(0.5, x));

  let fP: number;
  let fA: number;
  // Résout fP·P.kcal + fA·A.kcal = cible.kcal et fP·P.prot + fA·A.prot = cible.prot.
  const det = P.kcal * A.proteines - A.kcal * P.proteines;
  if (P.kcal > 0 && A.kcal > 0 && Math.abs(det) > 1e-6) {
    fP = borne((cible.kcal * A.proteines - A.kcal * cible.proteines) / det);
    fA = borne((cible.kcal - fP * P.kcal) / A.kcal);
  } else {
    fP = fA = parPortion.kcal > 0 ? borne(cible.kcal / parPortion.kcal) : 1;
  }
  const ingredients = r.ingredients.map((i) => {
    const f = (proteique(i) ? fP : fA) / portions;
    return {
      ...i,
      quantiteG: Math.round(i.quantiteG * f),
      ...(i.quantite !== undefined ? { quantite: i.quantite * f } : {}),
    };
  });
  const macros = additionner([fois(P, fP), fois(A, fA)]);
  const adaptee: Recette = {
    ...r,
    portions: 1,
    ingredients,
    ...(r.macrosPortion ? { macrosPortion: macros } : {}),
  };
  return {
    recette: adaptee,
    macros: totalRecette(adaptee).parPortion,
    facteurs: { proteines: fP, reste: fA },
  };
}

/** Les recettes de la banque qui conviennent au client, les plus proches de sa cible d'abord. */
export function recettesPourLeClient(recettes: Recette[], profil: ProfilNutrition | null | undefined) {
  const regimes = profil?.regimes ?? [];
  return recettes
    .filter((r) => !r.archive)
    .map((r) => {
      const directes = regimes.every((g) => convientAuRegime(r, g));
      // Une variante publiée avec la recette (végé, végane) passe avant nos remplacements automatiques.
      const variante = directes ? undefined : r.variantes?.find((v) => regimes.every((g) => convientAuRegime(recetteDeVariante(r, v), g)));
      if (variante) {
        const v = recetteDeVariante(r, variante);
        return {
          recette: r,
          convient: true,
          variante,
          adaptation: undefined,
          exclusions: exclusionsTrouvees(v, profil?.exclusions),
        };
      }
      const adaptation = directes
        ? undefined
        : adapterAuxRegimes(
            r,
            regimes.filter((g) => !convientAuRegime(r, g)),
          );
      const adaptable = !!adaptation && adaptation.impossibles.length === 0 && adaptation.adaptations.length > 0;
      return {
        recette: r,
        convient: directes,
        variante: undefined,
        adaptation: adaptable ? adaptation : undefined,
        exclusions: exclusionsTrouvees(r, profil?.exclusions),
      };
    })
    .filter((x) => (x.convient || x.adaptation) && x.exclusions.length === 0);
}

// ——— Open Food Facts ———

type ProduitOff = {
  code?: string;
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  allergens_tags?: string[];
  ingredients_analysis_tags?: string[];
  categories_tags?: string[];
  nutriments?: Record<string, number | string | undefined>;
};

const nombreOff = (v: unknown) => {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Lit la fiche Open Food Facts d'un code-barres. Rien si les valeurs nutritionnelles manquent. */
export function lireProduitOff(code: string, reponse: { status?: number; product?: ProduitOff }): Omit<Aliment, 'id'> | undefined {
  const p = reponse.product;
  if (!p || reponse.status === 0) return undefined;
  const n = p.nutriments ?? {};
  const kcal = nombreOff(n['energy-kcal_100g']) ?? (nombreOff(n['energy_100g']) !== undefined ? nombreOff(n['energy_100g'])! / 4.184 : undefined);
  const proteines = nombreOff(n['proteins_100g']);
  const glucides = nombreOff(n['carbohydrates_100g']);
  const lipides = nombreOff(n['fat_100g']);
  if (kcal === undefined || proteines === undefined || glucides === undefined || lipides === undefined) return undefined;
  const allergenes = p.allergens_tags ?? [];
  const analyse = p.ingredients_analysis_tags ?? [];
  const contient = new Set<Contient>();
  if (allergenes.includes('en:gluten')) contient.add('gluten');
  if (allergenes.includes('en:milk')) contient.add('lait');
  if (allergenes.includes('en:eggs')) contient.add('oeuf');
  if (allergenes.includes('en:fish')) contient.add('poisson');
  if (allergenes.includes('en:crustaceans') || allergenes.includes('en:molluscs')) contient.add('fruits_de_mer');
  // « Non végétarien » sans poisson ni fruits de mer : on suppose de la viande.
  if (analyse.includes('en:non-vegetarian') && !contient.has('poisson') && !contient.has('fruits_de_mer')) contient.add('viande');
  const portion = nombreOff(p.serving_quantity);
  return {
    nom: (p.product_name_fr || p.product_name || `Produit ${code}`).trim(),
    marque: p.brands?.split(',')[0]?.trim() || undefined,
    codeBarres: code,
    kcal: Math.round(kcal),
    proteines: Math.round(proteines * 10) / 10,
    glucides: Math.round(glucides * 10) / 10,
    lipides: Math.round(lipides * 10) / 10,
    fibres: nombreOff(n['fiber_100g']),
    portionG: portion && portion > 0 && portion < 2000 ? portion : undefined,
    portionLibelle: p.serving_size || undefined,
    contient: [...contient],
    source: 'off',
  };
}

export const codeBarresValide = (code: string) => /^\d{8}$|^\d{12,14}$/.test(code.trim());
