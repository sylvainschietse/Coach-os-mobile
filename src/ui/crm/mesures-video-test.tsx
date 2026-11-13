// Mesures d'angle en vidéo dans les tests Mobilité et Posture : le coach choisit la mesure, filme, touche les points.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MESURES_MOBILITE, MESURES_POSTURE, type MesureAngle } from '@/domain/mesure-angle';

import { Bouton } from '../composants';
import { MesureVideoModale } from '../mesure-video';
import { couleurs, espace, polices } from '../theme';
import { Choix, Libelle, Saisie } from './dossier';

export function MesuresVideoTest({
  test,
  libelle,
  mesures,
  onChange,
}: {
  test: 'mobilite' | 'posture';
  libelle: string;
  mesures: MesureAngle[];
  onChange: (m: MesureAngle[]) => void;
}) {
  const modeles = test === 'mobilite' ? MESURES_MOBILITE : MESURES_POSTURE;
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(modeles[0].libelle);
  const [nom, setNom] = useState(modeles[0].libelle);
  const modele = modeles.find((m) => m.libelle === choix) ?? modeles[0];
  return (
    <View style={{ gap: espace(2) }}>
      <Libelle>{`${libelle} — mesures vidéo`}</Libelle>
      {mesures.map((m, i) => (
        <View key={`${m.libelle}-${i}`} style={styles.ligne}>
          <Text style={styles.texte}>{`${m.libelle} : ${m.angle}°`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Retirer ${m.libelle}`} onPress={() => onChange(mesures.filter((_, j) => j !== i))} hitSlop={8}>
            <Text style={styles.retirer}>Retirer</Text>
          </Pressable>
        </View>
      ))}
      <View style={{ alignSelf: 'flex-start' }}>
        <Bouton variante="discret" libelle="📹 Mesurer un angle en vidéo" onPress={() => setOuvert(true)} />
      </View>
      {ouvert && (
        <MesureVideoModale
          titre={`${libelle} · mesure vidéo`}
          facon={modele}
          onFermer={() => setOuvert(false)}
          onValider={(angle) => {
            onChange([...mesures, { libelle: nom.trim() || modele.libelle, angle }]);
            setOuvert(false);
          }}
          avant={
            <>
              <Choix
                libelle="Mesure"
                choix={modeles.map((m) => m.libelle)}
                valeur={choix}
                vide={null}
                onChange={(v) => {
                  const c = v ?? modeles[0].libelle;
                  setChoix(c);
                  setNom(c === 'Autre mesure' ? '' : c);
                }}
              />
              <Saisie libelle="Nom de la mesure (ajoute le côté si besoin)" valeur={nom} onChange={setNom} placeholder="Ex. Cheville droite" />
            </>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ligne: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2), paddingVertical: 6, borderBottomWidth: 1, borderColor: couleurs.bordure },
  texte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte, flexShrink: 1 },
  retirer: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
});
