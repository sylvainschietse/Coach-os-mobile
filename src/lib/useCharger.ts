import { useCallback, useEffect, useRef, useState } from 'react';

import { messageReseau } from '@/domain/reseau';

import { ecouterReessai, ecrireMemoire, lireMemoire, lireTelephone } from './memoire';

/** Message lisible : une coupure réseau ne doit pas s'afficher comme « TypeError: Failed to fetch ». */
export function messageErreur(e: unknown) {
  const reseau = messageReseau(e);
  if (reseau) return reseau;
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return m || 'Erreur inconnue';
}

export interface OptionsCharger {
  /**
   * Garder aussi la donnée sur le téléphone, pour l'afficher sans réseau (la séance du jour en salle).
   * Réservé aux données utiles hors ligne : le reste ne vit qu'en mémoire.
   */
  surLeTelephone?: boolean;
}

interface Etat<T> {
  cle: string;
  donnee: T | null;
  erreur: string | null;
}

/**
 * Charge une donnée asynchrone ; elle se recharge quand `cle` change ou sur demande.
 * Un écran déjà vu s'affiche tout de suite avec sa dernière version, puis se met à jour en silence.
 */
export function useCharger<T>(charger: () => Promise<T>, cle: string, options?: OptionsCharger) {
  const surLeTelephone = options?.surLeTelephone ?? false;
  const [etat, setEtat] = useState<Etat<T>>(() => ({ cle, donnee: lireMemoire<T>(cle) ?? null, erreur: null }));
  const [version, setVersion] = useState(0);
  const chargerRef = useRef(charger);
  const etatRef = useRef(etat);

  // Changement de clé (autre jour, autre client) : sa dernière version connue s'affiche tout de suite.
  if (etat.cle !== cle) {
    const enMemoire = lireMemoire<T>(cle);
    if (enMemoire !== undefined) setEtat({ cle, donnee: enMemoire, erreur: null });
  }

  useEffect(() => {
    chargerRef.current = charger;
    etatRef.current = etat;
  });

  useEffect(() => {
    let annule = false;
    if (lireMemoire<T>(cle) === undefined && surLeTelephone) {
      lireTelephone<T>(cle).then((garde) => {
        // Seulement si le serveur n'a pas déjà répondu : la donnée fraîche passe toujours avant.
        if (!annule && garde !== undefined) setEtat((avant) => (avant.cle !== cle || avant.donnee === null ? { cle, donnee: garde, erreur: avant.erreur } : avant));
      });
    }
    chargerRef.current().then(
      (donnee) => {
        if (annule) return;
        ecrireMemoire(cle, donnee, surLeTelephone);
        setEtat({ cle, donnee, erreur: null });
      },
      (e: unknown) => !annule && setEtat((avant) => ({ ...avant, erreur: messageErreur(e) })),
    );
    return () => {
      annule = true;
    };
  }, [cle, version, surLeTelephone]);

  // « Réessayer » (après une coupure ou un chargement trop long) relance ce qui a échoué ou attend encore.
  useEffect(
    () =>
      ecouterReessai(() => {
        const a = etatRef.current;
        if (a.erreur || a.donnee === null) setVersion((v) => v + 1);
      }),
    [],
  );

  const recharger = useCallback(() => setVersion((v) => v + 1), []);
  return { donnee: etat.donnee, erreur: etat.erreur, recharger };
}

/** Recharge quand l'écran revient au premier plan et quand une autre partie de l'écran signale un changement. */
export function useRechargerSur(recharger: () => void, ecouter: (fn: () => void) => () => void) {
  useEffect(() => ecouter(recharger), [recharger, ecouter]);
}
