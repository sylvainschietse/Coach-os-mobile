import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

/** Au-delà, le bouton redevient utilisable même si l'action n'a pas répondu : il ne reste jamais bloqué. */
const ATTENTE_MAX_MS = 20_000;

/** Petit retour tactile au toucher : l'appui est senti tout de suite, même si la suite prend du temps. */
export function toucher() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

const estPromesse = (r: unknown): r is PromiseLike<unknown> => !!r && typeof (r as { then?: unknown }).then === 'function';

/**
 * Enveloppe l'action d'un bouton. Si elle renvoie une promesse (enregistrement, envoi…), le bouton passe en
 * chargement jusqu'à la fin et ignore les appuis répétés : on voit que l'appui a été pris en compte.
 */
export function usePression(action: (() => unknown) | undefined) {
  const [enCours, setEnCours] = useState(false);
  const occupe = useRef(false);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const presser = useCallback(() => {
    if (occupe.current || !action) return;
    toucher();
    const r = action();
    if (!estPromesse(r)) return;
    occupe.current = true;
    setEnCours(true);
    let fini = false;
    const fin = () => {
      if (fini) return;
      fini = true;
      clearTimeout(minuterie);
      occupe.current = false;
      if (monte.current) setEnCours(false);
    };
    const minuterie = setTimeout(fin, ATTENTE_MAX_MS);
    r.then(fin, (e: unknown) => {
      fin();
      if (__DEV__) console.warn(e);
    });
  }, [action]);

  return { enCours, presser };
}
