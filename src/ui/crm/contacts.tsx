// C02 — Liste Contacts reprise de CRMWorkspace.tsx : recherche, filtre de statut, Nouveau contact,
// « Inclure les dossiers archivés », cartes à initiales et, sous chaque contact, le bouton de la prochaine étape du parcours.
import { useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { etapeSuivante, filtrerContacts, formaterTelephone, statutContact, STATUTS_CONTACT, type ContactResume, type StatutContact } from '@/domain/crm';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { arrondi, couleurs, espace, polices } from '../theme';
import { BoutonEtape } from './acces';
import { EnvoiMessage, nomComplet, useMessageQuestionnaire } from './commun';
import { Badge, CaseACocher, Choix, Initiales, Recherche, useBlocNomCarte } from './dossier';

export function Contacts({
  prospects,
  onOuvrir,
  onNouveau,
  onPlanifierBooster,
  onOuvrirBooster,
}: {
  /** Onglet Clients › Prospects : les clients actifs ont leur propre liste (Clients actifs), on ne les répète pas ici. */
  prospects?: boolean;
  onOuvrir: (id: string) => void;
  onNouveau: () => void;
  onPlanifierBooster: (contactId: string) => void;
  onOuvrirBooster: (b: { id: string; contactId: string }) => void;
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
  }).filter((c) => !prospects || c.statut !== 'client');
  const statuts = prospects ? STATUTS_CONTACT.filter((x) => x !== 'Client actif') : STATUTS_CONTACT;

  return (
    <View style={{ gap: espace(4) }}>
      <View style={styles.outils}>
        <Recherche valeur={recherche} onChange={setRecherche} />
        <View style={{ minWidth: 180, flexGrow: 0 }}>
          <Choix
            libelle="Filtrer le statut"
            sansLibelle
            vide="Tous les statuts"
            choix={statuts}
            valeur={statut}
            onChange={(v) => setStatut(v as StatutContact | undefined)}
          />
        </View>
        <BoutonPrincipal libelle={prospects ? 'Nouveau prospect' : 'Nouveau contact'} onPress={onNouveau} />
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
            onOuvrirBooster={(id) => onOuvrirBooster({ id, contactId: c.id })}
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
  onOuvrirBooster,
}: {
  contact: ContactResume;
  lienQuestionnaire: string | null;
  onOuvrir: () => void;
  onPlanifierBooster: () => void;
  onOuvrirBooster: (boosterId: string) => void;
}) {
  const blocNom = useBlocNomCarte();
  return (
    <View style={carteDossier}>
      {/* Sur téléphone, l'en-tête passe en colonne : le nom sur toute la largeur, les badges dessous. */}
      <View style={[styles.entete, blocNom && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={[styles.identite, blocNom]}>
          <Initiales prenom={c.prenom} nom={c.nom} />
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
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
      <ProchaineEtape
        contact={c}
        lienQuestionnaire={lienQuestionnaire}
        onOuvrir={onOuvrir}
        onPlanifierBooster={onPlanifierBooster}
        onOuvrirBooster={onOuvrirBooster}
      />
    </View>
  );
}

/**
 * Un seul bouton, celui de l'étape à faire (questionnaire, Booster, accès à l'appli), au lieu de sept boutons
 * cachés dans « Actions du dossier ». Le reste est dans la fiche.
 */
function ProchaineEtape({
  contact,
  lienQuestionnaire,
  onOuvrir,
  onPlanifierBooster,
  onOuvrirBooster,
}: {
  contact: ContactResume;
  lienQuestionnaire: string | null;
  onOuvrir: () => void;
  onPlanifierBooster: () => void;
  onOuvrirBooster: (boosterId: string) => void;
}) {
  const message = useMessageQuestionnaire(contact, lienQuestionnaire);
  const [envoi, setEnvoi] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const etape = etapeSuivante(contact);
  const archive = contact.statut === 'archive';

  async function archiver() {
    setOccupe(true);
    setErreur(undefined);
    try {
      await (archive ? crm.reactiver(contact.id) : crm.archiver(contact.id));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action non confirmée');
    } finally {
      setOccupe(false);
    }
  }

  return (
    <View style={{ gap: espace(2) }}>
      <View style={styles.actions}>
        {etape.action === 'questionnaire' && !envoi && (
          <BoutonEtape libelle="Envoyer le questionnaire" desactive={!message} onPress={() => setEnvoi(true)} />
        )}
        {etape.action === 'planifier' && <BoutonEtape libelle="Planifier le Booster" onPress={onPlanifierBooster} />}
        {etape.action === 'preparer' && <BoutonEtape libelle="Préparer le Booster" onPress={() => onOuvrirBooster(etape.boosterId)} />}
        {etape.action === 'acces' && <BoutonEtape libelle="Créer son accès à l’appli" onPress={onOuvrir} />}
        {etape.action === 'reactiver' && <BoutonEtape libelle={occupe ? 'Réactivation…' : 'Réactiver'} desactive={occupe} onPress={archiver} />}
        {!archive && (
          <Text accessibilityRole="button" disabled={occupe} onPress={archiver} style={styles.discret}>
            Archiver
          </Text>
        )}
      </View>
      {envoi && message && <EnvoiMessage contact={contact} sujet="Ton questionnaire" message={message} />}
      {erreur && <Text style={[styles.retour, { color: couleurs.rouge }]}>{erreur}</Text>}
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
  discret: {
    minHeight: 44,
    lineHeight: 44,
    paddingHorizontal: 8,
    fontFamily: polices.texte,
    fontSize: 13,
    color: couleurs.texteDoux,
    textDecorationLine: 'underline',
  },
  retour: {
    marginTop: espace(2),
    fontFamily: polices.texte,
    fontSize: 13,
    color: couleurs.vert,
  },
});
