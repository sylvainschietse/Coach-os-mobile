// Bulles d'astuce déjà fermées sur ce téléphone. Gardées à part de la mémoire des écrans : une déconnexion ne les
// fait pas revenir.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { CleAstuce } from '@/domain/tutos';

const CLE = 'coachos.astuces-vues';
let vues: Set<string> | null = null;
let lecture: Promise<Set<string>> | null = null;
const abonnes = new Set<() => void>();

function charger(): Promise<Set<string>> {
  if (vues) return Promise.resolve(vues);
  lecture ??= AsyncStorage.getItem(CLE)
    .then((t) => new Set<string>(t ? (JSON.parse(t) as string[]) : []))
    .catch(() => new Set<string>())
    .then((s) => (vues = s));
  return lecture;
}

export async function marquerAstuceVue(cle: CleAstuce) {
  const s = await charger();
  if (s.has(cle)) return;
  s.add(cle);
  AsyncStorage.setItem(CLE, JSON.stringify([...s])).catch(() => undefined);
  abonnes.forEach((f) => f());
}

const aMontrer = (s: Set<string>, cle: CleAstuce, apres?: CleAstuce) => !s.has(cle) && (!apres || s.has(apres));

/**
 * Vrai tant que la bulle n'a pas été fermée sur ce téléphone (faux le temps de la lecture, pour ne pas clignoter).
 * `apres` : une autre bulle du même écran, qui doit être fermée d'abord (une seule bulle à la fois).
 */
export function useAstuce(cle: CleAstuce, active = true, apres?: CleAstuce) {
  const [visible, setVisible] = useState(() => !!vues && aMontrer(vues, cle, apres));
  useEffect(() => {
    if (!active) return;
    let annule = false;
    const maj = () => charger().then((s) => !annule && setVisible(aMontrer(s, cle, apres)));
    maj();
    abonnes.add(maj);
    return () => {
      annule = true;
      abonnes.delete(maj);
    };
  }, [cle, active, apres]);
  return { visible: active && visible, fermer: () => marquerAstuceVue(cle) };
}
