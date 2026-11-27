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

/** Vrai tant que la bulle n'a pas été fermée sur ce téléphone (faux le temps de la lecture, pour ne pas clignoter). */
export function useAstuce(cle: CleAstuce, active = true) {
  const [visible, setVisible] = useState(() => !!vues && !vues.has(cle));
  useEffect(() => {
    if (!active) return;
    let annule = false;
    const maj = () => charger().then((s) => !annule && setVisible(!s.has(cle)));
    maj();
    abonnes.add(maj);
    return () => {
      annule = true;
      abonnes.delete(maj);
    };
  }, [cle, active]);
  return { visible: active && visible, fermer: () => marquerAstuceVue(cle) };
}
