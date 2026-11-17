import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Retour commun après « Enregistrer » : le bouton passe à « Enregistré ✓ » quelques secondes, et un bandeau
 * « Enregistré » s'affiche en bas de l'écran (il reste visible même si la fenêtre se ferme juste après).
 * Un échec qui n'a pas été affiché par l'écran passe aussi par ce bandeau, en rouge : plus d'appui sans suite.
 */

export type Annonce = { id: number; type: 'ok' | 'erreur'; texte: string };

/** Durée du « Enregistré ✓ » sur le bouton. */
export const DUREE_CONFIRMATION_MS = 2500;
const DUREE_OK_MS = 2500;
const DUREE_ERREUR_MS = 7000;

let courante: Annonce | null = null;
let compteur = 0;
let minuterie: ReturnType<typeof setTimeout> | undefined;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

/** Affiche le bandeau (vert « ok », rouge « erreur »). Le suivant remplace le précédent. */
export function annoncer(texte: string, type: Annonce['type'] = 'ok') {
  courante = { id: ++compteur, type, texte };
  clearTimeout(minuterie);
  minuterie = setTimeout(effacerAnnonce, type === 'ok' ? DUREE_OK_MS : DUREE_ERREUR_MS);
  prevenir();
}

export function effacerAnnonce() {
  clearTimeout(minuterie);
  if (!courante) return;
  courante = null;
  prevenir();
}

// Plusieurs bandeaux peuvent être montés (la racine, et chaque fenêtre ouverte par-dessus) : seul le dernier s'affiche,
// sinon une fenêtre posée au-dessus le cacherait ou on le verrait deux fois.
let pile: number[] = [];
let prochainEmplacement = 0;

const sAbonner = (f: () => void) => {
  abonnes.add(f);
  return () => {
    abonnes.delete(f);
  };
};
const lire = () => courante;
/** Le bandeau affiché en ce moment (tests). */
export const annonceCourante = lire;

/** Le bandeau à afficher par cet emplacement (null si rien, ou si un autre emplacement est au-dessus). */
export function useAnnonce(): Annonce | null {
  const [emplacement] = useState(() => ++prochainEmplacement);
  useEffect(() => {
    pile = [...pile, emplacement];
    prevenir();
    return () => {
      pile = pile.filter((e) => e !== emplacement);
      prevenir();
    };
  }, [emplacement]);
  const annonce = useSyncExternalStore(sAbonner, lire, lire);
  const dessus = useSyncExternalStore(
    sAbonner,
    () => pile[pile.length - 1] === emplacement,
    () => true,
  );
  return dessus ? annonce : null;
}

/**
 * À appeler juste après un enregistrement réussi : `signaler()` passe le bouton à « Enregistré ✓ » (via `confirme`)
 * et affiche le bandeau. Ne jamais l'appeler si l'enregistrement a échoué ou n'a pas eu lieu (champ invalide…).
 */
export function useEnregistre(duree = DUREE_CONFIRMATION_MS) {
  const [confirme, setConfirme] = useState(false);
  const monte = useRef(true);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
      clearTimeout(minuterie.current);
    };
  }, []);
  const signaler = useCallback(
    (texte = 'Enregistré') => {
      annoncer(texte, 'ok');
      if (!monte.current) return;
      setConfirme(true);
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => monte.current && setConfirme(false), duree);
    },
    [duree],
  );
  return { confirme, signaler };
}

/** Message lisible d'une erreur, quelle que soit sa forme (Error, erreur Supabase, texte). */
export function messageErreur(e: unknown): string {
  const m =
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : e && typeof e === 'object' && typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(m)) return 'connexion impossible, vérifie le réseau puis réessaie.';
  return m || 'erreur inconnue';
}

/** Une annulation par la personne (partage fermé, sélection abandonnée) n'est pas un échec à signaler. */
export function estAnnulation(e: unknown): boolean {
  const m = messageErreur(e).toLowerCase();
  return (e instanceof Error && e.name === 'AbortError') || /cancel|annul/.test(m);
}

/** Libellés d'enregistrement : pendant l'envoi, le bouton dit « Enregistrement… » au lieu d'une simple roue. */
export function estLibelleEnregistrement(libelle: string | undefined): boolean {
  return !!libelle && /^(Enregistrer|Mettre à jour|Sauvegarder)/.test(libelle);
}

/**
 * À appeler dans le `catch` d'un enregistrement : bandeau rouge « Pas enregistré : … » (visible même si le message
 * de l'écran est hors de vue) ; renvoie le message en français pour l'afficher aussi près du bouton.
 */
export function signalerEchec(e: unknown): string {
  const m = messageErreur(e);
  const texte = m.charAt(0).toUpperCase() + m.slice(1);
  annoncer(`Pas enregistré : ${m}`, 'erreur');
  return texte;
}
