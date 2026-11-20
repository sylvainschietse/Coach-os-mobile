// Univers de la page affichée : l'espace client ou coach le fixe selon l'onglet, les composants communs le lisent
// (kicker, puces, boutons pleins, onglet actif). Par défaut, le rouge de la marque.
import { createContext, useContext, type ReactNode } from 'react';

import { univers, type CleUnivers, type Univers } from './theme';

const Contexte = createContext<Univers>(univers.rouge);

export function UniversPage({ cle, children }: { cle: CleUnivers; children: ReactNode }) {
  return <Contexte.Provider value={univers[cle]}>{children}</Contexte.Provider>;
}

export const useUnivers = () => useContext(Contexte);
