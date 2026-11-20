// Réseau faible en salle : reconnaître une coupure, ne jamais attendre sans fin, et garder ce qui a déjà été vu.
// Rien ici ne dépend de React Native : tout se teste tel quel.

/** Au-delà, une demande au serveur est abandonnée : l'écran propose « Réessayer » au lieu de tourner sans fin. */
export const DELAI_RESEAU_MS = 20_000;

/** Message affiché quand le serveur est injoignable ou trop lent. */
export const MESSAGE_RESEAU = 'Connexion impossible : vérifie le réseau, puis réessaie.';
export const MESSAGE_LENT = 'La connexion est trop lente : réessaie dans un instant.';

const TEXTE_RESEAU = /failed to fetch|networkerror|network request failed|load failed|fetch failed|internet connection appears to be offline/i;
const TEXTE_LENT = /abort|timeout|timed out|délai/i;

function texteDe(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  if (typeof e === 'object') {
    const o = e as { name?: unknown; message?: unknown };
    return [o.name, o.message].filter((x) => typeof x === 'string').join(' ');
  }
  return '';
}

/** Coupure ou lenteur du réseau (et non un vrai refus du serveur) : on garde ce qu'on sait déjà et on réessaiera. */
export function estErreurReseau(e: unknown): boolean {
  const t = texteDe(e);
  return TEXTE_RESEAU.test(t) || TEXTE_LENT.test(t) || /AuthRetryableFetchError/.test(t);
}

/** Message lisible pour une erreur de réseau, ou null si ce n'en est pas une. */
export function messageReseau(e: unknown): string | null {
  const t = texteDe(e);
  if (TEXTE_LENT.test(t)) return MESSAGE_LENT;
  if (TEXTE_RESEAU.test(t) || /AuthRetryableFetchError/.test(t)) return MESSAGE_RESEAU;
  return null;
}

/** Le message affiché vient-il d'un problème de réseau ? (L'écran propose alors « Réessayer ».) */
export const estMessageReseau = (message: string) => message === MESSAGE_RESEAU || message === MESSAGE_LENT;

/**
 * Les envois de fichiers (photos, vidéos) et les fonctions qui appellent l'IA peuvent durer plus longtemps
 * en 4G sans être bloqués : on ne leur impose pas de délai.
 */
export function sansDelai(url: string): boolean {
  return url.includes('/storage/v1/') || url.includes('/functions/v1/');
}

type Fetch = (entree: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * `fetch` qui abandonne après `delaiMs`. Respecte aussi le signal d'annulation déjà fourni par l'appelant.
 */
export function fetchAvecDelai(fetchDeBase: Fetch, delaiMs = DELAI_RESEAU_MS): Fetch {
  return (entree, init) => {
    const url = typeof entree === 'string' ? entree : entree instanceof URL ? entree.href : (entree as Request).url;
    if (sansDelai(url ?? '')) return fetchDeBase(entree, init);
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(new Error('Délai dépassé (timeout)')), delaiMs);
    const signalAppelant = init?.signal;
    const relayer = () => controle.abort(signalAppelant?.reason);
    if (signalAppelant) {
      if (signalAppelant.aborted) relayer();
      else signalAppelant.addEventListener('abort', relayer, { once: true });
    }
    return fetchDeBase(entree, { ...init, signal: controle.signal }).finally(() => {
      clearTimeout(minuterie);
      signalAppelant?.removeEventListener('abort', relayer);
    });
  };
}

/** Profil gardé sur le téléphone pour ouvrir l'appli sans réseau. */
export interface ProfilGarde<P> {
  profil: P;
  email?: string;
  provisoire?: boolean;
}

/**
 * Au démarrage : ce que dit le serveur l'emporte ; s'il est injoignable, on garde le dernier profil connu
 * au lieu de renvoyer le client sur « Se connecter ».
 */
export function profilApresVerification<P>(
  garde: ProfilGarde<P> | null,
  verification: { ok: true; profil: P | null } | { ok: false; erreur: unknown },
): P | null {
  if (verification.ok) return verification.profil;
  return estErreurReseau(verification.erreur) && garde ? garde.profil : null;
}

/** Données gardées pour un écran : trop grosses, on ne les écrit pas sur le téléphone (place limitée sur le web). */
export const TAILLE_MAX_GARDEE = 400_000;
