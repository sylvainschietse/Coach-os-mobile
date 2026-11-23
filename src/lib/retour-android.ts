import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

import type { Modification, ParamsEcran } from '@/domain/retour-coach';

/**
 * Bouton Retour d'Android sur un écran qui navigue en changeant ses paramètres (onglets, rubriques, dossier ouvert) :
 * router.setParams ne garde pas d'historique, donc Retour quittait l'app. Retour mène maintenant à l'écran parent
 * dans l'arborescence de l'appli (fenêtre, puis liste, puis onglet, puis accueil), et non plus au dernier écran ouvert.
 * À l'accueil, il laisse faire le téléphone (quitter l'app).
 */
export function useRetourAndroid(params: ParamsEcran, parent: (p: ParamsEcran) => Modification | null) {
  const courant = useRef({ params, parent });
  useEffect(() => {
    courant.current = { params, parent };
  });
  // Un écran ouvert par-dessus (suivi d'un client, séance…) garde la main : son Retour le ferme.
  const auPremierPlan = useIsFocused();

  useEffect(() => {
    if (Platform.OS !== 'android' || !auPremierPlan) return;
    const abonnement = BackHandler.addEventListener('hardwareBackPress', () => {
      const modif = courant.current.parent(courant.current.params);
      if (!modif) return false;
      router.setParams(modif);
      return true;
    });
    return () => abonnement.remove();
  }, [auPremierPlan]);
}
