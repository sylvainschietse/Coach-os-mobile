// C02 — Liste Contacts reprise de CRMWorkspace.tsx : recherche, filtre de statut, Nouveau contact,
// « Inclure les dossiers archivés », cartes à initiales et « Actions du dossier · Booster, accès et documents ».
import { useFocusEffect } from 'expo-router';
import { ArrowUpRight, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import {
  filtrerContacts,
  formaterTelephone,
  lienAccesWhatsApp,
  lienEnvoi,
  rediger,
  statutContact,
  STATUTS_CONTACT,
  type ContactResume,
  type StatutContact,
} from '@/domain/crm';
import { adresseWeb } from '@/lib/adresse-web';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { arrondi, couleurs, espace, polices } from '../theme';
import { adresseQuestionnaire, nomComplet, useCoachNom } from './commun';
import { Badge, CaseACocher, Choix, Initiales, Recherche, Repliable, useBlocNomCarte } from './dossier';

export const LIEN_APPLI = process.env.EXPO_PUBLIC_LIEN_APPLI || adresseWeb('/');
/** Vidéo de mise en route (public/tuto-coachgo.mp4, publiée avec le site web). */
export const LIEN_TUTO = process.env.EXPO_PUBLIC_LIEN_TUTO || adresseWeb('/tuto-coachgo.mp4');

export function Contacts({
  onOuvrir,
  onNouveau,
  onPlanifierBooster,
  onRubrique,
}: {
  onOuvrir: (id: string) => void;
  onNouveau: () => void;
  onPlanifierBooster: (contactId: string) => void;
  /** Documents / Bilans filtrés sur ce dossier. */
  onRubrique: (rubrique: 'Documents' | 'Bilans', contactId: string) => void;
}) {
  const charge = useCharger(
    async () => ({
      contacts: await crm.contacts(),
      lien: await crm.lienQuestionnaire(),
    }),
    'contacts',
  );
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterCrm);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<StatutContact>();
  const [archives, setArchives] = useState(false);

  if (charge.erreur && !charge.donnee)
    return (
      <View style={{ gap: espace(3) }}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </View>
    );
  if (!charge.donnee) return <Chargement />;
  const visibles = filtrerContacts(charge.donnee.contacts, recherche, statut, {
    archives,
  });

  return (
    <View style={{ gap: espace(4) }}>
      <View style={styles.outils}>
        <Recherche valeur={recherche} onChange={setRecherche} />
        <View style={{ minWidth: 180, flexGrow: 0 }}>
          <Choix
            libelle="Filtrer le statut"
            sansLibelle
            vide="Tous les statuts"
            choix={STATUTS_CONTACT}
            valeur={statut}
            onChange={(v) => setStatut(v as StatutContact | undefined)}
          />
        </View>
        <BoutonPrincipal libelle="Nouveau contact" onPress={onNouveau} />
      </View>
      <CaseACocher petite libelle="Inclure les dossiers archivés" valeur={archives} onChange={setArchives} />
      <View style={{ gap: espace(3) }}>
        {visibles.map((c) => (
          <CarteContact
            key={c.id}
            contact={c}
            lienQuestionnaire={charge.donnee!.lien}
            onOuvrir={() => onOuvrir(c.id)}
            onPlanifierBooster={() => onPlanifierBooster(c.id)}
            onRubrique={(r) => onRubrique(r, c.id)}
          />
        ))}
        {!visibles.length && <Vide titre="Aucun dossier pour ces filtres." />}
      </View>
    </View>
  );
}

/** Bouton principal à icône « + » de la barre d'outils d'origine. */
export function BoutonPrincipal({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.principal, pressed && { opacity: 0.85 }]}>
      <Plus size={16} color="#FFFFFF" />
      <Text style={styles.principalTexte}>{libelle}</Text>
    </Pressable>
  );
}

/** `rounded-2xl border bg-card p-5 shadow-sm`. */
export const carteDossier: ViewStyle = {
  backgroundColor: couleurs.carte,
  borderWidth: 1,
  borderColor: couleurs.bordure,
  borderRadius: arrondi.carte,
  padding: 20,
  gap: espace(3),
  boxShadow: '0 1px 2px rgba(17, 17, 17, 0.05)',
} as ViewStyle;

function CarteContact({
  contact: c,
  lienQuestionnaire,
  onOuvrir,
  onPlanifierBooster,
  onRubrique,
}: {
  contact: ContactResume;
  lienQuestionnaire: string | null;
  onOuvrir: () => void;
  onPlanifierBooster: () => void;
  onRubrique: (r: 'Documents' | 'Bilans') => void;
}) {
  const blocNom = useBlocNomCarte();
  return (
    <View style={carteDossier}>
      <View style={styles.entete}>
        <View style={[styles.identite, blocNom]}>
          <Initiales prenom={c.prenom} nom={c.nom} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.nom}>{nomComplet(c)}</Text>
            <Text style={styles.coordonnees}>{[c.email, formaterTelephone(c.telephone)].filter(Boolean).join(' · ')}</Text>
            {c.objectifPrincipal && <Text style={styles.objectif}>{c.objectifPrincipal}</Text>}
          </View>
        </View>
        <View style={styles.badges}>
          {c.statut === 'archive' && <Badge variante="secondaire" libelle="Archivé" />}
          <Badge libelle={statutContact(c)} />
          <BoutonContour libelle="Voir la fiche" onPress={onOuvrir} />
        </View>
      </View>
      <ActionsDossier contact={c} lienQuestionnaire={lienQuestionnaire} onPlanifierBooster={onPlanifierBooster} onRubrique={onRubrique} />
    </View>
  );
}

function ActionsDossier({
  contact,
  lienQuestionnaire,
  onPlanifierBooster,
  onRubrique,
}: {
  contact: ContactResume;
  lienQuestionnaire: string | null;
  onPlanifierBooster: () => void;
  onRubrique: (r: 'Documents' | 'Bilans') => void;
}) {
  const coach = useCoachNom();
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string }>();
  const archive = contact.statut === 'archive';
  const questionnaire =
    lienQuestionnaire && contact.telephone
      ? lienEnvoi(
          'whatsapp',
          contact,
          rediger('questionnaire', contact, {
            coach,
            lienQuestionnaire: adresseQuestionnaire(lienQuestionnaire),
          }),
        )
      : null;
  const acces = lienAccesWhatsApp(contact, coach, LIEN_APPLI, LIEN_TUTO);

  async function agir(action: () => Promise<void>, succes: string) {
    setOccupe(true);
    setRetour(undefined);
    try {
      await action();
      setRetour({ ok: true, texte: succes });
    } catch (e) {
      setRetour({
        ok: false,
        texte: e instanceof Error ? e.message : 'Action non confirmée',
      });
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Repliable resume="Actions du dossier · Booster, accès et documents">
      <View style={styles.actions}>
        {questionnaire && <BoutonContour libelle="Questionnaire WhatsApp" icone={ArrowUpRight} onPress={() => ouvrirLien(questionnaire)} />}
        <BoutonContour libelle="Planifier un Booster" onPress={onPlanifierBooster} desactive={archive} />
        <BoutonContour
          libelle={contact.clientId ? 'Actualiser l’accès client' : 'Préparer l’accès client'}
          desactive={occupe || archive}
          onPress={() => agir(() => crm.preparerAcces(contact.id), 'Accès client préparé. Le client se connectera avec son email.')}
        />
        <BoutonEnvoyerAcces
          lien={acces}
          raison={!contact.clientId || !contact.email ? 'Préparez l’accès avec l’email du client' : 'Renseignez un numéro de téléphone valide'}
        />
        <BoutonContour libelle="Documents" onPress={() => onRubrique('Documents')} />
        <BoutonContour libelle="Bilans" onPress={() => onRubrique('Bilans')} />
        <Pressable
          accessibilityRole="button"
          disabled={occupe}
          onPress={() =>
            agir(() => (archive ? crm.reactiver(contact.id) : crm.archiver(contact.id)), archive ? 'Dossier réactivé' : 'Dossier archivé')
          }
          style={({ pressed }) => [styles.fantome, (pressed || occupe) && { opacity: 0.6 }]}
        >
          <Text style={styles.fantomeTexte}>{archive ? 'Réactiver' : 'Archiver'}</Text>
        </Pressable>
      </View>
      {retour && <Text style={[styles.retour, !retour.ok && { color: couleurs.rouge }]}>{retour.texte}</Text>}
    </Repliable>
  );
}

/** Ouvre WhatsApp avec le message prêt : rien n'est marqué « envoyé », l'ouverture ne le prouve pas. */
function BoutonEnvoyerAcces({ lien, raison }: { lien: string | null; raison: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={lien ? undefined : raison}
        disabled={!lien}
        onPress={() => lien && ouvrirLien(lien)}
        style={({ pressed }) => [styles.principal, { minHeight: 44 }, !lien && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.principalTexte}>Envoyer l’accès client</Text>
        <ArrowUpRight size={14} color="#FFFFFF" />
      </Pressable>
      {!lien && <Text style={styles.raison}>{raison}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  outils: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espace(3),
    alignItems: 'flex-start',
  },
  principal: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espace(2),
    paddingHorizontal: 16,
    borderRadius: arrondi.controle,
    backgroundColor: couleurs.rouge,
  },
  principalTexte: {
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: '#FFFFFF',
  },
  entete: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espace(3),
  },
  identite: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(3),
    flexShrink: 1,
    minWidth: 0,
    flexBasis: 220,
    flexGrow: 1,
  },
  nom: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  coordonnees: {
    marginTop: 4,
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texteDoux,
  },
  objectif: {
    marginTop: 4,
    fontFamily: polices.texte,
    fontSize: 12,
    color: couleurs.rouge,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espace(2),
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espace(2),
    alignItems: 'flex-start',
  },
  fantome: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: arrondi.controle,
  },
  fantomeTexte: {
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.texte,
  },
  retour: {
    marginTop: espace(2),
    fontFamily: polices.texte,
    fontSize: 13,
    color: couleurs.vert,
  },
  raison: {
    fontFamily: polices.texte,
    fontSize: 11,
    color: couleurs.texteDoux,
    maxWidth: 220,
  },
});
