import { useCallback, useEffect, useRef, useState } from 'react';

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
      (e: unknown) => !annule && setEtat((avant) => ({ ...avant, erreur: e instanceof Error ? e.message : 'Erreur inconnue' })),
    );
    return () => {
      annule = true;
    };
  }, [cle, version]);

  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return { ...etat, recharger };
}
