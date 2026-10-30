// Abonnements de CoachGo. Le coach encaisse en dehors de l'appli (virement, lien de paiement, espèces) :
// l'appli n'affiche aucun prix d'achat au client, elle ouvre ou ferme seulement l'accès.

export interface Abonnement {
  /** Abonnement appli (59 €/mois) : programmes, séances, suivi, documents et nutrition limitée aux macros. */
  accesAppli: boolean;
  /** Option nutrition (+40 €/mois) : recettes, plan de repas automatique et photo d'assiette. */
  optionNutrition: boolean;
}

export const TARIFS = { appli: 59, optionNutrition: 40, seance: 60 } as const;

export type TypePack = "unite" | "pack10";
export const PACKS: Record<
  TypePack,
  { libelle: string; seances: number; prix: number }
> = {
  unite: { libelle: "Séance à l’unité", seances: 1, prix: TARIFS.seance },
  pack10: {
    libelle: "Pack 10 séances + 1 offerte",
    seances: 11,
    prix: 10 * TARIFS.seance,
  },
};

export interface PackSeances {
  id: string;
  clientId: string;
  seancesTotal: number;
  seancesFaites: number;
  prix?: number;
  /** AAAA-MM-JJ. */
  acheteLe: string;
}

export const restantes = (p: PackSeances) => p.seancesTotal - p.seancesFaites;

/** Séances restantes sur tous les packs, et total acheté sur les packs encore entamés. */
export function soldeSeances(packs: PackSeances[]) {
  const ouverts = packs.filter((p) => restantes(p) > 0);
  return {
    restantes: ouverts.reduce((s, p) => s + restantes(p), 0),
    total: ouverts.reduce((s, p) => s + p.seancesTotal, 0),
  };
}

/** Le pack à décompter : le plus ancien qui a encore des séances. */
export function packADecompter(packs: PackSeances[]): PackSeances | undefined {
  return [...packs]
    .filter((p) => restantes(p) > 0)
    .sort((a, b) => a.acheteLe.localeCompare(b.acheteLe))[0];
}

/** Montant mensuel de l'abonnement, pour le coach. */
export function mensualite(a: Abonnement) {
  if (!a.accesAppli) return 0;
  return TARIFS.appli + (a.optionNutrition ? TARIFS.optionNutrition : 0);
}
