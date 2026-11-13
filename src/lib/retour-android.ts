import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Bouton Retour d'Android sur un écran qui navigue en changeant ses paramètres (onglets, rubriques, dossier ouvert) :
 * router.setParams ne garde pas d'historique, donc Retour quittait l'app. On retient les états précédents
 * et Retour y revient ; il ne quitte l'app qu'une fois revenu au premier état.
 */
export function useRetourAndroid(params: Record<string, string | string[] | undefined>) {
  const pile = useRef<Record<string, string | undefined>[]>([]);
  const courant = useRef<Record<string, string | undefined>>({});
  const enRetour = useRef(false);
  const cle = JSON.stringify(params);

  useEffect(() => {
    const p = JSON.parse(cle) as Record<string, string | undefined>;
    if (enRetour.current) enRetour.current = false;
    else if (JSON.stringify(courant.current) !== cle && Object.keys(courant.current).length + pile.current.length > 0)
      pile.current = [...pile.current.slice(-49), courant.current];
    courant.current = p;
  }, [cle]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      const precedent = pile.current.pop();
      if (!precedent) return false;
      enRetour.current = true;
      // Chaque paramètre absent de l'état précédent est effacé explicitement.
      const efface = Object.fromEntries(Object.keys(courant.current).map((k) => [k, undefined]));
      router.setParams({ ...efface, ...precedent });
      return true;
    });
    return () => abonnement.remove();
  }, []);
}
