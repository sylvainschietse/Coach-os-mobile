// Les grosses données de démonstration (exercices, programmes, recettes : 0,7 Mo) ne servent qu'au mode démo.
// Quand l'appli est fabriquée avec la base Supabase, la condition est tranchée à la fabrication et ces fichiers
// ne sont pas embarqués : la version en ligne ne les télécharge plus.
import type catalogueType from './catalogue-demo.json';
import type modelesType from './modeles-demo.json';
import type recettesCoachType from './recettes-coach.json';
import type recettesDemoType from './recettes-demo.json';

export const catalogueDemoJson: typeof catalogueType = process.env.EXPO_PUBLIC_SUPABASE_URL ? [] : require('./catalogue-demo.json');
export const modelesDemoJson: typeof modelesType = process.env.EXPO_PUBLIC_SUPABASE_URL ? ({ d: [], c: [], p: [] } as unknown as typeof modelesType) : require('./modeles-demo.json');
export const recettesCoachJson: typeof recettesCoachType = process.env.EXPO_PUBLIC_SUPABASE_URL ? [] : require('./recettes-coach.json');
export const recettesDemoJson: typeof recettesDemoType = process.env.EXPO_PUBLIC_SUPABASE_URL ? [] : require('./recettes-demo.json');
