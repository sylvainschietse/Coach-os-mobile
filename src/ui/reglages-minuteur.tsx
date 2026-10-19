import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConfigMinuteur } from '@/domain/minuteur';

import { Texte } from './composants';
import { couleurs, espace, polices } from './theme';

const REGLAGES: { cle: keyof ConfigMinuteur; libelle: string; pas: number; min: number; unite: string }[] = [
  { cle: 'exercices', libelle: 'Exercices', pas: 1, min: 1, unite: '' },
  { cle: 'travailS', libelle: 'Travail', pas: 5, min: 5, unite: 's' },
  { cle: 'reposS', libelle: 'Repos', pas: 5, min: 0, unite: 's' },
  { cle: 'tours', libelle: 'Tours', pas: 1, min: 1, unite: '' },
  { cle: 'reposEntreToursS', libelle: 'Repos entre tours', pas: 15, min: 0, unite: 's' },
];

/** Les cinq réglages d'un chrono, utilisés par le client (minuteur) et par le coach (séance). */
export function ReglagesMinuteur({
  config,
  onChange,
  compact,
}: {
  config: ConfigMinuteur;
  onChange: (c: ConfigMinuteur) => void;
  compact?: boolean;
}) {
  return (
    <View>
      {REGLAGES.map((r) => (
        <View key={r.cle} style={[styles.reglage, compact && { paddingVertical: 0 }]}>
          <Texte style={{ flex: 1, fontSize: compact ? 14 : 16 }}>{r.libelle}</Texte>
          <Pas
            libelle="−"
            accessibilite={`${r.libelle} : moins`}
            compact={compact}
            onPress={() => onChange({ ...config, [r.cle]: Math.max(r.min, config[r.cle] - r.pas) })}
          />
          <Text style={[styles.valeur, compact && { fontSize: 15, width: 48 }]}>
            {config[r.cle]}
            {r.unite}
          </Text>
          <Pas
            libelle="+"
            accessibilite={`${r.libelle} : plus`}
            compact={compact}
            onPress={() => onChange({ ...config, [r.cle]: config[r.cle] + r.pas })}
          />
        </View>
      ))}
    </View>
  );
}

function Pas({ libelle, accessibilite, onPress, compact }: { libelle: string; accessibilite: string; onPress: () => void; compact?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pas, compact && { width: 34, height: 34 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilite}
    >
      <Text style={styles.pasTexte}>{libelle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reglage: { flexDirection: 'row', alignItems: 'center', gap: espace(3), paddingVertical: espace(1), minHeight: 40 },
  valeur: { width: 56, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte },
  pas: { width: 40, height: 40, borderRadius: 10, backgroundColor: couleurs.fond, alignItems: 'center', justifyContent: 'center' },
  pasTexte: { fontSize: 22, fontFamily: polices.texteGras, color: couleurs.texte },
});
