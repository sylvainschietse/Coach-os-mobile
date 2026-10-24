import type { Exercice, Mesure } from './types';

export const LIBELLES: Record<Mesure, { libelle: string; unite: string }> = {
  charge: { libelle: 'Charge', unite: 'kg' },
  repetitions: { libelle: 'Répétitions', unite: 'rép.' },
  duree: { libelle: 'Durée', unite: 's' },
  distance: { libelle: 'Distance', unite: 'm' },
  calories: { libelle: 'Calories', unite: 'cal' },
  watts: { libelle: 'Puissance', unite: 'W' },
  allure500: { libelle: 'Allure /500 m', unite: 's' },
};

const ORDRE: Mesure[] = ['charge', 'repetitions', 'duree', 'distance', 'calories', 'watts', 'allure500'];

/** Les champs à afficher pour cet exercice, dans un ordre stable. */
export function champsPertinents(exercice: Pick<Exercice, 'mesures'>): Mesure[] {
  return ORDRE.filter((m) => exercice.mesures.includes(m));
}

export function formaterValeur(mesure: Mesure, valeur: number | undefined): string {
  if (valeur === undefined) return '–';
  if (mesure === 'allure500' || (mesure === 'duree' && valeur >= 60)) {
    const m = Math.floor(valeur / 60);
    const s = Math.round(valeur % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  return `${String(valeur).replace('.', ',')} ${LIBELLES[mesure].unite}`;
}
