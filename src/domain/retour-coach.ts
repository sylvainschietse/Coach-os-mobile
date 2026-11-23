/**
 * Bouton Retour du téléphone dans l'espace coach : il remonte d'un niveau dans l'arborescence de l'appli
 * (fenêtre ouverte, puis liste, puis onglet, puis accueil), quel que soit le chemin suivi pour arriver là.
 * Avant, il rejouait les écrans dans l'ordre où ils avaient été ouverts, comme l'historique d'un navigateur.
 */
export type ParamsEcran = Record<string, string | string[] | undefined>;
export type Modification = Record<string, string | undefined>;

/**
 * Du plus profond au moins profond : la première fenêtre ouverte de la liste est celle que Retour ferme.
 * L'ordre suit celui de l'affichage : un éditeur (tâche, paiement…) passe devant un bilan, un document,
 * un Booster, qui passent devant la fiche contact d'où ils ont été ouverts.
 */
const NIVEAUX: string[][] = [
  ['apercu'],
  ['coaching', 'tache', 'paiement'],
  ['bilan'],
  ['doc'],
  ['booster', 'bc'],
  ['contact', 'volet'],
  ['seance'],
  ['programme'],
  ['client'],
  ['dossier'],
];

const ACCUEIL: Modification = { onglet: 'crm', rubrique: 'Accueil' };

const rempli = (v: string | string[] | undefined) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== '');

/** L'écran parent de celui affiché, sous forme de paramètres à changer ; null à l'accueil (le téléphone reprend la main). */
export function ecranParentCoach(params: ParamsEcran): Modification | null {
  for (const niveau of NIVEAUX) {
    if (niveau.some((cle) => rempli(params[cle]))) return Object.fromEntries(niveau.map((cle) => [cle, undefined]));
  }
  // Une rubrique de Mon profil ramène à la liste des rubriques.
  if (params.onglet === 'profil' && rempli(params.section)) return { section: undefined };

  // Ce qui reste ouvert est un onglet (ou une rubrique de l'accueil) : Retour mène à l'accueil.
  const autres = Object.keys(params).filter((cle) => rempli(params[cle]) && cle !== 'onglet' && cle !== 'rubrique');
  const surAccueil = (!rempli(params.onglet) || params.onglet === 'crm') && (!rempli(params.rubrique) || params.rubrique === 'Accueil') && autres.length === 0;
  if (surAccueil) return null;
  return { ...Object.fromEntries(Object.keys(params).map((cle) => [cle, undefined])), ...ACCUEIL };
}
