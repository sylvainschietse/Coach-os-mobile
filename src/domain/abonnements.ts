// Abonnement d'un client : l'offre de son coach (voir offres.ts), la remise que le coach accorde, et ce qu'elle ouvre dans l'appli.
// Le client paie son coach par Stripe (page de paiement), ou le coach encaisse à la main.
import type { Offre } from './offres';

export interface Abonnement {
  /** Accès à l'appli : programmes, séances, suivi, documents et nutrition limitée aux macros. */
  accesAppli: boolean;
  /** Nutrition complète : recettes, plan de repas automatique et photo d'assiette. */
  optionNutrition: boolean;
  /** Tarif d'une séance à l'unité pour ce client (60 € par défaut, au cas par cas sinon). */
  tarifSeance?: number;
  /** Vidéos corrigées incluses chaque mois dans sa formule (0 : chaque vidéo est facturée). */
  videosMois?: number;
  /** Offre du coach ; absente : réglage « sur mesure » (cases cochées une à une). */
  offre?: Offre;
  /** Prix que paie ce client : celui de l'offre quand il s'est abonné (les anciens abonnés gardent leur prix), ou le prix sur mesure. */
  offrePrix?: number;
  /** Remise exceptionnelle accordée par le coach (testeur, geste commercial…). */
  remise?: Remise;
  /** Comment le client paie : à la main (virement, espèces…) ou par prélèvement Stripe. */
  paiement?: ModePaiement;
  /** État de l'abonnement Stripe, tenu à jour par Stripe lui-même. */
  statutStripe?: StatutStripe;
  /** Prochain prélèvement prévu (AAAA-MM-JJ), quand le client paie par Stripe. */
  prochaineEcheance?: string;
}

export type ModePaiement = 'manuel' | 'stripe';
/** Statuts d'un abonnement Stripe (https://docs.stripe.com/billing/subscriptions/overview#subscription-statuses). */
export type StatutStripe = 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';

/** Le client garde l'accès tant que Stripe considère l'abonnement en cours, y compris pendant les relances d'un paiement refusé. */
export const statutOuvreAcces = (s: StatutStripe) => s === 'active' || s === 'trialing' || s === 'past_due';

export const LIBELLES_STATUT_STRIPE: Record<StatutStripe, string> = {
  incomplete: 'Paiement en attente',
  incomplete_expired: 'Lien de paiement expiré',
  trialing: 'En cours',
  active: 'À jour',
  past_due: 'Paiement refusé, Stripe relance',
  canceled: 'Résilié',
  unpaid: 'Impayé, accès coupé',
  paused: 'En pause',
};

/** Remise exceptionnelle : un pourcentage (100 % = offert) ou un montant en euros retiré chaque mois. */
export interface Remise {
  type: 'pourcent' | 'montant';
  valeur: number;
  /** Affiché au client, par exemple « Merci d’être testeur ». */
  motif?: string;
  /** Dernier jour de la remise (AAAA-MM-JJ) ; absent : sans fin. */
  jusquAu?: string;
}

/** La remise s'applique-t-elle à cette date (AAAA-MM-JJ) ? */
export const remiseEnCours = (r: Remise | undefined, jour: string): r is Remise => !!r && r.valeur > 0 && (!r.jusquAu || r.jusquAu >= jour);

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Prix normal, remise et prix payé ce mois-là. La remise ne descend jamais sous 0 €. */
export function prixAvecRemise(prix: number, remise: Remise | undefined, jour: string) {
  const r = remiseEnCours(remise, jour) ? remise : undefined;
  const brute = !r ? 0 : r.type === 'pourcent' ? (prix * Math.min(100, r.valeur)) / 100 : r.valeur;
  const montantRemise = arrondi(Math.min(prix, Math.max(0, brute)));
  const aPayer = arrondi(prix - montantRemise);
  return { prix, remise: montantRemise, aPayer, offert: prix > 0 && aPayer === 0 };
}

/** Remise lisible, pour le coach et pour le client. */
export function libelleRemise(r: Remise) {
  const part = r.type === 'pourcent' ? (r.valeur >= 100 ? 'offert (−100 %)' : `−${r.valeur.toLocaleString('fr-FR')} %`) : `−${r.valeur.toLocaleString('fr-FR')} € par mois`;
  const fin = r.jusquAu ? ` jusqu’au ${r.jusquAu.split('-').reverse().join('/')}` : '';
  return `${part}${fin}`;
}

/** Contrôle de la saisie du coach : renvoie la remise propre, ou un message d'erreur. */
export function lireRemise(type: Remise['type'], valeurSaisie: string, motif: string, jusquAu: string): Remise | string {
  const valeur = Number(valeurSaisie.trim().replace(',', '.'));
  if (!Number.isFinite(valeur) || valeur <= 0) return 'Montant de la remise illisible : écris par exemple 100 ou 20.';
  if (type === 'pourcent' && valeur > 100) return 'Une remise ne peut pas dépasser 100 %.';
  if (type === 'montant' && valeur > 10000) return 'Montant de la remise trop élevé.';
  const fin = jusquAu.trim();
  let jour: string | undefined;
  if (fin) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fin) ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fin);
    if (!m) return 'Date de fin illisible : écris-la comme 31/12/2026.';
    jour = fin.includes('/') ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : fin;
    if (Number.isNaN(Date.parse(`${jour}T00:00:00Z`))) return 'Date de fin illisible : écris-la comme 31/12/2026.';
  }
  return { type, valeur: arrondi(valeur), motif: motif.trim().slice(0, 80) || undefined, jusquAu: jour };
}

export const TARIFS = { appli: 59, optionNutrition: 40, seance: 60, video: 15 } as const;
export const MAX_VIDEOS_MOIS = 8;

/** Vidéos envoyées ce mois-ci face au nombre inclus : combien restent, combien sont à facturer. */
export function bilanVideos(envoyees: number, incluses: number) {
  const restantes = Math.max(0, incluses - envoyees);
  const enPlus = Math.max(0, envoyees - incluses);
  return { envoyees, incluses, restantes, enPlus, aFacturer: enPlus * TARIFS.video };
}

/** Pack que le coach ajoute à la main sur la fiche : une de ses offres « pack », ou la séance à l'unité. */
export interface PackAVendre {
  libelle: string;
  seances: number;
  prix: number;
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

/** Prix d'une échéance avant remise : celui que le client paie pour son offre, ou le prix sur mesure. Un pack payé en une fois n'en a pas. */
export function prixAbonnement(a: Abonnement) {
  if (a.offre) return a.offre.periodicite === 'unique' ? 0 : (a.offrePrix ?? a.offre.prix);
  return a.accesAppli ? (a.offrePrix ?? 0) : 0;
}

/** « / mois », « / trimestre », « / an » selon l'offre. */
export const suffixeAbonnement = (a: Abonnement) => (a.offre?.periodicite === 'trimestre' ? '/ trimestre' : a.offre?.periodicite === 'annee' ? '/ an' : '/ mois');

/** Montant à encaisser à l'échéance (AAAA-MM-JJ, aujourd'hui par défaut), remise déduite. */
export function mensualite(a: Abonnement, jour = new Date().toISOString().slice(0, 10)) {
  return prixAvecRemise(prixAbonnement(a), a.remise, jour).aPayer;
}
