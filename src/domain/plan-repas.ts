// Plan alimentaire de la semaine : 7 jours (lundi → dimanche), des recettes par moment de repas.
// Repris du planning d'origine (mealPlan.ts : semaine = un lundi, 7 jours, portions de 1/8 à 4, version
// pour refuser l'écrasement d'une modification concurrente). Chaque repas garde le titre et les macros
// au moment du choix : le plan reste lisible si la recette change ensuite ou n'est pas visible du client.
import { additionner, arrondirMacros, recetteDeVariante, totalRecette } from './alimentation';
import type { Macros, MomentRepas, Recette } from './types';

export interface RepasPlanifie {
  id: string;
  moment: MomentRepas;
  recetteId: string;
  varianteId?: string;
  titre: string;
  portions: number;
  /** Macros d'une portion au moment du choix. */
  macrosPortion: Macros;
  /** Macros pour les portions choisies. */
  macros: Macros;
}

const pourPortions = (m: Macros, portions: number) =>
  arrondirMacros({ kcal: m.kcal * portions, proteines: m.proteines * portions, glucides: m.glucides * portions, lipides: m.lipides * portions });

export interface PlanRepas {
  clientId: string;
  /** Lundi de la semaine, AAAA-MM-JJ. */
  semaine: string;
  jours: RepasPlanifie[][];
  /** Instant du dernier enregistrement ; absent tant que rien n'est enregistré. */
  version?: string;
  auteur?: 'coach' | 'client';
}

export const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const PORTIONS_MIN = 0.125;
export const PORTIONS_MAX = 4;
export const REPAS_PAR_JOUR_MAX = 12;

const deux = (n: number) => String(n).padStart(2, '0');
const jourIso = (d: Date) => `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`;

/** Le lundi de la semaine qui contient ce jour (AAAA-MM-JJ, calendrier sans fuseau). */
export function lundiDe(jour: string): string {
  const d = new Date(`${jour}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return jourIso(d);
}

export function decalerSemaine(lundi: string, n: number): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7 * n);
  return jourIso(d);
}

export function dateDuJour(lundi: string, index: number): string {
  const d = new Date(`${lundi}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + index);
  return jourIso(d);
}

export const estUnLundi = (jour: string) => /^\d{4}-\d{2}-\d{2}$/.test(jour) && lundiDe(jour) === jour;

export function planVide(clientId: string, semaine: string): PlanRepas {
  return { clientId, semaine, jours: JOURS.map(() => []) };
}

export function repasDepuisRecette(
  recette: Recette,
  opts: { id: string; moment: MomentRepas; portions: number; varianteId?: string },
): RepasPlanifie {
  const variante = opts.varianteId ? recette.variantes?.find((v) => v.id === opts.varianteId) : undefined;
  const source = variante ? recetteDeVariante(recette, variante) : recette;
  const { parPortion } = totalRecette(source);
  return {
    id: opts.id,
    moment: opts.moment,
    recetteId: recette.id,
    varianteId: variante?.id,
    titre: variante ? `${recette.titre} (${variante.libelle})` : recette.titre,
    portions: opts.portions,
    macrosPortion: parPortion,
    macros: pourPortions(parPortion, opts.portions),
  };
}

/** Change les portions d'un repas déjà choisi en gardant les macros par portion d'origine. */
export const changerPortions = (r: RepasPlanifie, portions: number): RepasPlanifie => ({ ...r, portions, macros: pourPortions(r.macrosPortion, portions) });

export const totalJour = (jour: RepasPlanifie[]): Macros => arrondirMacros(additionner(jour.map((r) => r.macros)));

/** Écart à la cible du jour, sans prétendre l'atteindre exactement (arrondis, portions). */
export function ecartJour(total: Macros, cible: Macros | undefined) {
  if (!cible?.kcal) return undefined;
  const kcal = total.kcal - cible.kcal;
  return { kcal, pourcent: Math.round((kcal / cible.kcal) * 100) };
}

export function erreursPlan(p: PlanRepas): string[] {
  const erreurs: string[] = [];
  if (!estUnLundi(p.semaine)) erreurs.push('La semaine doit commencer un lundi.');
  if (p.jours.length !== 7) erreurs.push('Le plan doit compter 7 jours.');
  p.jours.forEach((jour, i) => {
    if (jour.length > REPAS_PAR_JOUR_MAX) erreurs.push(`${JOURS[i]} : ${REPAS_PAR_JOUR_MAX} repas au plus.`);
    for (const r of jour)
      if (!(r.portions >= PORTIONS_MIN && r.portions <= PORTIONS_MAX))
        erreurs.push(`${JOURS[i]} : portions de « ${r.titre} » entre 1/8 et ${PORTIONS_MAX}.`);
  });
  return erreurs;
}

export const nbRepas = (p: PlanRepas) => p.jours.reduce((n, j) => n + j.length, 0);
