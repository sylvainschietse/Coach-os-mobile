import type { HistoriqueExercice, LignePrescription, SerieSaisie, Valeurs } from './types';

/** Pas d'augmentation quand toutes les séries ont atteint le haut de la fourchette. */
export const PAS_CHARGE_KG = 2.5;

/**
 * Règle provisoire, à valider avec Sylvain :
 * - sans historique : charge indicative du coach et bas de la fourchette de répétitions ;
 * - toutes les séries précédentes au haut de la fourchette : charge + 2,5 kg ;
 * - sinon : même charge que la dernière fois.
 * Le résultat n'est qu'une suggestion affichée grisée, jamais une performance.
 */
export function suggererValeurs(ligne: LignePrescription, historique?: HistoriqueExercice): Valeurs {
  const mesures = ligne.exercice.mesures;
  const suggestion: Valeurs = {};

  if (mesures.includes('repetitions') && ligne.repetitionsMin !== undefined) {
    suggestion.repetitions = ligne.repetitionsMin;
  }
  if (mesures.includes('duree') && ligne.dureeS !== undefined) {
    suggestion.duree = ligne.dureeS;
  }
  if (!mesures.includes('charge')) return suggestion;

  const precedentes = historique?.series.filter((s) => s.charge !== undefined) ?? [];
  if (precedentes.length === 0) {
    if (ligne.chargeIndicative !== undefined) suggestion.charge = ligne.chargeIndicative;
    return suggestion;
  }

  const derniereCharge = Math.max(...precedentes.map((s) => s.charge ?? 0));
  const haut = ligne.repetitionsMax ?? ligne.repetitionsMin;
  const toutesAuHaut =
    haut !== undefined &&
    precedentes.length >= ligne.series &&
    precedentes.every((s) => s.charge === derniereCharge && (s.repetitions ?? 0) >= haut);

  suggestion.charge = toutesAuHaut ? derniereCharge + PAS_CHARGE_KG : derniereCharge;
  return suggestion;
}

export function preparerSeries(ligne: LignePrescription, historique?: HistoriqueExercice): SerieSaisie[] {
  const suggestion = suggererValeurs(ligne, historique);
  return Array.from({ length: ligne.series }, (_, index) => ({
    ligneId: ligne.id,
    exerciceId: ligne.exercice.id,
    index,
    suggestion,
    valeurs: {},
    validee: false,
  }));
}
