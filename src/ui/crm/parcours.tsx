// En haut de la fiche : le parcours du contact en trois étapes, chacune avec son bouton.
// 1. Questionnaire (le message part par SMS, WhatsApp ou e-mail, on le voit avant d'envoyer)
// 2. Séance Booster (planifier, préparer, compte rendu)
// 3. Accès à l'appli (création du compte et message avec le mot de passe provisoire)
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { crm } from '@/data/crm';
import type { Booster, FicheContact } from '@/domain/crm';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { couleurs, espace, polices } from '../theme';
import { EtapeAcces, useEtatAcces, BoutonEtape } from './acces';
import { EnvoiMessage, useMessageQuestionnaire } from './commun';

const jourCourt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function ParcoursContact({
  fiche,
  versionAbo,
  onPlanifierBooster,
  onOuvrirBooster,
  onVoirAppli,
}: {
  fiche: FicheContact;
  versionAbo: number;
  onPlanifierBooster: () => void;
  onOuvrirBooster: (b: Booster) => void;
  onVoirAppli: (clientId: string) => void;
}) {
  const { contact, questionnaires, boosters } = fiche;
  const { donnee: lien } = useCharger(() => crm.lienQuestionnaire(), 'lien-questionnaire');
  const message = useMessageQuestionnaire(contact, lien);
  const [envoiQuestionnaire, setEnvoiQuestionnaire] = useState(false);
  const acces = useEtatAcces(contact, versionAbo);

  const recu = questionnaires[0];
  const prevu = boosters.filter((b) => b.statut === 'prevu').sort((a, b) => a.date.localeCompare(b.date))[0];
  const fait = boosters.filter((b) => b.statut === 'fait').sort((a, b) => b.date.localeCompare(a.date))[0];
  const archive = contact.statut === 'archive';
  // Un seul bouton plein : celui de la première étape qui reste à faire. Les autres restent accessibles, en contour.
  const courante = !recu && !prevu && !fait ? 1 : prevu || !fait ? 2 : 3;

  return (
    <View style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 14, padding: 16, gap: espace(4), marginBottom: espace(4) }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>Parcours de {contact.prenom || 'ce contact'}</Text>

      <Etape
        numero={1}
        titre="Questionnaire"
        fait={!!recu}
        detail={recu ? `Reçu le ${jourCourt(recu.recuLe)}` : 'Pas encore reçu'}
      >
        {!recu && !envoiQuestionnaire && (
          <Action courante={courante} etape={1} libelle="Envoyer le questionnaire" desactive={archive || !message} onPress={() => setEnvoiQuestionnaire(true)} />
        )}
        {recu && !envoiQuestionnaire && (
          <Text accessibilityRole="button" onPress={() => setEnvoiQuestionnaire(true)} style={lienDiscret}>
            Le renvoyer
          </Text>
        )}
        {envoiQuestionnaire && message && <EnvoiMessage contact={contact} sujet="Ton questionnaire" message={message} />}
      </Etape>

      <Etape
        numero={2}
        titre="Séance Booster"
        fait={!prevu && !!fait}
        detail={prevu ? `Prévue ${jourCourt(prevu.date)}` : fait ? `Faite ${jourCourt(fait.date)}` : 'Pas encore planifiée'}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
          {prevu ? (
            <Action courante={courante} etape={2} libelle="Préparer le Booster" onPress={() => onOuvrirBooster(prevu)} />
          ) : !fait ? (
            <Action courante={courante} etape={2} libelle="Planifier le Booster" desactive={archive} onPress={onPlanifierBooster} />
          ) : null}
          {fait && (
            <BoutonContour
              libelle="Compte rendu"
              onPress={() => router.push({ pathname: '/coach/compte-rendu/[id]', params: { id: fait.id, contact: fait.contactId } })}
            />
          )}
          {fait && !prevu && <BoutonContour libelle="Nouveau Booster" desactive={archive} onPress={onPlanifierBooster} />}
        </View>
      </Etape>

      <Etape
        numero={3}
        titre="Accès à l’appli"
        fait={acces.etat === 'pret'}
        detail={acces.etat === 'pret' ? 'Son compte est prêt' : acces.etat === 'sans_appli' ? 'Séances seulement' : 'Pas encore créé'}
        dernier
      >
        <EtapeAcces contact={contact} etat={acces.etat} principal={courante === 3} onCree={acces.recharger} onVoirAppli={onVoirAppli} />
      </Etape>
    </View>
  );
}

function Action({ etape, courante, ...props }: { etape: number; courante: number; libelle: string; onPress: () => void; desactive?: boolean }) {
  return etape === courante ? <BoutonEtape {...props} /> : <BoutonContour {...props} />;
}

function Etape({
  numero,
  titre,
  detail,
  fait,
  dernier,
  children,
}: {
  numero: number;
  titre: string;
  detail: string;
  fait: boolean;
  dernier?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: espace(3) }}>
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: fait ? couleurs.vert : couleurs.carte,
            borderWidth: fait ? 0 : 1.5,
            borderColor: couleurs.bordure,
          }}
        >
          {fait ? <Check size={16} color="#FFFFFF" /> : <Text style={{ fontFamily: polices.texteGras, fontSize: 13, color: couleurs.texte }}>{numero}</Text>}
        </View>
        {!dernier && <View style={{ flex: 1, width: 2, marginTop: 4, backgroundColor: couleurs.bordure }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: espace(2), paddingBottom: dernier ? 0 : espace(2) }}>
        <View>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }}>{titre}</Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 13, color: fait ? couleurs.vert : couleurs.texteDoux }}>{detail}</Text>
        </View>
        {children}
      </View>
    </View>
  );
}

const lienDiscret = {
  alignSelf: 'flex-start',
  fontFamily: polices.texte,
  fontSize: 13,
  color: couleurs.texteDoux,
  textDecorationLine: 'underline',
} as const;
