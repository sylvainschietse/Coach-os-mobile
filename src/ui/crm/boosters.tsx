// Rubrique Boosters reprise de CRMWorkspace.tsx : liste filtrable, résultat commercial, briefing dépliable,
// compte rendu, création du coaching et documents du client.
import { router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { crm, ecouterCrm } from '@/data/crm';
import { filtrerBoosters, statutBooster, STATUTS_BOOSTER, type BoosterDossier, type StatutBooster } from '@/domain/crm';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Vide } from '../coque';
import { Chargement, Erreur } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { BoutonEtape } from './acces';
import { EnvoiMessage, nomComplet, useMessageQuestionnaire } from './commun';
import { BoutonPrincipal, carteDossier } from './contacts';
import { Badge, CaseACocher, Choix, Recherche, useBlocNomCarte } from './dossier';

const quand = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

export function Boosters({
  contactId,
  onToutAfficher,
  onOuvrir,
  onNouveau,
  onSupprimer,
  onOuvrirContact,
}: {
  /** Filtre « Dossier : X » venu d'une fiche. */
  contactId?: string;
  onToutAfficher: () => void;
  onOuvrir: (b: BoosterDossier) => void;
  onNouveau: () => void;
  onSupprimer: (b: BoosterDossier) => void;
  onOuvrirContact: (contactId: string) => void;
}) {
  const charge = useCharger(
    async () => ({
      boosters: await crm.boosters(),
      lien: await crm.lienQuestionnaire(),
      // Pour ne proposer « Envoyer le questionnaire » qu'à ceux qui ne l'ont pas encore rempli.
      avecQuestionnaire: new Set((await crm.carnet()).questionnaires.map((q) => q.contactId)),
    }),
    'boosters',
  );
  useFocusEffect(charge.recharger);
  useRechargerSur(charge.recharger, ecouterCrm);
  const [recherche, setRecherche] = useState('');
  const [statut, setStatut] = useState<StatutBooster>();
  const [archives, setArchives] = useState(false);

  if (charge.erreur && !charge.donnee)
    return (
      <View style={{ gap: espace(3) }}>
        <Erreur message={charge.erreur} />
        <BoutonContour libelle="Réessayer" onPress={charge.recharger} />
      </View>
    );
  if (!charge.donnee) return <Chargement />;
  const { boosters, lien, avecQuestionnaire } = charge.donnee;
  const visibles = filtrerBoosters(boosters, recherche, {
    statut,
    contactId,
    archives,
  });
  const filtre = contactId ? boosters.find((b) => b.contactId === contactId)?.contact : undefined;

  return (
    <View style={{ gap: espace(4) }}>
      <View style={styles.outils}>
        <Recherche valeur={recherche} onChange={setRecherche} />
        <View style={{ minWidth: 180 }}>
          <Choix
            libelle="Filtrer le statut"
            sansLibelle
            vide="Tous les statuts"
            choix={STATUTS_BOOSTER}
            valeur={statut}
            onChange={(v) => setStatut(v as StatutBooster | undefined)}
          />
        </View>
        <BoutonPrincipal libelle="Nouveau Booster" onPress={onNouveau} />
      </View>
      {contactId && (
        <Text style={styles.filtre}>
          Dossier : {filtre ? nomComplet(filtre) : 'ce contact'}{' '}
          <Text accessibilityRole="button" onPress={onToutAfficher} style={{ textDecorationLine: 'underline' }}>
            Afficher tous
          </Text>
        </Text>
      )}
      <CaseACocher petite libelle="Inclure les dossiers archivés" valeur={archives} onChange={setArchives} />
      <View style={{ gap: espace(3) }}>
        {visibles.map((b) => (
          <CarteBooster
            key={b.id}
            booster={b}
            lienQuestionnaire={lien}
            questionnaireRecu={avecQuestionnaire.has(b.contactId)}
            onOuvrir={() => onOuvrir(b)}
            onSupprimer={() => onSupprimer(b)}
            onOuvrirContact={() => onOuvrirContact(b.contactId)}
          />
        ))}
        {!visibles.length && <Vide titre="Aucun dossier pour ces filtres." />}
      </View>
    </View>
  );
}

function CarteBooster({
  booster: b,
  lienQuestionnaire,
  questionnaireRecu,
  onOuvrir,
  onSupprimer,
  onOuvrirContact,
}: {
  booster: BoosterDossier;
  lienQuestionnaire: string | null;
  questionnaireRecu: boolean;
  onOuvrir: () => void;
  onSupprimer: () => void;
  onOuvrirContact: () => void;
}) {
  const blocNom = useBlocNomCarte();
  const [briefing, setBriefing] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const message = useMessageQuestionnaire(b.contact, lienQuestionnaire);
  const prevu = b.statut === 'prevu';
  const compteRendu = () => router.push({ pathname: '/coach/compte-rendu/[id]', params: { id: b.id, contact: b.contactId } });
  return (
    <View style={carteDossier}>
      <View style={styles.entete}>
        <View style={[{ flexShrink: 1, minWidth: 0, flexBasis: 220, flexGrow: 1 }, blocNom]}>
          <Text style={styles.titre}>{b.nom || 'Sans nom'}</Text>
          <Text style={styles.sous}>
            <Text accessibilityRole="link" onPress={onOuvrirContact} style={{ textDecorationLine: 'underline' }}>
              {nomComplet(b.contact)}
            </Text>{' '}
            · {quand(b.date)}
          </Text>
        </View>
        <View style={styles.ligne}>
          {b.contact.statut === 'archive' && <Badge variante="secondaire" libelle="Archivé" />}
          <Badge libelle={statutBooster(b)} />
          {b.resultatCommercial && <Badge variante="secondaire" libelle={b.resultatCommercial} />}
        </View>
      </View>
      {b.resumeIa && (
        <Text accessibilityRole="button" onPress={() => setBriefing(!briefing)} style={styles.lien}>
          {briefing ? 'Masquer le briefing' : 'Voir le briefing'}
        </Text>
      )}
      {briefing && (
        <View style={styles.briefing}>
          <Text style={[styles.panneau, { backgroundColor: couleurs.discret }]}>{b.resumeIa}</Text>
          <Text style={[styles.panneau, { borderWidth: 1, borderColor: '#FDE68A' }]}>
            {b.pointsAttention || 'Aucun point d’attention enregistré.'}
          </Text>
        </View>
      )}
      {/* Le bouton de l'étape (préparer avant, compte rendu après), puis ce qui reste utile. */}
      <View style={styles.ligne}>
        {prevu ? <BoutonEtape libelle="Préparer le Booster" onPress={onOuvrir} /> : <BoutonContour libelle="Ouvrir" onPress={onOuvrir} />}
        {b.statut === 'fait' && <BoutonEtape libelle="Compte rendu" onPress={compteRendu} />}
        {prevu && !questionnaireRecu && !envoi && message && <BoutonContour libelle="Envoyer le questionnaire" onPress={() => setEnvoi(true)} />}
        <Text accessibilityRole="button" onPress={onSupprimer} style={styles.supprimer}>
          Supprimer
        </Text>
      </View>
      {envoi && message && <EnvoiMessage contact={b.contact} sujet="Ton questionnaire" message={message} />}
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
  filtre: { fontFamily: polices.texte, fontSize: 14, color: couleurs.texte },
  entete: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: espace(3),
  },
  titre: { fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte },
  sous: {
    marginTop: 4,
    fontFamily: polices.texte,
    fontSize: 14,
    color: couleurs.texteDoux,
  },
  ligne: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espace(2),
  },
  supprimer: {
    paddingHorizontal: 12,
    lineHeight: 44,
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.rouge,
  },
  lien: {
    fontFamily: polices.texte,
    fontSize: 12,
    color: couleurs.texte,
    textDecorationLine: 'underline',
  },
  briefing: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) },
  panneau: {
    flexBasis: 260,
    flexGrow: 1,
    borderRadius: 8,
    padding: 12,
    fontFamily: polices.texte,
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texte,
  },
  raison: {
    marginTop: 2,
    fontFamily: polices.texte,
    fontSize: 11,
    color: couleurs.texteDoux,
  },
});
