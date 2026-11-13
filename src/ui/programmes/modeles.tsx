import { router, useFocusEffect } from 'expo-router';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, SousTitre, Texte } from '../composants';
import { espace } from '../theme';

/** Les programmes modèles du coach, à attribuer à ses clients. */
export function Modeles({ coachId }: { coachId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.modeles(coachId), coachId);
  useFocusEffect(recharger);
  return (
    <View style={{ gap: espace(3) }}>
      <Bouton libelle="Nouveau programme" onPress={() => router.push({ pathname: '/coach/modele/[id]', params: { id: 'nouveau' } })} />
      {erreur && <Erreur message={erreur} onReessayer={recharger} />}
      {!donnee && !erreur && <Chargement />}
      {donnee?.length === 0 && (
        <Texte doux>Crée un programme une fois (ses séances, ses exercices), puis attribue-le à autant de clients que tu veux.</Texte>
      )}
      {donnee?.map((p) => (
        <Pressable key={p.id} onPress={() => router.push({ pathname: '/coach/modele/[id]', params: { id: p.id } })}>
          <Carte>
            <SousTitre>{p.titre}</SousTitre>
            <Texte doux style={{ fontSize: 14 }}>
              {[
                `${p.seances.length} séance${p.seances.length > 1 ? 's' : ''}`,
                p.dureeSemaines ? `${p.dureeSemaines} semaines` : undefined,
                p.seancesParSemaine ? `${p.seancesParSemaine} par semaine` : undefined,
                p.niveau,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Texte>
            {p.objectif && <Texte style={{ fontSize: 14 }}>{p.objectif}</Texte>}
          </Carte>
        </Pressable>
      ))}
    </View>
  );
}
