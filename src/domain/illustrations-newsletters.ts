// Illustrations des newsletters (assets/newsletters/mag-*.jpg) : dessins à plat noir, rouge et crème, les mêmes que
// ceux des PDF magazine. Les idées de sujets les désignent par un nom simple (« recette ») ; les articles complets
// directement par leur fichier (« mag-979c40 »).
export const FICHIERS_ILLUSTRATIONS = [
  'mag-cd8ea2', 'mag-979c40', 'mag-2996d9', 'mag-99cdc3', 'mag-8e90c1', 'mag-2f6d1f', 'mag-78a392', 'mag-597f4f',
  'mag-a9f8cf', 'mag-998acd', 'mag-0275dd', 'mag-8d6273', 'mag-1e9fd4', 'mag-c184a1', 'mag-5a6b51', 'mag-ec4271',
] as const;

const ALIAS: Record<string, (typeof FICHIERS_ILLUSTRATIONS)[number]> = {
  conseil: 'mag-cd8ea2',
  recette: 'mag-979c40',
  saison: 'mag-8e90c1',
  recup: 'mag-2996d9',
  defi: 'mag-99cdc3',
  nouveautes: 'mag-5a6b51',
  manque: 'mag-597f4f',
  reprendre: 'mag-a9f8cf',
  temoignage: 'mag-8d6273',
  offre: 'mag-8e90c1',
  objectif: 'mag-998acd',
  mythes: 'mag-0275dd',
};

/** Le fichier (sans extension) d'une illustration, d'après son nom simple ou son fichier. */
export function fichierIllustration(cle: string): string {
  // Photo d'un article de la bibliothèque (assets/newsletters/photo-NN.jpg), une par article.
  if (/^(photo|illus)-\d{2}$/.test(cle)) return cle;
  return ALIAS[cle] ?? ((FICHIERS_ILLUSTRATIONS as readonly string[]).includes(cle) ? cle : 'mag-cd8ea2');
}
