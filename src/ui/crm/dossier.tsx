// Éléments communs des dossiers CRM repris de CRMWorkspace.tsx d'origine : modale `max-w-3xl` à pied collant,
// grille de champs deux colonnes (`sm:grid-cols-2`, champs longs pleine largeur), `<select>` avec « Non renseigné »,
// cases à cocher, badges, initiales (`premium-avatar`) et volet repliable (`<details>`).
import { Check, ChevronDown, ChevronRight, Search, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Selecteur } from '../coque';
import { Bouton } from '../composants';
import { arrondi, couleurs, espace, polices } from '../theme';

/** Largeur `sm` de Tailwind : en dessous, une seule colonne. */
const SM = 640;

export function Modale({
  titre,
  onFermer,
  enTete,
  children,
  pied,
  largeur,
}: {
  /** `max-w-3xl` par défaut ; l'étape 2 de la création de séance passe en `max-w-4xl`. */
  largeur?: number;
  titre: string;
  /** Croix et touche Retour : passent par la même garde que le bouton Fermer. */
  onFermer: () => void;
  enTete?: ReactNode;
  children: ReactNode;
  pied?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const etroit = width < SM;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <View
        style={[
          styles.voile,
          {
            paddingTop: insets.top + (etroit ? 8 : 24),
            paddingBottom: insets.bottom + (etroit ? 8 : 24),
          },
        ]}
      >
        <View accessibilityRole={'dialog' as never} accessibilityLabel={titre} style={[styles.boite, largeur ? { maxWidth: largeur } : null, etroit && { borderRadius: arrondi.global }]}>
          <View style={styles.titreLigne}>
            <Text style={styles.titre} numberOfLines={2}>
              {titre}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onFermer} style={styles.croix}>
              <X size={18} color={couleurs.texteDoux} />
            </Pressable>
          </View>
          <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={styles.corps} keyboardShouldPersistTaps="handled">
            {enTete}
            {children}
          </ScrollView>
          {pied && <View style={styles.pied}>{pied}</View>}
        </View>
      </View>
    </Modal>
  );
}

/**
 * Bloc du nom dans l'en-tête des cartes de liste (nom à gauche, badges et boutons à droite). Sur téléphone, Android
 * écrasait ce bloc dans une colonne d'une lettre : sous 640 px, il prend toute la ligne et les badges passent dessous.
 */
export function useBlocNomCarte(): ViewStyle | null {
  const { width } = useWindowDimensions();
  return width < SM ? { flexBasis: '100%' } : null;
}

/**
 * Pied d'éditeur d'origine : « Modifications à enregistrer » / « Dossier à jour », Fermer, Enregistrer.
 * Quitter avec des modifications demande confirmation au lieu de les perdre.
 */
export function PiedEditeur({
  modifie,
  enregistrement,
  peutEnregistrer,
  onEnregistrer,
  onFermer,
  sortieDemandee,
  onRester,
  gauche,
}: {
  modifie: boolean;
  enregistrement: boolean;
  peutEnregistrer: boolean;
  onEnregistrer: () => void;
  onFermer: () => void;
  sortieDemandee: boolean;
  onRester: () => void;
  gauche?: ReactNode;
}) {
  if (sortieDemandee)
    return (
      <View style={{ gap: espace(3) }}>
        <Text style={styles.etat}>Des modifications ne sont pas enregistrées. Les abandonner ?</Text>
        <View style={styles.boutons}>
          <BoutonPied libelle="Rester" onPress={onRester} />
          <BoutonPied libelle="Quitter sans enregistrer" onPress={onFermer} danger />
        </View>
      </View>
    );
  return (
    <View style={styles.piedLigne}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: espace(3),
          flexShrink: 1,
        }}
      >
        {gauche}
        <Text style={styles.etat}>{modifie ? 'Modifications à enregistrer' : 'Dossier à jour'}</Text>
      </View>
      <View style={styles.boutons}>
        <BoutonPied libelle="Fermer" onPress={onFermer} />
        <View style={{ minWidth: 132 }}>
          <Bouton libelle="Enregistrer" onPress={onEnregistrer} chargement={enregistrement} desactive={!peutEnregistrer} />
        </View>
      </View>
    </View>
  );
}

export function BoutonPied({ libelle, onPress, danger, desactive }: { libelle: string; onPress: () => void; danger?: boolean; desactive?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.boutonPied,
        danger && { borderColor: 'transparent' },
        (pressed || desactive) && { opacity: desactive ? 0.4 : 0.8 },
      ]}
    >
      <Text style={[styles.boutonPiedTexte, danger && { color: couleurs.rouge }]}>{libelle}</Text>
    </Pressable>
  );
}

/** `grid gap-5 sm:grid-cols-2`. */
export function Grille({ children }: { children: ReactNode }) {
  return <View style={styles.grille}>{children}</View>;
}

export function Cellule({ pleine, children }: { pleine?: boolean; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const deux = width >= SM && !pleine;
  return <View style={{ flexBasis: deux ? '46%' : '100%', flexGrow: 1, minWidth: 0 }}>{children}</View>;
}

export function Libelle({ children }: { children: string }) {
  return <Text style={styles.libelle}>{children}</Text>;
}

/** `<select>` d'origine : « Non renseigné » en premier, et une valeur hors liste reste affichée telle quelle. */
export function Choix({
  libelle,
  choix,
  valeur,
  onChange,
  vide = 'Non renseigné',
  sansLibelle,
}: {
  libelle: string;
  choix: readonly string[];
  valeur: string | undefined;
  onChange: (v: string | undefined) => void;
  vide?: string | null;
  sansLibelle?: boolean;
}) {
  const liste = [...choix, ...(valeur && !choix.includes(valeur) ? [valeur] : [])];
  const options = [...(vide === null ? [] : [{ cle: '', libelle: vide }]), ...liste.map((c) => ({ cle: c, libelle: c }))];
  return (
    <View style={{ gap: espace(2) }}>
      {!sansLibelle && <Libelle>{libelle}</Libelle>}
      <Selecteur libelle={libelle} sansLibelle options={options} valeur={valeur ?? ''} onChange={(v) => onChange(v || undefined)} />
    </View>
  );
}

/** Sélection multiple d'origine : boutons arrondis, remplis quand choisis. */
export function ChoixMultiple({
  libelle,
  choix,
  valeurs,
  onChange,
}: {
  libelle: string;
  choix: readonly string[];
  valeurs: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <View style={{ gap: espace(2) }}>
      <Libelle>{libelle}</Libelle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
        {choix.map((c) => {
          const actif = valeurs.includes(c);
          return (
            <Pressable
              key={c}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: actif }}
              onPress={() => onChange(actif ? valeurs.filter((x) => x !== c) : choix.filter((x) => x === c || valeurs.includes(x)))}
              style={[
                styles.multi,
                actif && {
                  backgroundColor: couleurs.rouge,
                  borderColor: couleurs.rouge,
                },
              ]}
            >
              <Text style={[styles.multiTexte, actif && { color: '#FFFFFF' }]}>{c}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CaseACocher({
  libelle,
  valeur,
  onChange,
  petite,
}: {
  libelle: string;
  valeur: boolean;
  onChange: (v: boolean) => void;
  petite?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: valeur }}
      onPress={() => onChange(!valeur)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: espace(2),
        minHeight: 44,
        alignSelf: 'flex-start',
      }}
    >
      <View
        style={[
          styles.case,
          valeur && {
            backgroundColor: couleurs.rouge,
            borderColor: couleurs.rouge,
          },
        ]}
      >
        {valeur && <Check size={12} color="#FFFFFF" />}
      </View>
      <Text style={[styles.caseTexte, petite && { fontSize: 12, color: couleurs.texteDoux }]}>{libelle}</Text>
    </Pressable>
  );
}

/** Champ texte de l'éditeur : bordure `saisie`, 44px, zone de 4 lignes pour les champs longs. */
export function Saisie({
  libelle,
  valeur,
  onChange,
  long,
  placeholder,
  type,
  erreur,
  aide,
  max,
  desactive,
}: {
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  long?: boolean;
  placeholder?: string;
  type?: 'email' | 'telephone' | 'nombre';
  erreur?: string;
  aide?: string;
  /** maxLength d'origine. */
  max?: number;
  desactive?: boolean;
}) {
  return (
    <View style={{ gap: espace(2) }}>
      <Libelle>{libelle}</Libelle>
      <TextInput
        accessibilityLabel={libelle}
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={couleurs.suggestion}
        multiline={long}
        maxLength={max}
        editable={!desactive}
        inputMode={type === 'telephone' ? 'tel' : type === 'email' ? 'email' : type === 'nombre' ? 'decimal' : 'text'}
        keyboardType={type === 'telephone' ? 'phone-pad' : type === 'email' ? 'email-address' : type === 'nombre' ? 'decimal-pad' : 'default'}
        autoCapitalize={type === 'email' ? 'none' : 'sentences'}
        style={[styles.saisie, long && { minHeight: 104, textAlignVertical: 'top' }, !!erreur && { borderColor: couleurs.rouge }, desactive && { opacity: 0.6 }]}
      />
      {erreur ? <Text style={styles.erreur}>{erreur}</Text> : aide ? <Text style={styles.aide}>{aide}</Text> : null}
    </View>
  );
}

/** Badge shadcn : `outline` (statut), `secondary` (archivage, résultat commercial). */
export function Badge({ libelle, variante = 'contour' }: { libelle: string; variante?: 'contour' | 'secondaire' | 'primaire' }) {
  return (
    <View
      style={[
        styles.badge,
        variante === 'secondaire' && {
          backgroundColor: couleurs.discret,
          borderColor: 'transparent',
        },
        variante === 'primaire' && {
          backgroundColor: couleurs.rouge,
          borderColor: couleurs.rouge,
        },
      ]}
    >
      <Text style={[styles.badgeTexte, variante === 'primaire' && { color: '#FFFFFF' }]}>{libelle}</Text>
    </View>
  );
}

/** `premium-avatar` : initiales du prénom et du nom. */
export function Initiales({ prenom, nom }: { prenom?: string; nom?: string }) {
  const lettres = `${(prenom || '?').slice(0, 1)}${(nom || '').slice(0, 1)}`.toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarTexte}>{lettres}</Text>
    </View>
  );
}

/** `<details>` : résumé cliquable, contenu replié par défaut. */
export function Repliable({
  resume,
  ouvert: ouvertInitial = false,
  children,
  style,
}: {
  resume: ReactNode;
  ouvert?: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const [ouvert, setOuvert] = useState(ouvertInitial);
  const Icone = ouvert ? ChevronDown : ChevronRight;
  return (
    <View style={style}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: ouvert }} onPress={() => setOuvert(!ouvert)} style={styles.resume}>
        <Icone size={14} color={couleurs.texteDoux} />
        {typeof resume === 'string' ? <Text style={styles.resumeTexte}>{resume}</Text> : resume}
      </Pressable>
      {ouvert && <View style={{ marginTop: espace(3) }}>{children}</View>}
    </View>
  );
}

/** Barre « Rechercher un dossier… » avec loupe. */
export function Recherche({
  valeur,
  onChange,
  placeholder = 'Rechercher un dossier…',
  libelle = 'Rechercher',
}: {
  valeur: string;
  onChange: (v: string) => void;
  placeholder?: string;
  libelle?: string;
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: 192,
        minWidth: 0,
        justifyContent: 'center',
      }}
    >
      <Search size={16} color={couleurs.texteDoux} style={{ position: 'absolute', left: 12, zIndex: 1 }} />
      <TextInput
        accessibilityLabel={libelle}
        value={valeur}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={couleurs.suggestion}
        style={[styles.saisie, { paddingLeft: 36 }]}
      />
    </View>
  );
}

/** Une valeur de dossier en lecture (`<dl>`) : « Non renseigné » quand rien n'est saisi. */
export function Valeur({ libelle, valeur }: { libelle: string; valeur: string | undefined | null }) {
  const vide = !valeur?.trim();
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.aide}>{libelle}</Text>
      <Text selectable style={[styles.valeur, vide && { color: couleurs.texteDoux }]}>
        {vide ? 'Non renseigné' : valeur}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    backgroundColor: 'rgba(17,18,22,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  boite: {
    width: '100%',
    maxWidth: 768,
    maxHeight: '100%',
    backgroundColor: couleurs.carte,
    borderRadius: arrondi.carte,
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(17, 17, 17, 0.18)',
  } as ViewStyle,
  titreLigne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espace(3),
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 8,
  },
  titre: {
    flex: 1,
    fontFamily: polices.texteGras,
    fontSize: 18,
    lineHeight: 24,
    color: couleurs.texte,
  },
  croix: {
    width: 36,
    height: 36,
    marginTop: -6,
    marginRight: -8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corps: { paddingHorizontal: 24, paddingBottom: 24, paddingTop: 8, gap: 20 },
  pied: {
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: couleurs.carte,
  },
  piedLigne: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espace(3),
  },
  etat: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  boutons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espace(2),
    alignItems: 'center',
  },
  boutonPied: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: arrondi.controle,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    backgroundColor: couleurs.carte,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boutonPiedTexte: {
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.texte,
  },
  grille: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 20 },
  libelle: {
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.texte,
  },
  saisie: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texte,
    backgroundColor: couleurs.carte,
  },
  erreur: { fontFamily: polices.texte, fontSize: 12, color: couleurs.rouge },
  aide: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  valeur: {
    fontFamily: polices.texte,
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texte,
  },
  multi: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: couleurs.carte,
  },
  multiTexte: {
    fontFamily: polices.texte,
    fontSize: 12,
    color: couleurs.texte,
  },
  case: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caseTexte: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  badge: {
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeTexte: {
    fontFamily: polices.texteGras,
    fontSize: 12,
    color: couleurs.texte,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: couleurs.rougeClair,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTexte: {
    fontFamily: polices.texteGras,
    fontSize: 14,
    color: couleurs.rouge,
  },
  resume: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    alignSelf: 'flex-start',
  },
  resumeTexte: {
    fontFamily: polices.texteMoyen,
    fontSize: 12,
    color: couleurs.texteDoux,
  },
});
