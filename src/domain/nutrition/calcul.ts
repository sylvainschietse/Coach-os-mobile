// lib/nutrition.ts d'origine (N01) : préférences, objectifs et calcul Mifflin–St Jeor, repris tels quels.
// nutritionToday et ageFromBirth viennent de lib/nutritionServer.ts.
import { z } from 'zod';
export const preferences = z.object({
  ageSaisiLe: z.string().default(''),
  sexe: z.enum(['', 'homme', 'femme']),
  age: z.number().int().min(1).max(110).nullable(),
  poids: z.number().positive().max(500).nullable(),
  taille: z.number().positive().max(300).nullable(),
  activite: z.enum(['', 'faible', 'legere', 'moderee', 'elevee']),
  objectif: z.enum(['maintien', 'perte', 'muscle']),
  seances: z.number().int().min(0).max(20),
  activites: z.string().max(500),
  regime: z.enum(['aucun', 'vegetarien', 'vegetalien', 'pescetarien', 'autre']),
  habitudes: z.string().max(2000),
  allergies: z.string().max(1000),
  aime: z.string().max(1000),
  exclut: z.string().max(1000),
  saison: z.boolean(),
  repas: z.number().int().min(1).max(6),
  preparation: z.number().int().min(5).max(180),
  budget: z.enum(['libre', 'economique', 'modere']),
  specifique: z.boolean(),
});
export const blankPreferences = () =>
  preferences.parse({
    sexe: '',
    age: null,
    poids: null,
    taille: null,
    activite: '',
    objectif: 'maintien',
    seances: 0,
    activites: '',
    regime: 'aucun',
    habitudes: '',
    allergies: '',
    aime: '',
    exclut: '',
    saison: false,
    repas: 3,
    preparation: 30,
    budget: 'libre',
    specifique: false,
  });
export const target = z
  .object({
    calories: z.number().int().min(1).max(10000),
    proteinesPct: z.number().min(0).max(100),
    lipidesPct: z.number().min(0).max(100),
    glucidesPct: z.number().min(0).max(100),
    note: z.string().max(1500),
  })
  .refine((t) => Math.abs(t.proteinesPct + t.lipidesPct + t.glucidesPct - 100) < 0.01, 'La répartition doit totaliser 100 %');
export type Preferences = z.infer<typeof preferences>;
export type Target = z.infer<typeof target>;
export const coefficients = { faible: 1.4, legere: 1.6, moderee: 1.8, elevee: 2 };
export function macros(t: Target) {
  return {
    proteines: Math.round((t.calories * t.proteinesPct) / 400),
    lipides: Math.round((t.calories * t.lipidesPct) / 900),
    glucides: Math.round((t.calories * t.glucidesPct) / 400),
  };
}
export function calculate(p: Preferences) {
  if (!p.sexe || p.age === null || p.poids === null || p.taille === null || !p.activite)
    return {
      repos: null,
      entretien: null,
      coefficient: null,
      cible: null,
      raison: 'Complétez sexe, âge, poids, taille et activité pour calculer vos objectifs.',
    };
  if (p.age < 18 || p.age > 78 || p.specifique)
    return {
      repos: null,
      entretien: null,
      coefficient: null,
      cible: null,
      raison: 'Ce profil nécessite des objectifs définis avec un professionnel de la nutrition ; le calcul standard est désactivé.',
    };
  if (p.taille < 100 || p.poids < 20)
    return { repos: null, entretien: null, coefficient: null, cible: null, raison: 'Vérifiez le poids et la taille renseignés.' };
  const repos = 10 * p.poids + 6.25 * p.taille - 5 * p.age + (p.sexe === 'homme' ? 5 : -161),
    coefficient = coefficients[p.activite],
    entretien = Math.round(repos * coefficient);
  if (repos <= 0)
    return { repos: null, entretien: null, coefficient: null, cible: null, raison: 'Les données ne permettent pas une estimation cohérente.' };
  if (p.objectif === 'perte' && p.poids / Math.pow(p.taille / 100, 2) < 18.5)
    return {
      repos: Math.round(repos),
      entretien,
      coefficient,
      cible: null,
      raison: 'L’objectif de perte de poids doit être revu avec un professionnel de la nutrition.',
    };
  const calories = Math.round(entretien * (p.objectif === 'perte' ? 0.9 : p.objectif === 'muscle' ? 1.05 : 1));
  if (calories < 1000 || calories > 10000)
    return {
      repos: Math.round(repos),
      entretien,
      coefficient,
      cible: null,
      raison: 'Estimation hors de la plage du calcul standard : faites vérifier les données et les besoins par un professionnel de la nutrition.',
    };
  const cible: Target = { calories, proteinesPct: 20, lipidesPct: 30, glucidesPct: 50, note: '' };
  return { repos: Math.round(repos), entretien, coefficient, cible, raison: '' };
}
export const estimateSchema = z.object({
  repos: z.number().nullable(),
  entretien: z.number().nullable(),
  coefficient: z.number().nullable(),
  cible: target.nullable(),
  raison: z.string(),
});
export const nutritionOutput = z.object({
  profilId: z.string(),
  nom: z.string(),
  version: z.string(),
  dateNaissance: z.string().nullable(),
  preferences,
  objectifCoach: target.nullable(),
  calcul: estimateSchema,
});
export const nutritionToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
export function ageFromBirth(birth: string, now = nutritionToday()) {
  const b = birth.slice(0, 10);
  return Number(now.slice(0, 4)) - Number(b.slice(0, 4)) - (now.slice(5) < b.slice(5) ? 1 : 0);
}
