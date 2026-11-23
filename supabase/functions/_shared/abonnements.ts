// Copie pour Deno des règles de src/domain/abonnements.ts et offres.ts utilisées par les fonctions Stripe (aucune dépendance).
// tests/paiements-stripe.test.ts vérifie que les deux fichiers donnent les mêmes valeurs.

/** Offre d'un coach telle qu'elle est en base (table offres). */
export interface LigneOffre {
  id: string;
  coach_id: string;
  nom: string;
  accroche: string | null;
  prix: number | string;
  periodicite: string;
  acces_appli: boolean;
  nutrition: boolean;
  videos_mois: number;
  seances: number;
  essai_jours: number;
  active: boolean;
  stripe_produit: string | null;
  stripe_prix: string | null;
  stripe_prix_cle: string | null;
}

/** Montant en centimes et rythme de facturation : un prix Stripe ne change jamais, un nouveau tarif = un nouveau prix. */
export function tarifStripe(o: Pick<LigneOffre, 'prix' | 'periodicite'>) {
  const centimes = Math.round(Number(o.prix) * 100);
  const recurring =
    o.periodicite === 'unique'
      ? undefined
      : o.periodicite === 'annee'
        ? { interval: 'year' as const, interval_count: 1 }
        : { interval: 'month' as const, interval_count: o.periodicite === 'trimestre' ? 3 : 1 };
  return { centimes, recurring, cle: `${centimes}_${o.periodicite}` };
}

/** Ce que l'offre ouvre sur la fiche du client (même règle que droitsOffre dans src/domain/offres.ts). */
export function droitsOffre(o: Pick<LigneOffre, 'periodicite' | 'acces_appli' | 'nutrition' | 'videos_mois'>) {
  if (o.periodicite === 'unique') return {};
  return { acces_appli: o.acces_appli, option_nutrition: o.acces_appli && o.nutrition, videos_mois: o.acces_appli ? o.videos_mois : 0 };
}

/** Le client garde l'accès tant que Stripe considère l'abonnement en cours, y compris pendant les relances d'un paiement refusé. */
export const statutOuvreAcces = (s: string) => s === 'active' || s === 'trialing' || s === 'past_due';

/** Remise Stripe (coupon) d'après la fiche : % ou montant en centimes, pour toujours ou un nombre de mois. */
export function coupon(
  r: { remise_type: string | null; remise_valeur: number | string | null; remise_motif: string | null; remise_jusqu_au: string | null },
  aujourdhui: string,
) {
  if (!r.remise_type || r.remise_valeur == null) return undefined;
  const valeur = Number(r.remise_valeur);
  if (!(valeur > 0)) return undefined;
  if (r.remise_jusqu_au && r.remise_jusqu_au < aujourdhui) return undefined;
  // Nombre de mois prélevés jusqu'à la date de fin incluse (le premier compte).
  let duree: { duration: 'forever' } | { duration: 'repeating'; duration_in_months: number } = { duration: 'forever' };
  if (r.remise_jusqu_au) {
    const [a1, m1, j1] = aujourdhui.split('-').map(Number);
    const [a2, m2, j2] = r.remise_jusqu_au.split('-').map(Number);
    const mois = (a2 - a1) * 12 + (m2 - m1) + (j2 >= j1 ? 1 : 0);
    duree = { duration: 'repeating', duration_in_months: Math.max(1, mois) };
  }
  const nom = (r.remise_motif?.trim() || (r.remise_type === 'pourcent' && valeur >= 100 ? 'Offert par ton coach' : 'Remise de ton coach')).slice(0, 40);
  return r.remise_type === 'pourcent'
    ? { name: nom, percent_off: Math.min(100, valeur), ...duree }
    : { name: nom, amount_off: Math.round(valeur * 100), currency: 'eur', ...duree };
}
