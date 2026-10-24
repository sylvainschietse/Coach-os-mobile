// Briques communes des écrans d'entraînement, reprises de shadcn tel que l'app d'origine les utilisait :
// boutons (plein, contour, fantôme, destructif), LongText, confirmation (AlertDialog), liste de choix et message
// d'état (à la place des toasts : un résultat reste lisible tant qu'on ne fait pas autre chose).
import { Check, type LucideIcon } from 'lucide-react-native';
import { useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { arrondi, couleurs, espace, polices } from '../theme';

const survol = (e: PressableStateCallbackType) => !!(e as { hovered?: boolean }).hovered;

type VarianteAction = 'plein' | 'contour' | 'fantome' | 'danger';

export function Action({
  libelle,
  onPress,
  variante = 'plein',
  icone: Icone,
  desactive,
  chargement,
  petit,
  nom,
}: {
  libelle?: string;
  onPress: () => void;
  variante?: VarianteAction;
  icone?: LucideIcon;
  desactive?: boolean;
  chargement?: boolean;
  petit?: boolean;
  /** Libellé lu par les lecteurs d'écran pour un bouton icône. */
  nom?: string;
}) {
  const fond = variante === 'plein' ? couleurs.rouge : variante === 'danger' ? '#DC2626' : variante === 'contour' ? couleurs.carte : 'transparent';
  const texte = variante === 'plein' || variante === 'danger' ? '#FFFFFF' : couleurs.texte;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nom ?? libelle}
      accessibilityState={{ disabled: !!(desactive || chargement) }}
      disabled={desactive || chargement}
      onPress={onPress}
      style={(e) => [
        styles.action,
        petit && styles.actionPetite,
        !libelle && { width: petit ? 36 : 44, paddingHorizontal: 0 },
        { backgroundColor: fond },
        variante === 'contour' && { borderWidth: 1, borderColor: couleurs.saisie },
        (survol(e) || e.pressed) && variante !== 'plein' && variante !== 'danger' && { backgroundColor: couleurs.discret },
        { opacity: desactive ? 0.45 : e.pressed ? 0.85 : 1 },
      ]}
    >
      {chargement ? <ActivityIndicator size="small" color={texte} /> : Icone && <Icone size={petit ? 14 : 16} color={texte} />}
      {libelle && <Text style={[styles.actionTexte, petit && { fontSize: 13 }, { color: texte }]}>{libelle}</Text>}
    </Pressable>
  );
}

export function Ligne({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2), alignItems: 'center' }, style]}>{children}</View>;
}

/** LongText d'origine : texte libre, replié au-delà de quelques lignes. */
export function TexteLong({ texte, libelle, style }: { texte?: string; libelle?: string; style?: StyleProp<TextStyle> }) {
  const [ouvert, setOuvert] = useState(false);
  if (!texte?.trim()) return null;
  const long = texte.length > 320 || texte.split('\n').length > 5;
  return (
    <View style={{ gap: 4 }}>
      {libelle && <Text style={styles.libelleLong}>{libelle}</Text>}
      <Text selectable numberOfLines={long && !ouvert ? 4 : undefined} style={[styles.texte, style]}>
        {texte.trim()}
      </Text>
      {long && (
        <Text accessibilityRole="button" onPress={() => setOuvert(!ouvert)} style={styles.lien}>
          {ouvert ? 'Voir moins' : 'Voir plus'}
        </Text>
      )}
    </View>
  );
}

export function Puce({ libelle, variante = 'contour' }: { libelle: string; variante?: 'contour' | 'secondaire' | 'accent' | 'primaire' }) {
  return (
    <View
      style={[
        styles.puce,
        variante === 'secondaire' && { backgroundColor: couleurs.discret, borderColor: 'transparent' },
        variante === 'accent' && { backgroundColor: couleurs.rougeClair, borderColor: 'transparent' },
        variante === 'primaire' && { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
      ]}
    >
      <Text style={[styles.puceTexte, variante === 'accent' && { color: couleurs.rougeTexte }, variante === 'primaire' && { color: '#FFFFFF' }]}>{libelle}</Text>
    </View>
  );
}

/** AlertDialog : titre, explication, Annuler et l'action ; l'erreur reste affichée dans la boîte. */
export function Confirmation({
  titre,
  texte,
  action,
  danger,
  onConfirmer,
  onFermer,
  children,
}: {
  titre: string;
  texte?: string;
  action: string;
  danger?: boolean;
  onConfirmer: () => Promise<void> | void;
  onFermer: () => void;
  children?: ReactNode;
}) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const verrou = useRef(false);
  const confirmer = async () => {
    if (verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    setErreur(undefined);
    try {
      await onConfirmer();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {
        if (!occupe) onFermer();
      }}>
      <View style={styles.voile}>
        <View accessibilityRole={'alertdialog' as never} accessibilityLabel={titre} style={styles.boite}>
          <Text style={styles.titre}>{titre}</Text>
          {texte && <Text style={styles.texteDoux}>{texte}</Text>}
          {children}
          {erreur && (
            <Text accessibilityRole="alert" style={styles.erreur}>
              {erreur}
            </Text>
          )}
          <Ligne style={{ justifyContent: 'flex-end' }}>
            <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
            <Action libelle={action} variante={danger ? 'danger' : 'plein'} chargement={occupe} onPress={confirmer} />
          </Ligne>
        </View>
      </View>
    </Modal>
  );
}

/** Liste défilante d'options (role listbox), une seule choisie. */
export function ListeChoix<T>({
  elements,
  cle,
  libelle,
  detail,
  choisi,
  onChoisir,
  vide,
  hauteur = 224,
}: {
  elements: T[] | null;
  cle: (x: T) => string;
  libelle: (x: T) => string;
  detail?: (x: T) => string | undefined;
  choisi?: string;
  onChoisir: (x: T) => void;
  vide?: string;
  hauteur?: number;
}) {
  return (
    <View accessibilityRole={'listbox' as never} style={[styles.liste, { maxHeight: hauteur }]}>
      <View style={{ overflow: 'scroll' as never, maxHeight: hauteur }}>
        {!elements && (
          <View style={{ padding: 12, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={couleurs.texteDoux} />
            <Text style={styles.texteDoux}>Chargement…</Text>
          </View>
        )}
        {elements?.length === 0 && <Text style={[styles.texteDoux, { padding: 12 }]}>{vide ?? 'Aucun résultat.'}</Text>}
        {elements?.map((x) => {
          const actif = cle(x) === choisi;
          const d = detail?.(x);
          return (
            <Pressable
              key={cle(x)}
              accessibilityRole={'option' as never}
              accessibilityState={{ selected: actif }}
              onPress={() => onChoisir(x)}
              style={(e) => [styles.option, survol(e) && { backgroundColor: couleurs.discret }, actif && { backgroundColor: couleurs.rougeClair }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.optionTexte, actif && { fontFamily: polices.texteMoyen, color: couleurs.rougeTexte }]}>{libelle(x)}</Text>
                {d ? <Text style={styles.optionDetail}>{d}</Text> : null}
              </View>
              {actif && <Check size={16} color={couleurs.rougeTexte} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Message d'état après une action (à la place du toast d'origine). */
export function Etat({ message, erreur }: { message?: string; erreur?: string }) {
  if (erreur)
    return (
      <Text accessibilityRole="alert" style={styles.erreur}>
        {erreur}
      </Text>
    );
  if (message)
    return (
      <Text accessibilityRole={'status' as never} aria-live="polite" style={styles.ok}>
        {message}
      </Text>
    );
  return null;
}

export const ts = StyleSheet.create({
  carte: { backgroundColor: couleurs.carte, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 14, padding: 20, gap: 12 },
  titreSection: { fontFamily: polices.texteGras, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: couleurs.texteDoux },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  texte: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texte },
  doux: { fontFamily: polices.texte, fontSize: 12, lineHeight: 17, color: couleurs.texteDoux },
  mono: { fontFamily: polices.chiffres, fontSize: 12, color: couleurs.texteDoux },
  kicker: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: couleurs.rouge },
  pastilleJour: { width: 40, height: 40, borderRadius: 8, backgroundColor: couleurs.secondaire, alignItems: 'center', justifyContent: 'center' },
  pastilleJourTexte: { fontFamily: polices.texteGras, fontSize: 12, color: '#FFFFFF' },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
});

const styles = StyleSheet.create({
  action: {
    minHeight: 44,
    borderRadius: arrondi.controle,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionPetite: { minHeight: 36, paddingHorizontal: 12, borderRadius: 9 },
  actionTexte: { fontFamily: polices.texteMoyen, fontSize: 14 },
  texte: { fontFamily: polices.texte, fontSize: 14, lineHeight: 21, color: couleurs.texte },
  texteDoux: { fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: couleurs.texteDoux },
  libelleLong: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  lien: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge },
  puce: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2, alignSelf: 'flex-start' },
  puceTexte: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.texte },
  voile: { flex: 1, backgroundColor: 'rgba(17,18,22,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  boite: { width: '100%', maxWidth: 512, backgroundColor: couleurs.carte, borderRadius: arrondi.carte, padding: 24, gap: 14 },
  titre: { fontFamily: polices.texteGras, fontSize: 18, lineHeight: 24, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  ok: { fontFamily: polices.texte, fontSize: 13, color: couleurs.vert },
  liste: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, minHeight: 44 },
  optionTexte: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  optionDetail: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
});
