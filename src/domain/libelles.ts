// Libellés lisibles pour le coach : les séances importées gardent en tête leur code de modèle
// (« MOD-SAL-V3-PM4-4-S2 · Bas du corps A · Squat ») ; on n'affiche que leur nom.

/** Un code de modèle : majuscules et chiffres séparés par des tirets, au moins trois morceaux. */
const CODE = /\b[A-Z]{2,}[A-Z0-9]*(?:-[A-Z0-9]+){2,}\b/g;

/** « MOD-SAL-V3-PM4-4-S2 · Bas du corps A · Squat » → « Bas du corps A · Squat ». */
export function sansCode(texte: string): string {
  return texte
    .replace(CODE, '')
    .split(' · ')
    .map((m) => m.trim())
    .filter(Boolean)
    .join(' · ');
}

/** Au-delà de 5 h, la séance a été laissée ouverte : la durée ne veut rien dire, on la retire. */
const DUREE_MAX_MIN = 300;

/** Texte d'une notification : sans code de modèle et sans durée aberrante (« 14471 min »). */
export function corpsLisible(corps: string): string {
  return sansCode(corps)
    .split(' · ')
    .filter((m) => {
      const n = /^(\d+) min$/.exec(m);
      return !n || Number(n[1]) <= DUREE_MAX_MIN;
    })
    .join(' · ');
}
