import { View } from 'react-native';

import { alimentation } from '@/data/alimentation';
import { REGIMES } from '@/domain/alimentation';
import { formaterNombre } from '@/domain/suivi';
import type { Aliment, Macros, Regime } from '@/domain/types';

import { Texte } from '../composants';
import { couleurs, espace } from '../theme';

// La liste des aliments ne change qu'à l'ajout d'un aliment : on la garde en mémoire pour tous les écrans.
let cache: Promise<Aliment[]> | undefined;
export const chargerAliments = () => (cache ??= alimentation.aliments().catch((e) => ((cache = undefined), Promise.reject(e))));
export const oublierAliments = () => (cache = undefined);

export const libelleRegime = (r: Regime) => REGIMES.find((g) => g.cle === r)?.libelle ?? r;

const ent = (n: number) => formaterNombre(Math.round(n));

/** « 520 kcal · P 32 g · G 60 g · L 14 g » */
export function LigneMacros({ m, taille = 14 }: { m: Macros; taille?: number }) {
  return (
    <Texte doux style={{ fontSize: taille }}>
      {ent(m.kcal)} kcal · P {ent(m.proteines)} g · G {ent(m.glucides)} g · L {ent(m.lipides)} g
    </Texte>
  );
}

/** Une jauge par macro : ce qui est mangé face à l'objectif du jour. */
export function Jauges({ mange, objectif }: { mange: Macros; objectif: Macros }) {
  const lignes: { libelle: string; cle: keyof Macros; unite: string }[] = [
    { libelle: 'Calories', cle: 'kcal', unite: 'kcal' },
    { libelle: 'Protéines', cle: 'proteines', unite: 'g' },
    { libelle: 'Glucides', cle: 'glucides', unite: 'g' },
    { libelle: 'Lipides', cle: 'lipides', unite: 'g' },
  ];
  return (
    <View style={{ gap: espace(2.5) }}>
      {lignes.map((l) => {
        const cible = objectif[l.cle];
        const fait = mange[l.cle];
        const part = cible > 0 ? Math.min(fait / cible, 1) : 0;
        const depasse = cible > 0 && fait > cible * 1.05;
        return (
          <View key={l.cle} style={{ gap: espace(1) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Texte style={{ fontSize: 14 }}>{l.libelle}</Texte>
              <Texte doux style={{ fontSize: 14 }}>
                {ent(fait)} / {ent(cible)} {l.unite}
                {cible > 0 ? (fait < cible ? ` · reste ${ent(cible - fait)}` : depasse ? ` · +${ent(fait - cible)}` : '') : ''}
              </Texte>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: couleurs.bordure, overflow: 'hidden' }}>
              <View style={{ width: `${part * 100}%`, height: 8, backgroundColor: depasse ? couleurs.orange : l.cle === 'kcal' ? couleurs.rouge : couleurs.noir }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}
