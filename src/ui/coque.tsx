// Coque reprise de l'app d'origine : en-tête sombre à ligne rouge, onglets coach (`wellness-tabs`),
// sous-navigation (`premium-subnav`), menu CRM (`wellness-sidebar` / sélecteur « Rubrique »),
// barre du bas client (`client-bottom-nav`), hero, statistiques et états vides.
import { ChevronDown, Eye, type LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, type PressableStateCallbackType, ScrollView, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrondi, couleurs, espace, espacementTitre, polices } from './theme';

/** Survol souris (web) : absent des types natifs de Pressable. */
const survol = (e: PressableStateCallbackType) => !!(e as { hovered?: boolean }).hovered;

/** Monogramme C·O (C blanc, O rouge), lisible sur l'en-tête sombre. */
export function Logo() {
  return <Image source={require('../../assets/images/logo.png')} accessibilityLabel="Logo CoachGo" style={styles.logo} />;
}

export function EnTete({
  largeur,
  sousTitre,
  badge,
  email,
  droite,
}: {
  largeur: number;
  sousTitre?: string;
  badge?: string;
  email?: string;
  droite?: ReactNode;
}) {
  const { top } = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const petit = width <= 640;
  return (
    <View style={[styles.entete, { paddingTop: top }]}>
      <View style={[styles.enteteLigne, { maxWidth: largeur }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(sousTitre ? 3 : 2) }}>
          <Logo />
          <View>
            <Text style={[styles.marque, { fontSize: petit ? 22 : sousTitre ? 24 : 20 }]}>CoachGo</Text>
            {sousTitre && <Text style={styles.marqueSous}>{sousTitre}</Text>}
          </View>
        </View>
        {badge && !petit && (
          <View style={styles.badge}>
            <Text style={styles.badgeTexte}>{badge}</Text>
          </View>
        )}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: espace(1) }}>{droite}</View>
      </View>
      {email !== undefined && <Text style={[styles.email, { maxWidth: largeur }]}>{email}</Text>}
    </View>
  );
}

/** Bouton icône de l'en-tête (minuteur, déconnexion) : toujours un nom accessible. */
export function BoutonIcone({ icone: Icone, nom, onPress }: { icone: LucideIcon; nom: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nom}
      onPress={onPress}
      style={(e) => [styles.boutonIcone, (e.pressed || survol(e)) && { backgroundColor: '#3a3a3a' }]}
    >
      <Icone size={20} color="#FFFFFF" />
    </Pressable>
  );
}

/** Commutateur « Aperçu — Coach / Vue client » du header coach. */
export function CommutateurApercu({ valeur, onChange }: { valeur: 'coach' | 'client'; onChange: (v: 'coach' | 'client') => void }) {
  return (
    <View style={styles.apercu}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8 }}>
        <Eye size={14} color="#C1C6CD" />
        <Text style={styles.apercuLibelle}>APERÇU</Text>
      </View>
      {(['coach', 'client'] as const).map((m) => (
        <Pressable
          key={m}
          accessibilityRole="button"
          accessibilityState={{ selected: valeur === m }}
          onPress={() => m !== valeur && onChange(m)}
          style={[styles.apercuBouton, valeur === m && { backgroundColor: couleurs.secondaire }]}
        >
          <Text style={[styles.apercuTexte, valeur === m && { color: '#FFFFFF' }]}>{m === 'coach' ? 'Coach' : 'Vue client'}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export type OngletDef<T extends string> = { cle: T; libelle: string; icone?: LucideIcon };

/** `wellness-tabs` : onglets coach, l'actif en rouge plein, déroulement horizontal sur téléphone. */
export function OngletsCoach<T extends string>({ onglets, valeur, onChange }: { onglets: OngletDef<T>[]; valeur: T; onChange: (v: T) => void }) {
  const petit = useWindowDimensions().width <= 640;
  return (
    <View accessibilityRole="tablist" aria-label="Espaces de travail coach" style={styles.onglets}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5 }}>
        {onglets.map((o) => {
          const actif = o.cle === valeur;
          return (
            <Pressable
              key={o.cle}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              aria-selected={actif}
              aria-current={actif ? 'page' : undefined}
              onPress={() => onChange(o.cle)}
              style={[styles.onglet, { paddingHorizontal: petit ? 13 : 18 }, actif && { backgroundColor: couleurs.rouge }]}
            >
              <Text style={[styles.ongletTexte, { fontSize: petit ? 13 : 14 }, actif && { color: '#FFFFFF' }]}>{o.libelle}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/**
 * `premium-subnav` : onglet actif blanc à texte rouge sur fond gris clair.
 * `grille` reprend `followup-subnav` (5 colonnes, 3 sur téléphone) et `nutrition-subnav` (5 colonnes).
 */
export function SousNav<T extends string>({
  onglets,
  valeur,
  onChange,
  nom,
  grille,
}: {
  onglets: OngletDef<T>[];
  valeur: T;
  onChange: (v: T) => void;
  nom: string;
  grille?: 'suivi' | 'nutrition';
}) {
  const petit = useWindowDimensions().width <= 640;
  const colonnes = grille === 'suivi' && petit ? 3 : 5;
  const bouton = (o: OngletDef<T>) => {
    const actif = o.cle === valeur;
    return (
      <Pressable
        key={o.cle}
        accessibilityRole="tab"
        accessibilityState={{ selected: actif }}
        aria-selected={actif}
        aria-current={actif ? 'page' : undefined}
        onPress={() => onChange(o.cle)}
        style={[
          styles.sousOnglet,
          grille ? { width: `${100 / colonnes}%`, padding: 3 } : { flexGrow: 1 },
        ]}
      >
        <View style={[styles.sousOngletInterne, grille === 'nutrition' && { paddingHorizontal: 2 }, actif && styles.sousOngletActif]}>
          {o.icone && <o.icone size={11} color={actif ? couleurs.rouge : couleurs.texteDoux} style={{ marginBottom: 2 }} />}
          <Text
            style={[
              styles.sousOngletTexte,
              { fontSize: grille === 'nutrition' ? 11.5 : petit ? 12 : 12.8 },
              actif && { color: couleurs.rouge },
            ]}
          >
            {o.libelle}
          </Text>
        </View>
      </Pressable>
    );
  };
  if (grille)
    return (
      <View accessibilityRole="tablist" aria-label={nom} style={[styles.sousNav, { flexDirection: 'row', flexWrap: 'wrap', padding: 3 }]}>
        {onglets.map(bouton)}
      </View>
    );
  return (
    <View accessibilityRole="tablist" aria-label={nom} style={styles.sousNav}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 5, flexGrow: 1 }}>
        {onglets.map(bouton)}
      </ScrollView>
    </View>
  );
}

/** Menu CRM : colonne de 220px dès 1 024px (« Vos dossiers »), sélecteur « Rubrique » en dessous. */
export function MenuRubriques<T extends string>({
  rubriques,
  valeur,
  onChange,
  large,
}: {
  rubriques: OngletDef<T>[];
  valeur: T;
  onChange: (v: T) => void;
  large: boolean;
}) {
  // Sur téléphone : une rangée de puces qui défile, plutôt qu'une liste déroulante qui cache les rubriques.
  if (!large)
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {rubriques.map((r) => {
          const actif = r.cle === valeur;
          const Icone = r.icone;
          return (
            <Pressable
              key={r.cle}
              accessibilityRole="button"
              aria-current={actif ? 'page' : undefined}
              onPress={() => onChange(r.cle)}
              style={[styles.puceRubrique, actif && styles.rubriqueActive]}
            >
              {Icone && <Icone size={15} color={actif ? '#FFFFFF' : couleurs.texteDoux} />}
              <Text style={[styles.rubriqueTexte, actif && { color: '#FFFFFF' }]}>{r.libelle}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  return (
    <View style={[styles.sidebar, { width: 220, position: 'sticky' as never, top: 130, gap: 4 }]}>
      <Text style={[styles.libelleSection, { paddingHorizontal: 12, paddingVertical: 8 }]}>Vos dossiers</Text>
      {rubriques.map((r) => {
        const actif = r.cle === valeur;
        const Icone = r.icone;
        return (
          <Pressable
            key={r.cle}
            accessibilityRole="button"
            aria-current={actif ? 'page' : undefined}
            onPress={() => onChange(r.cle)}
            style={(e) => [
              styles.rubrique,
              actif ? styles.rubriqueActive : survol(e) && { backgroundColor: couleurs.discret },
            ]}
          >
            {Icone && <Icone size={16} color={actif ? '#FFFFFF' : couleurs.texteDoux} />}
            <Text style={[styles.rubriqueTexte, actif && { color: '#FFFFFF' }]}>{r.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Équivalent du `<select>` d'origine : libellé, valeur courante, liste en surimpression. */
export function Selecteur<T extends string>({
  libelle,
  options,
  valeur,
  onChange,
  sansLibelle,
}: {
  libelle: string;
  options: OngletDef<T>[];
  valeur: T;
  onChange: (v: T) => void;
  /** Le libellé reste lu par les lecteurs d'écran (aria-label d'origine) sans être affiché. */
  sansLibelle?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const courante = options.find((r) => r.cle === valeur);
  return (
    <View>
      {!sansLibelle && <Text style={styles.selecteurLibelle}>{libelle}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={libelle} onPress={() => setOuvert(true)} style={styles.selecteur}>
        <Text style={styles.selecteurTexte}>{courante?.libelle ?? '—'}</Text>
        <ChevronDown size={16} color={couleurs.texteDoux} />
      </Pressable>
      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        <Pressable style={styles.voile} onPress={() => setOuvert(false)}>
          <View style={styles.liste}>
            {options.map((r) => (
              <Pressable
                key={r.cle}
                accessibilityRole="menuitem"
                onPress={() => {
                  setOuvert(false);
                  if (r.cle !== valeur) onChange(r.cle);
                }}
                style={[styles.listeLigne, r.cle === valeur && { backgroundColor: couleurs.rougeClair }]}
              >
                <Text style={[styles.selecteurTexte, r.cle === valeur && { color: couleurs.rouge }]}>{r.libelle}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Bouton `outline` de shadcn, petite taille, avec icône facultative à droite (↗) ou à gauche. */
export function BoutonContour({
  libelle,
  onPress,
  icone: Icone,
  iconeAGauche,
  nom,
  desactive,
}: {
  libelle?: string;
  onPress: () => void;
  icone?: LucideIcon;
  iconeAGauche?: boolean;
  nom?: string;
  desactive?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nom ?? libelle}
      disabled={desactive}
      onPress={onPress}
      style={(e) => [
        styles.contour,
        !libelle && { width: 44, paddingHorizontal: 0 },
        survol(e) && { backgroundColor: couleurs.discret },
        desactive && { opacity: 0.5 },
      ]}
    >
      {Icone && iconeAGauche && <Icone size={16} color={couleurs.texte} />}
      {libelle && <Text style={styles.contourTexte}>{libelle}</Text>}
      {Icone && !iconeAGauche && <Icone size={libelle ? 14 : 16} color={couleurs.texte} />}
    </Pressable>
  );
}

/** `client-bottom-nav` : cinq entrées toujours visibles, au moins 60px, trait rouge de 18 × 3px sur l'actif. */
export function BarreClient<T extends string>({ onglets, valeur, onChange }: { onglets: OngletDef<T>[]; valeur: T; onChange: (v: T) => void }) {
  const { bottom } = useSafeAreaInsets();
  const petit = useWindowDimensions().width < 640;
  return (
    <View accessibilityRole="tablist" aria-label="Navigation de l’espace client" style={[styles.barre, { paddingBottom: bottom }]}>
      <View style={styles.barreLigne}>
        {onglets.map((o) => {
          const actif = o.cle === valeur;
          const Icone = o.icone;
          return (
            <Pressable
              key={o.cle}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              aria-selected={actif}
              aria-current={actif ? 'page' : undefined}
              onPress={() => !actif && onChange(o.cle)}
              style={[styles.barreBouton, actif && { backgroundColor: 'rgba(195, 24, 30, 0.065)' }]}
            >
              {actif && <View style={styles.barreTrait} />}
              {Icone && <Icone size={20} color={actif ? couleurs.rouge : couleurs.texteDoux} />}
              <Text numberOfLines={1} style={[styles.barreTexte, { fontSize: petit ? 11 : 12 }, actif && { color: couleurs.rouge }]}>
                {o.libelle}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** `premium-hero` : carte blanche à liseré rouge de 4px, kicker, titre display. */
export function Hero({ kicker, titre, sousTitre, droite, children }: { kicker: string; titre: string; sousTitre?: string; droite?: ReactNode; children?: ReactNode }) {
  const petit = useWindowDimensions().width <= 640;
  return (
    <View style={[styles.hero, { padding: petit ? 17.6 : 22.4 }]}>
      <View style={styles.heroLiseré} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: espace(3) }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Kicker>{kicker}</Kicker>
          <TitreDisplay taille={30} style={{ marginTop: 6 }}>{titre}</TitreDisplay>
          {sousTitre && <Text style={styles.heroSous}>{sousTitre}</Text>}
        </View>
        {droite}
      </View>
      {children}
    </View>
  );
}

export function Kicker({ children }: { children: ReactNode }) {
  return <Text style={styles.kicker}>{children}</Text>;
}

/** H1 `font-display` : clamp(2.3rem, 4vw, 3rem), interligne 1.05. */
export function TitreDisplay({ children, style, taille }: { children: ReactNode; style?: StyleProp<ViewStyle>; taille?: number }) {
  const { width } = useWindowDimensions();
  const t = taille ?? Math.min(48, Math.max(36.8, width * 0.04));
  return (
    <Text accessibilityRole="header" style={[{ fontFamily: polices.titre, fontSize: t, lineHeight: t * 1.05, letterSpacing: espacementTitre(t), color: couleurs.texte }, style as never]}>
      {children}
    </Text>
  );
}

/** En-tête de rubrique CRM : « Gestion du coaching », titre, dernière actualisation, Actualiser. */
export function EnTeteRubrique({ kicker, titre, sousTitre, action }: { kicker: string; titre: string; sousTitre?: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espace(3), marginBottom: espace(6) }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={[styles.kicker, { fontSize: 12, letterSpacing: 1.2, fontFamily: polices.texte }]}>{kicker}</Text>
        <TitreDisplay taille={30} style={{ marginTop: 4 }}>{titre}</TitreDisplay>
        {sousTitre && <Text style={{ marginTop: 4, fontSize: 12, fontFamily: polices.texte, color: couleurs.texteDoux }}>{sousTitre}</Text>}
      </View>
      {action}
    </View>
  );
}

/** Carte chiffrée cliquable de la Vue d'ensemble. */
export function Stat({ libelle, valeur, onPress, style }: { libelle: string; valeur: string; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={(e) => [styles.stat, survol(e) && { borderColor: couleurs.rougeMarque }, style]}
    >
      <Text style={{ fontSize: 12, fontFamily: polices.texte, color: couleurs.texteDoux }}>{libelle}</Text>
      <Text style={styles.statValeur}>{valeur}</Text>
    </Pressable>
  );
}

/** `premium-empty` : bordure pointillée, texte centré. */
export function Vide({ titre, texte, icone: Icone, children }: { titre: string; texte?: string; icone?: LucideIcon; children?: ReactNode }) {
  return (
    <View style={styles.vide}>
      {Icone && <Icone size={32} color={couleurs.texteDoux} style={{ alignSelf: 'center' }} />}
      <Text style={styles.videTitre}>{titre}</Text>
      {texte && <Text style={styles.videTexte}>{texte}</Text>}
      {children}
    </View>
  );
}

/** Rubrique dont l'écran d'origine n'est pas encore repris : on le dit, sans fausse donnée. */
export function NonRepris({ ecran, lot, detail }: { ecran: string; lot: number; detail?: string }) {
  return (
    <Vide
      titre={`${ecran} : pas encore repris`}
      texte={`Cet écran sera reconstruit au lot ${lot} à partir de l’app d’origine.${detail ? ' ' + detail : ''} Rien n’est affiché ici tant qu’il n’est pas branché sur les vraies données.`}
    />
  );
}

export function LibelleSection({ children }: { children: ReactNode }) {
  return <Text style={styles.libelleSection}>{children}</Text>;
}

/** Bandeau des données de démonstration : toujours visible, jamais confondu avec un vrai dossier. */
export function BandeauDemo() {
  return (
    <View style={styles.demo}>
      <Text style={styles.demoTexte}>Données de démonstration, fictives et stockées sur cet appareil.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 48, height: 48 },
  entete: {
    backgroundColor: '#18191D',
    backgroundImage: 'linear-gradient(110deg, #111216, #202126)',
    borderBottomWidth: 2,
    borderBottomColor: couleurs.rougeMarque,
    boxShadow: '0 6px 24px rgba(17, 17, 17, 0.07)',
    zIndex: 20,
  } as ViewStyle,
  enteteLigne: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espace(3),
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
  },
  marque: { fontFamily: polices.titre, color: '#FFFFFF', letterSpacing: espacementTitre(24) },
  marqueSous: { fontFamily: polices.texte, fontSize: 10, letterSpacing: 1.8, textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)' },
  badge: { borderWidth: 1, borderColor: '#687384', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  badgeTexte: { color: '#E0E5EB', fontSize: 12, fontFamily: polices.texteGras },
  email: { width: '100%', alignSelf: 'center', paddingHorizontal: espace(4), paddingBottom: espace(2), fontSize: 12, fontFamily: polices.texte, color: '#C1C6CD' },
  boutonIcone: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  apercu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#454545',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  apercuLibelle: { fontSize: 12, fontFamily: polices.texteGras, letterSpacing: 0.4, color: '#C1C6CD' },
  apercuBouton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  apercuTexte: { fontSize: 14, fontFamily: polices.texteMoyen, color: '#C1C6CD' },
  onglets: {
    backgroundColor: couleurs.carte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 17.6,
    padding: 6.4,
    marginBottom: espace(6),
    boxShadow: '0 4px 16px rgba(21, 21, 21, 0.016)',
  } as ViewStyle,
  onglet: { minHeight: 44, borderRadius: 12.8, justifyContent: 'center' },
  ongletTexte: { fontFamily: polices.texteMoyen, color: couleurs.texteDoux },
  sousNav: { backgroundColor: couleurs.discret, borderRadius: 16, padding: 5.6 },
  sousOnglet: { minHeight: 44 },
  sousOngletInterne: { flex: 1, minHeight: 44, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  sousOngletActif: { backgroundColor: couleurs.carte, boxShadow: '0 2px 8px rgba(17, 17, 17, 0.027)' } as ViewStyle,
  sousOngletTexte: { fontFamily: polices.texteMoyen, color: couleurs.texteDoux, textAlign: 'center' },
  sidebar: {
    backgroundColor: couleurs.carte,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 19.2,
    padding: 11.2,
    alignSelf: 'flex-start',
    boxShadow: '0 4px 20px rgba(17, 17, 17, 0.012)',
  } as ViewStyle,
  contour: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: arrondi.controle,
    backgroundColor: couleurs.carte,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  contourTexte: { fontSize: 14, fontFamily: polices.texteMoyen, color: couleurs.texte },
  selecteurLibelle: { marginBottom: 8, fontSize: 12, fontFamily: polices.texteMoyen, color: couleurs.texteDoux },
  selecteur: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: couleurs.saisie,
    borderRadius: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: couleurs.carte,
  },
  selecteurTexte: { fontSize: 14, fontFamily: polices.texte, color: couleurs.texte },
  voile: { flex: 1, backgroundColor: 'rgba(17,18,22,0.35)', justifyContent: 'center', padding: espace(5) },
  liste: { backgroundColor: couleurs.carte, borderRadius: 20, padding: 8, maxWidth: 420, width: '100%', alignSelf: 'center' },
  listeLigne: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, justifyContent: 'center' },
  libelleSection: { fontSize: 11.5, fontFamily: polices.texteGras, textTransform: 'uppercase', letterSpacing: 1.15, color: couleurs.texteDoux },
  rubrique: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  puceRubrique: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    backgroundColor: couleurs.carte,
  },
  rubriqueActive: { backgroundColor: couleurs.rouge, boxShadow: '0 3px 12px rgba(215, 25, 32, 0.125)' } as ViewStyle,
  rubriqueTexte: { fontSize: 14, fontFamily: polices.texteMoyen, color: couleurs.texteDoux },
  barre: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
    borderTopWidth: 1,
    borderTopColor: couleurs.bordure,
    backgroundColor: 'rgba(255,255,255,0.97)',
    backdropFilter: 'blur(16px)',
    boxShadow: '0 -4px 30px rgba(17, 17, 17, 0.03)',
  } as ViewStyle,
  barreLigne: { width: '100%', maxWidth: 896, alignSelf: 'center', flexDirection: 'row' },
  barreBouton: {
    flex: 1,
    minWidth: 0,
    minHeight: 60,
    marginVertical: 4.8,
    marginHorizontal: 2.4,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 12,
  },
  barreTrait: { position: 'absolute', top: 3.2, width: 18, height: 3, borderRadius: 99, backgroundColor: couleurs.rouge },
  barreTexte: { fontFamily: polices.texteMoyen, color: couleurs.texteDoux },
  hero: {
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: arrondi.hero,
    backgroundColor: couleurs.carte,
    gap: espace(4),
  },
  heroLiseré: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 4, backgroundColor: couleurs.rouge },
  heroSous: { marginTop: 8, fontSize: 14, fontFamily: polices.texte, color: couleurs.texteDoux },
  kicker: { fontSize: 10.9, fontFamily: polices.texteGras, letterSpacing: 1.75, textTransform: 'uppercase', color: couleurs.rouge },
  stat: {
    flexGrow: 1,
    flexBasis: 200,
    padding: 20,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 16,
    backgroundColor: couleurs.carte,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  } as ViewStyle,
  statValeur: { marginTop: 12, fontSize: 30, fontFamily: polices.texteGras, color: couleurs.texte, fontVariant: ['tabular-nums'] },
  vide: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: couleurs.bordure,
    borderRadius: 18.4,
    backgroundColor: couleurs.carte,
    gap: 8,
  },
  videTitre: { textAlign: 'center', fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte },
  videTexte: { textAlign: 'center', fontSize: 13.6, lineHeight: 20, fontFamily: polices.texte, color: couleurs.texteDoux },
  demo: { borderRadius: 12, borderWidth: 1, borderColor: 'rgba(195, 24, 30, 0.2)', backgroundColor: 'rgba(195, 24, 30, 0.05)', padding: 12 },
  demoTexte: { fontSize: 13, fontFamily: polices.texteMoyen, color: couleurs.rougeTexte },
});
