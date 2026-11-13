// Mon profil (bouton en haut de l'espace coach) : tout ce qui concerne le coach lui-même et ses réglages. Une seule liste
// rangée par thème, comme Mon compte côté client ; toucher une ligne ouvre sa rubrique, « Mon profil » ramène à la liste.
import { ArrowLeft, Bell, CalendarDays, ChevronRight, CreditCard, LogOut, Newspaper, RefreshCw, Tag, UserRound, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { demanderSortie } from '@/lib/brouillon';

import { ReglagesAgendaCoach } from './agenda/agenda-coach';
import { BoutonContour, EnTeteRubrique, type OngletDef } from './coque';
import { Automatisations } from './crm/automatisations';
import { MesRelances } from './crm/mes-relances';
import { EnteteFactures } from './factures';
import { MesOffres } from './offres/mes-offres';
import { MesNewsletters } from './newsletters/mes-newsletters';
import { AlertesTelephone } from './notifications/alertes';
import { MonProfilCoach } from './profil-coach';
import { couleurs, espace, polices } from './theme';

export type SectionProfil = 'infos' | 'facturation' | 'offres' | 'agenda' | 'notifications' | 'relances' | 'newsletters';
export const SECTIONS_PROFIL: OngletDef<SectionProfil>[] = [
  { cle: 'infos', libelle: 'Mes infos' },
  { cle: 'facturation', libelle: 'Paiement et factures' },
  { cle: 'offres', libelle: 'Mes offres' },
  { cle: 'agenda', libelle: 'Agenda' },
  { cle: 'notifications', libelle: 'Notifications' },
  { cle: 'relances', libelle: 'Mes relances' },
  { cle: 'newsletters', libelle: 'Mes newsletters' },
];

type Entree = { cle: SectionProfil; icone: LucideIcon; detail: string; fond: string; teinte: string };
const GROUPES: { titre: string; entrees: Entree[] }[] = [
  {
    titre: 'Mon activité',
    entrees: [
      { cle: 'offres', icone: Tag, detail: 'Packs, abonnements, prix', fond: '#FDE2E3', teinte: '#8E1015' },
      { cle: 'facturation', icone: CreditCard, detail: 'IBAN, Stripe, mentions des factures', fond: '#FFE7C7', teinte: '#6E3300' },
      { cle: 'newsletters', icone: Newspaper, detail: 'Lettres illustrées pour mes clients actifs et en veille', fond: '#E0F4F4', teinte: '#0D5C5C' },
    ],
  },
  {
    titre: 'Mon organisation',
    entrees: [
      { cle: 'agenda', icone: CalendarDays, detail: 'Horaires, lieux, Google Agenda', fond: '#E2E8FF', teinte: '#1A2D73' },
      { cle: 'relances', icone: RefreshCw, detail: 'Textes, relances coupées, mes propres relances', fond: '#F1ECFF', teinte: '#4A3699' },
      { cle: 'notifications', icone: Bell, detail: 'Ce que mon téléphone m’envoie', fond: '#DDF3E5', teinte: '#0F4D2A' },
    ],
  },
  { titre: 'Moi', entrees: [{ cle: 'infos', icone: UserRound, detail: 'Nom, coordonnées, photo', fond: couleurs.discret, teinte: couleurs.texte }] },
];

export function EspaceProfil({
  section,
  onSection,
  onDeconnecter,
}: {
  /** Absente : la liste des rubriques. */
  section?: SectionProfil;
  onSection: (s: SectionProfil | undefined) => void;
  onDeconnecter: () => void;
}) {
  if (section) {
    const titre = SECTIONS_PROFIL.find((x) => x.cle === section)!.libelle;
    return (
      <View style={{ gap: espace(4) }}>
        <View style={{ alignSelf: 'flex-start' }}>
          <BoutonContour libelle="Mon profil" icone={ArrowLeft} iconeAGauche onPress={() => demanderSortie(() => onSection(undefined))} />
        </View>
        <EnTeteRubrique kicker="Mon profil" titre={titre} />
        {section === 'infos' && <MonProfilCoach />}
        {section === 'facturation' && <EnteteFactures />}
        {section === 'offres' && <MesOffres />}
        {section === 'agenda' && <ReglagesAgendaCoach />}
        {section === 'notifications' && <AlertesTelephone role="coach" />}
        {section === 'newsletters' && <MesNewsletters />}
        {section === 'relances' && (
          <>
            <MesRelances />
            {/* Ce qui envoie et reçoit en coulisses : questionnaire Tally, comptes rendus par e-mail. */}
            <Text style={[styles.groupe, { marginTop: espace(4) }]}>Questionnaire et envois</Text>
            <Automatisations />
          </>
        )}
      </View>
    );
  }
  return (
    <View style={{ gap: espace(4), maxWidth: 640 }}>
      {/* La déconnexion reste aussi en bas de la liste, mais sur téléphone il fallait faire défiler pour la voir. */}
      <EnTeteRubrique
        kicker="Espace coach"
        titre="Mon profil"
        action={<BoutonContour libelle="Se déconnecter" icone={LogOut} iconeAGauche onPress={() => demanderSortie(onDeconnecter)} />}
      />
      {GROUPES.map((g) => (
        <View key={g.titre} style={{ gap: espace(2) }}>
          <Text style={styles.groupe}>{g.titre}</Text>
          <View style={styles.carte}>
            {g.entrees.map((e, i) => {
              const Icone = e.icone;
              return (
                <Pressable
                  key={e.cle}
                  accessibilityRole="button"
                  onPress={() => onSection(e.cle)}
                  style={({ pressed }) => [styles.ligne, i > 0 && styles.separee, pressed && { backgroundColor: couleurs.discret }]}
                >
                  <View style={[styles.pastille, { backgroundColor: e.fond }]}>
                    <Icone size={18} color={e.teinte} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.titre}>{SECTIONS_PROFIL.find((x) => x.cle === e.cle)!.libelle}</Text>
                    <Text style={styles.detail}>{e.detail}</Text>
                  </View>
                  <ChevronRight size={18} color={couleurs.texteDoux} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <View style={styles.carte}>
        <Pressable accessibilityRole="button" onPress={() => demanderSortie(onDeconnecter)} style={({ pressed }) => [styles.ligne, pressed && { backgroundColor: couleurs.discret }]}>
          <View style={[styles.pastille, { backgroundColor: couleurs.discret }]}>
            <LogOut size={18} color={couleurs.rouge} />
          </View>
          <Text style={[styles.titre, { color: couleurs.rouge }]}>Se déconnecter</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  groupe: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: couleurs.texteDoux, marginLeft: 4 },
  carte: { backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: couleurs.bordure, overflow: 'hidden' },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 56 },
  separee: { borderTopWidth: 1, borderTopColor: couleurs.bordure },
  pastille: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  titre: { fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte },
  detail: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux, marginTop: 2 },
});
