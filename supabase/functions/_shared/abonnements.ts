// Copie pour Deno des règles de src/domain/abonnements.ts utilisées par les fonctions Stripe (aucune dépendance).
// tests/paiements-stripe.test.ts vérifie que les deux fichiers donnent les mêmes valeurs.

export type CleFormule = 'appli' | 'appli_nutrition' | 'hybride_leger' | 'hybride_complet';

export const FORMULES: Record<CleFormule, { nom: string; prix: number; optionNutrition: boolean; seancesMois: number; videosMois: number }> = {
  appli: { nom: 'Appli', prix: 59, optionNutrition: false, seancesMois: 0, videosMois: 0 },
  appli_nutrition: { nom: 'Appli + nutrition', prix: 99, optionNutrition: true, seancesMois: 0, videosMois: 0 },
  hybride_leger: { nom: 'Hybride léger', prix: 149, optionNutrition: true, seancesMois: 1, videosMois: 0 },
  hybride_complet: { nom: 'Hybride complet', prix: 269, optionNutrition: true, seancesMois: 4, videosMois: 2 },
};
export const estFormule = (x: unknown): x is CleFormule => typeof x === 'string' && x in FORMULES;

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
