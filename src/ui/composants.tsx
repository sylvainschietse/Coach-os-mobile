import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { estMessageReseau } from '@/domain/reseau';
import { toutReessayer } from '@/lib/memoire';
import { usePression } from '@/lib/usePression';

import { DefilementClavier } from './clavier';
import { arrondi, couleurs, espace, espacementTitre, polices, titreSection } from './theme';
import { useUnivers } from './univers';
import { etatA11y } from '@/lib/accessibilite';

export function Ecran({ children, largeurMax = 640 }: { children: ReactNode; largeurMax?: number }) {
  return (
    <SafeAreaView style={styles.ecran} edges={['bottom', 'left', 'right']}>
      <DefilementClavier contentContainerStyle={styles.defilement}>
        <View style={{ width: '100%', maxWidth: largeurMax, alignSelf: 'center', gap: espace(4) }}>{children}</View>
      </DefilementClavier>
    </SafeAreaView>
  );
}

export function Titre({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.titre, style]}>{children}</Text>;
}

export function SousTitre({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={titreSection}>
      {children}
    </Text>
  );
}

export function Texte({ children, doux, style }: { children: ReactNode; doux?: boolean; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.texte, doux && { color: couleurs.texteDoux }, style]}>{children}</Text>;
}

export function Carte({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.carte, style]}>{children}</View>;
}

/** `contour` : bouton clair posé sur un fond coloré (minuteur). */
type Variante = 'primaire' | 'secondaire' | 'discret' | 'contour';

export function Bouton({
  libelle,
  onPress,
  variante = 'primaire',
  desactive,
  chargement,
}: {
  libelle: string;
  onPress: () => void;
  variante?: Variante;
  desactive?: boolean;
  chargement?: boolean;
}) {
  const u = useUnivers();
  const fond = variante === 'primaire' ? (u.cle === 'rouge' ? couleurs.rouge : u.uni) : variante === 'secondaire' ? couleurs.secondaire : variante === 'discret' ? couleurs.carte : 'transparent';
  const texte = variante === 'discret' ? couleurs.texte : '#FFFFFF';
  const bordure = variante === 'contour' ? '#FFFFFF' : couleurs.bordure;
  const { enCours, presser } = usePression(onPress);
  const attente = chargement || enCours;
  return (
    <Pressable
      accessibilityRole="button"
      {...etatA11y({ disabled: !!(desactive || attente), busy: attente })}
      onPress={presser}
      disabled={desactive || attente}
      style={({ pressed }) => [
        styles.bouton,
        { backgroundColor: fond, opacity: desactive ? 0.4 : pressed ? 0.7 : 1 },
        variante === 'primaire' && { backgroundImage: u.degrade },
        (variante === 'discret' || variante === 'contour') && { borderWidth: 1, borderColor: bordure },
      ]}
    >
      {attente ? <ActivityIndicator color={texte} /> : <Text style={[styles.boutonTexte, { color: texte }]}>{libelle}</Text>}
    </Pressable>
  );
}

export function Pastille({ libelle, couleur = couleurs.noir }: { libelle: string; couleur?: string }) {
  return (
    <View style={[styles.pastille, { backgroundColor: couleur }]}>
      <Text style={styles.pastilleTexte}>{libelle}</Text>
    </View>
  );
}

/** Champ chiffré : la suggestion s'affiche grisée en italique tant que le client n'a rien saisi. */
export function ChampNombre({
  libelle,
  valeur,
  suggestion,
  onChange,
  valide,
  afficherLibelle = true,
}: {
  afficherLibelle?: boolean;
  libelle: string;
  valeur: number | undefined;
  suggestion: number | undefined;
  onChange: (v: number | undefined) => void;
  valide: boolean;
}) {
  const vide = valeur === undefined;
  return (
    <View style={styles.champ}>
      {afficherLibelle && <Text style={styles.champLibelle}>{libelle}</Text>}
      <TextInput
        accessibilityLabel={libelle}
        inputMode="decimal"
        keyboardType="decimal-pad"
        value={vide ? '' : String(valeur)}
        placeholder={suggestion === undefined ? '–' : String(suggestion)}
        placeholderTextColor={couleurs.suggestion}
        onChangeText={(t) => {
          const propre = t.replace(',', '.').trim();
          onChange(propre === '' ? undefined : Number(propre));
        }}
        style={[
          styles.champSaisie,
          vide && styles.champSuggestion,
          valide && { borderColor: couleurs.vert, backgroundColor: couleurs.vertClair },
        ]}
      />
    </View>
  );
}

/** Champ texte avec libellé ; `erreur` s'affiche en rouge sous le champ. */
export function ChampTexte({
  libelle,
  valeur,
  onChange,
  placeholder,
  multiligne,
  erreur,
  type = 'texte',
  aide,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiligne?: boolean;
  erreur?: string;
  type?: 'texte' | 'telephone' | 'email' | 'nombre';
  aide?: string;
}) {
  return (
    <View style={{ gap: espace(1) }}>
      <Text style={styles.champLibelle}>{libelle}</Text>
      <TextInput
        accessibilityLabel={libelle}
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={couleurs.suggestion}
        multiline={multiligne}
        inputMode={type === 'telephone' ? 'tel' : type === 'email' ? 'email' : type === 'nombre' ? 'numeric' : 'text'}
        keyboardType={type === 'telephone' ? 'phone-pad' : type === 'email' ? 'email-address' : 'default'}
        autoCapitalize={type === 'email' ? 'none' : 'sentences'}
        autoCorrect={type === 'texte'}
        style={[
          styles.champSaisie,
          styles.champTexte,
          multiligne && { minHeight: 88, textAlignVertical: 'top' },
          erreur !== undefined && { borderColor: couleurs.rouge },
        ]}
      />
      {erreur ? <Text style={styles.champErreur}>{erreur}</Text> : aide ? <Text style={styles.champLibelle}>{aide}</Text> : null}
    </View>
  );
}

/** Choix parmi quelques options (statut, objectif, date rapide). */
export function Puce({ libelle, actif, onPress }: { libelle: string; actif?: boolean; onPress: () => void }) {
  const u = useUnivers();
  return (
    <Pressable
      accessibilityRole="button"
      {...etatA11y({ selected: !!actif })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.puce,
        actif && styles.puceActive,
        actif && u.cle !== 'rouge' && { backgroundColor: u.uni, borderColor: 'transparent', backgroundImage: u.degrade },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={[styles.puceTexte, actif && { color: '#FFFFFF' }]}>{libelle}</Text>
    </Pressable>
  );
}

export function Puces({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>{children}</View>;
}

/** Après ce délai sans réponse, la roue laisse place à « La connexion est lente » et à un bouton « Réessayer ». */
const ATTENTE_LENTE_MS = 10_000;

export function Chargement() {
  const [lent, setLent] = useState(false);
  useEffect(() => {
    const minuterie = setTimeout(() => setLent(true), ATTENTE_LENTE_MS);
    return () => clearTimeout(minuterie);
  }, []);
  return (
    <View style={{ padding: espace(10), alignItems: 'center', gap: espace(3) }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={couleurs.rouge} accessibilityLabel="Chargement" />
      {lent && (
        <>
          <Texte doux style={{ textAlign: 'center' }}>
            La connexion est lente. Tu peux attendre encore un peu ou réessayer.
          </Texte>
          <Bouton libelle="Réessayer" variante="secondaire" onPress={toutReessayer} />
        </>
      )}
    </View>
  );
}

/**
 * Message d'erreur ; avec `onReessayer`, un chargement raté se distingue d'une liste vide et se relance.
 * Une coupure réseau propose toujours « Réessayer », qui relance tous les chargements de l'écran.
 */
export function Erreur({ message, onReessayer }: { message: string; onReessayer?: () => void }) {
  const reessayer = onReessayer ?? (estMessageReseau(message) ? toutReessayer : undefined);
  return (
    <Carte style={{ borderColor: couleurs.rouge }}>
      <Texte>{message}</Texte>
      {reessayer && <Bouton libelle="Réessayer" variante="secondaire" onPress={reessayer} />}
    </Carte>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  defilement: { padding: espace(4), paddingBottom: espace(12) },
  titre: { fontFamily: polices.titre, fontSize: 40, lineHeight: 42, color: couleurs.texte, letterSpacing: espacementTitre(40) },
  texte: { fontFamily: polices.texte, fontSize: 16, lineHeight: 22, color: couleurs.texte },
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: arrondi.carte,
    boxShadow: '0 4px 18px rgba(20, 22, 34, 0.016)',
    padding: espace(4),
    borderWidth: 1,
    borderColor: couleurs.bordure,
    gap: espace(2),
  },
  bouton: { minHeight: 44, borderRadius: arrondi.controle, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espace(5) },
  boutonTexte: { fontFamily: polices.texteMoyen, fontSize: 15 },
  pastille: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: espace(2.5), paddingVertical: espace(0.5) },
  pastilleTexte: { color: '#FFFFFF', fontFamily: polices.texteMoyen, fontSize: 12 },
  champ: { flex: 1, minWidth: 72, gap: espace(1) },
  champLibelle: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  champSaisie: {
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: arrondi.controle,
    minHeight: 44,
    paddingHorizontal: espace(3),
    paddingVertical: espace(2.5),
    fontFamily: polices.texteMoyen,
    fontSize: 18,
    color: couleurs.texte,
    backgroundColor: '#FFFFFF',
  },
  champSuggestion: { fontStyle: 'italic' },
  champTexte: { fontSize: 16, fontFamily: polices.texte },
  champErreur: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge },
  puce: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: espace(3.5),
    paddingVertical: espace(2),
    minHeight: 44,
    justifyContent: 'center',
  },
  puceActive: { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
  puceTexte: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
});
