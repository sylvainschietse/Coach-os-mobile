// RGPD : ce que le client accepte à son premier accès, et la politique de confidentialité qui le décrit.
// Changer VERSION_POLITIQUE quand le texte de la politique change sur le fond : chaque client la revoit et redonne son accord.

export const VERSION_POLITIQUE = '2026-10-30';

/** Page publique de la politique (public/confidentialite.html, publiée avec la version web). */
export const LIEN_POLITIQUE =
  process.env.EXPO_PUBLIC_POLITIQUE_CONFIDENTIALITE || 'https://sylvainschietse.github.io/Coach-os-mobile/confidentialite.html';

export interface Consentement {
  version: string;
  donneesSante: boolean;
  analyseIa: boolean;
  accepteLe: string;
}

/** Les données de santé couvertes par l'accord, dans les mots montrés au client. */
export const DONNEES_SANTE = [
  'tes mesures (poids, masse grasse, tours) et tes photos de progression',
  'ton profil et ton journal alimentaires (régime, allergies, repas)',
  'tes séances, tes performances, tes bilans de la semaine',
  'les séances, pas et sommeil lus dans Health Connect, si tu l’autorises',
];

/** Le client doit (re)donner son accord : jamais donné, ou donné pour une ancienne version de la politique. */
export function accordAttendu(c: Consentement | null | undefined): boolean {
  return !c || !c.donneesSante || c.version !== VERSION_POLITIQUE;
}
