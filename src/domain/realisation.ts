import type { Mesure, Realisation, SerieSaisie, Valeurs } from './types';

/** Le client modifie une valeur : la série redevient à valider. */
export function modifierSerie(serie: SerieSaisie, mesure: Mesure, valeur: number | undefined): SerieSaisie {
  const valeurs = { ...serie.valeurs };
  if (valeur === undefined || Number.isNaN(valeur)) delete valeurs[mesure];
  else valeurs[mesure] = valeur;
  return { ...serie, valeurs, validee: false };
}

/**
 * Le client valide la série. Les champs qu'il n'a pas touchés reprennent la suggestion :
 * c'est son geste de validation qui transforme la suggestion en performance.
 */
export function validerSerie(serie: SerieSaisie): SerieSaisie {
  const valeurs: Valeurs = { ...serie.suggestion, ...serie.valeurs };
  return { ...serie, valeurs, validee: true };
}

export function annulerValidation(serie: SerieSaisie): SerieSaisie {
  return { ...serie, validee: false };
}

export interface InfosRealisation {
  id: string;
  seanceId: string;
  clientId: string;
  debut: string;
  fin: string;
  commentaire?: string;
  nouvelId: () => string;
}

/** Seules les séries validées partent : une suggestion non confirmée n'est jamais une performance. */
export function construireRealisation(series: SerieSaisie[], infos: InfosRealisation): Realisation {
  const commentaire = infos.commentaire?.trim();
  return {
    id: infos.id,
    seanceId: infos.seanceId,
    clientId: infos.clientId,
    debut: infos.debut,
    fin: infos.fin,
    commentaire: commentaire ? commentaire : undefined,
    series: series
      .filter((s) => s.validee)
      .map((s) => ({
        id: infos.nouvelId(),
        ligneId: s.ligneId,
        exerciceId: s.exerciceId,
        index: s.index,
        valeurs: s.valeurs,
        suggestion: s.suggestion,
      })),
  };
}
