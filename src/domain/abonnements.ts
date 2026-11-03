// Abonnements de CoachGo. Le coach encaisse en dehors de l'appli (virement, lien de paiement, espèces) :
// l'appli n'affiche aucun prix d'achat au client, elle ouvre ou ferme seulement l'accès.

export interface Abonnement {
  /** Abonnement appli (59 €/mois) : programmes, séances, suivi, documents et nutrition limitée aux macros. */
  accesAppli: boolean;
  /** Option nutrition (+40 €/mois) : recettes, plan de repas automatique et photo d'assiette. */
  optionNutrition: boolean;
  /** Tarif d'une séance à l'unité pour ce client (60 € par défaut, au cas par cas sinon). */
  tarifSeance?: number;
  /** Vidéos corrigées incluses chaque mois dans sa formule (0 : chaque vidéo est facturée). */
  videosMois?: number;
}

export const TARIFS = { appli: 59, optionNutrition: 40, seance: 60, video: 15 } as const;
export const MAX_VIDEOS_MOIS = 8;

/** Vidéos envoyées ce mois-ci face au nombre inclus : combien restent, combien sont à facturer. */
export function bilanVideos(envoyees: number, incluses: number) {
  const restantes = Math.max(0, incluses - envoyees);
  const enPlus = Math.max(0, envoyees - incluses);
  return { envoyees, incluses, restantes, enPlus, aFacturer: enPlus * TARIFS.video };
}

export type TypePack = 'unite' | 'pack10';
export const PACKS: Record<TypePack, { libelle: string; seances: number; prix: number }> = {
  unite: { libelle: 'Séance à l’unité', seances: 1, prix: TARIFS.seance },
  pack10: {
    libelle: 'Pack 10 séances + 1 offerte',
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
  /** Pack partagé (couple, duo) : les autres personnes qui l'utilisent. Côté titulaire et côté coach seulement. */
  partageAvec?: { clientId: string; prenom: string }[];
  /** Pack d'une autre personne, partagé avec ce client. */
  titulaire?: { clientId: string; prenom: string };
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
  return [...packs].filter((p) => restantes(p) > 0).sort((a, b) => a.acheteLe.localeCompare(b.acheteLe))[0];
}

/** Montant mensuel de l'abonnement, pour le coach. */
export function mensualite(a: Abonnement) {
  if (!a.accesAppli) return 0;
  return TARIFS.appli + (a.optionNutrition ? TARIFS.optionNutrition : 0);
}
