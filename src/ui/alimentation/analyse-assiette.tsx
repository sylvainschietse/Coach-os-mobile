// Photo d'assiette côté coach : ce que l'assiette contient, la part de chaque aliment et les macros, sans rien
// enregistrer dans un journal. L'estimation vient de la même analyse que le journal des clients.
import { useState } from 'react';
import { View } from 'react-native';

import { additionner, macrosPour } from '@/domain/alimentation';
import type { Ingredient } from '@/domain/types';

import { Carte, SousTitre, Texte } from '../composants';
import { BoutonContour } from '../coque';
import { couleurs, espace } from '../theme';
import { LigneMacros } from './commun';
import { PhotoRepas } from './photo';

type Aliment = Omit<Ingredient, 'contient'>;
const pourcent = (x: number, total: number) => (total > 0 ? Math.round((x / total) * 100) : 0);

export function AnalyseAssiette() {
  const [aliments, setAliments] = useState<Aliment[]>();
  const [cle, setCle] = useState(0);

  if (!aliments)
    return (
      <Carte>
        <SousTitre>Photo d’assiette</SousTitre>
        <PhotoRepas key={cle} libelleValider="Voir le détail" onValider={setAliments} onFermer={() => setCle(cle + 1)} />
      </Carte>
    );

  const poids = aliments.reduce((n, a) => n + a.quantiteG, 0);
  const total = additionner(aliments.map((a) => macrosPour(a, a.quantiteG)));
  // Part des calories apportée par chaque macro : 4 kcal par gramme de protéines et de glucides, 9 par gramme de lipides.
  const kcalMacros = total.proteines * 4 + total.glucides * 4 + total.lipides * 9;
  return (
    <Carte>
      <SousTitre>Ce que contient l’assiette</SousTitre>
      <Texte doux style={{ fontSize: 13 }}>Estimation à partir de la photo, corrigée par vous. Rien n’est enregistré.</Texte>
      <View style={{ gap: espace(2) }}>
        {[...aliments]
          .sort((a, b) => b.quantiteG - a.quantiteG)
          .map((a, i) => {
            const m = macrosPour(a, a.quantiteG);
            return (
              <View key={i} style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: 2 }}>
                <Texte style={{ fontSize: 15 }}>
                  {a.nom} · {Math.round(a.quantiteG)} g <Texte doux style={{ fontSize: 13 }}>({pourcent(a.quantiteG, poids)} % de l’assiette)</Texte>
                </Texte>
                <LigneMacros m={m} taille={13} />
              </View>
            );
          })}
      </View>
      <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: 4 }}>
        <Texte style={{ fontSize: 15 }}>Total · {Math.round(poids)} g</Texte>
        <LigneMacros m={total} />
        {kcalMacros > 0 && (
          <Texte doux style={{ fontSize: 14 }}>
            Calories venant des protéines {pourcent(total.proteines * 4, kcalMacros)} %, des glucides {pourcent(total.glucides * 4, kcalMacros)} %, des lipides{' '}
            {pourcent(total.lipides * 9, kcalMacros)} %.
          </Texte>
        )}
      </View>
      <BoutonContour
        libelle="Nouvelle photo"
        onPress={() => {
          setAliments(undefined);
          setCle(cle + 1);
        }}
      />
    </Carte>
  );
}
