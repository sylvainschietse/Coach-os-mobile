import { useCallback, useEffect, useRef, useState } from 'react';

/** Message lisible : une coupure réseau ne doit pas s'afficher comme « TypeError: Failed to fetch ». */
export function messageErreur(e: unknown) {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(m)) return 'Connexion impossible : vérifiez le réseau, puis réessayez.';
  return m || 'Erreur inconnue';
}

/** Charge une donnée asynchrone ; elle se recharge quand `cle` change ou sur demande. */
export function useCharger<T>(charger: () => Promise<T>, cle: string) {
  const [etat, setEtat] = useState<{ donnee: T | null; erreur: string | null }>({ donnee: null, erreur: null });
  const [version, setVersion] = useState(0);
  const chargerRef = useRef(charger);

  useEffect(() => {
    chargerRef.current = charger;
  });

  useEffect(() => {
    let annule = false;
    chargerRef.current().then(
      (donnee) => !annule && setEtat({ donnee, erreur: null }),
      (e: unknown) => !annule && setEtat((avant) => ({ ...avant, erreur: messageErreur(e) })),
    );
    return () => {
      annule = true;
    };
  }, [cle, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return { ...etat, recharger };
}

/** Recharge quand l'écran revient au premier plan et quand une autre partie de l'écran signale un changement. */
export function useRechargerSur(recharger: () => void, ecouter: (fn: () => void) => () => void) {
  useEffect(() => ecouter(recharger), [recharger, ecouter]);
}
