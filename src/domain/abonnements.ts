// Abonnements de CoachGo : les 4 formules du site, la remise que le coach accorde, et ce que chaque formule ouvre dans l'appli.
// Le paiement se fait hors de l'appli : lien de paiement Stripe envoyé par le coach, ou encaissement à la main.
// Rien ne s'achète dans l'appli (règles Apple et Google) : le client voit sa formule et sa remise, sans bouton d'achat.

export interface Abonnement {
  /** Abonnement appli (59 €/mois) : programmes, séances, suivi, documents et nutrition limitée aux macros. */
  accesAppli: boolean;
  /** Option nutrition (+40 €/mois) : recettes, plan de repas automatique et photo d'assiette. */
  optionNutrition: boolean;
  /** Tarif d'une séance à l'unité pour ce client (60 € par défaut, au cas par cas sinon). */
  tarifSeance?: number;
  /** Vidéos corrigées incluses chaque mois dans sa formule (0 : chaque vidéo est facturée). */
  videosMois?: number;
  /** Formule du site choisie par le coach ; absente : réglage « sur mesure » (cases cochées une à une). */
  formule?: CleFormule;
  /** Remise exceptionnelle accordée par le coach (testeur, geste commercial…). */
  remise?: Remise;
  /** Comment le client paie : à la main (virement, espèces…) ou par prélèvement Stripe. */
  paiement?: ModePaiement;
  /** État de l'abonnement Stripe, tenu à jour par Stripe lui-même. */
  statutStripe?: StatutStripe;
  /** Prochain prélèvement prévu (AAAA-MM-JJ), quand le client paie par Stripe. */
  prochaineEcheance?: string;
}

export type CleFormule = 'appli' | 'appli_nutrition' | 'hybride_leger' | 'hybride_complet';

export interface Formule {
  cle: CleFormule;
  nom: string;
  accroche: string;
  prix: number;
  optionNutrition: boolean;
  /** Séances avec le coach créditées chaque mois (reportées au mois suivant si elles ne sont pas faites). */
  seancesMois: number;
  videosMois: number;
}

/** Les 4 formules du site, dans l'ordre d'affichage. */
export const FORMULES: Record<CleFormule, Formule> = {
  appli: { cle: 'appli', nom: 'Appli', accroche: 'Pour t’entraîner seul, bien guidé.', prix: 59, optionNutrition: false, seancesMois: 0, videosMois: 0 },
  appli_nutrition: {
    cle: 'appli_nutrition',
    nom: 'Appli + nutrition',
    accroche: 'Pour des résultats aussi dans l’assiette.',
    prix: 99,
    optionNutrition: true,
    seancesMois: 0,
    videosMois: 0,
  },
  hybride_leger: {
    cle: 'hybride_leger',
    nom: 'Hybride léger',
    accroche: 'Pour garder le contact avec ton coach.',
    prix: 149,
    optionNutrition: true,
    seancesMois: 1,
    videosMois: 0,
  },
  hybride_complet: {
    cle: 'hybride_complet',
    nom: 'Hybride complet',
    accroche: 'Pour progresser vite, aux côtés de ton coach.',
    prix: 269,
    optionNutrition: true,
    seancesMois: 4,
    videosMois: 2,
  },
};
export const CLES_FORMULES = Object.keys(FORMULES) as CleFormule[];
export const estFormule = (x: unknown): x is CleFormule => typeof x === 'string' && x in FORMULES;

/** Ce que la formule ouvre dans l'appli : appliqué tel quel sur la fiche du client. */
export function droitsFormule(cle: CleFormule): Pick<Abonnement, 'accesAppli' | 'optionNutrition' | 'videosMois' | 'formule'> {
  const f = FORMULES[cle];
  return { formule: cle, accesAppli: true, optionNutrition: f.optionNutrition, videosMois: f.videosMois };
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

/** Prix mensuel avant remise : celui de la formule, ou appli + option nutrition en réglage sur mesure. */
export function prixMensuel(a: Abonnement) {
  if (!a.accesAppli) return 0;
  if (a.formule) return FORMULES[a.formule].prix;
  return TARIFS.appli + (a.optionNutrition ? TARIFS.optionNutrition : 0);
}

/** Montant mensuel à encaisser ce mois-là (AAAA-MM-JJ, aujourd'hui par défaut), remise déduite. */
export function mensualite(a: Abonnement, jour = new Date().toISOString().slice(0, 10)) {
  return prixAvecRemise(prixMensuel(a), a.remise, jour).aPayer;
}
