// Accès du client à l'appli, en une étape : un appui crée son espace (s'il n'existe pas encore) et son compte,
// puis le message à lui envoyer est prêt, avec l'e-mail et le mot de passe provisoire.
// Avant, il fallait « Préparer l'accès client » dans un menu replié de la liste, puis « Créer son accès » en bas
// de la fiche, et le bouton « Envoyer l'accès client » envoyait un message sans mot de passe.
import { useState } from 'react';
import { Text, View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { aUnAcces, creerAccesClient } from '@/data/acces-client';
import { crm } from '@/data/crm';
import { messageAcces, type AccesClient } from '@/domain/acces-client';
import type { Contact } from '@/domain/crm';
import { adresseWeb } from '@/lib/adresse-web';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { EnvoiMessage, useCoachNom } from './commun';

export const LIEN_APPLI = process.env.EXPO_PUBLIC_LIEN_APPLI || adresseWeb('/');
/** Vidéo de mise en route (public/tuto-coachgo.mp4, publiée avec le site web). */
export const LIEN_TUTO = process.env.EXPO_PUBLIC_LIEN_TUTO || adresseWeb('/tuto-coachgo.mp4');

export type EtatAcces = 'sans_appli' | 'pret' | 'a_faire';

/** Où en est l'accès du client : utile au titre de l'étape. */
export function useEtatAcces(contact: Contact, versionAbo = 0) {
  const { donnee: dejaAcces, recharger } = useCharger(
    () => (contact.clientId ? aUnAcces(contact.clientId) : Promise.resolve(false)),
    `acces-${contact.clientId ?? ''}`,
  );
  // Client « séances seulement » : pas de compte à créer tant que l'accès appli n'est pas coché dans son abonnement.
  const { donnee: abo } = useCharger(
    () => (contact.clientId ? abonnements.lire(contact.clientId) : Promise.resolve(null)),
    `${contact.clientId ?? ''}:${versionAbo}`,
  );
  const etat: EtatAcces = abo && !abo.accesAppli ? 'sans_appli' : dejaAcces ? 'pret' : 'a_faire';
  return { etat, recharger };
}

export function EtapeAcces({
  contact,
  etat,
  principal = true,
  onCree,
  onVoirAppli,
}: {
  contact: Contact;
  etat: EtatAcces;
  /** Faux tant qu'une étape plus tôt dans le parcours reste à faire : le bouton passe en contour. */
  principal?: boolean;
  onCree: () => void;
  onVoirAppli?: (clientId: string) => void;
}) {
  const coach = useCoachNom();
  const [acces, setAcces] = useState<AccesClient>();
  const [erreur, setErreur] = useState<string>();
  const [envoi, setEnvoi] = useState(false);
  const archive = contact.statut === 'archive';

  async function creer() {
    setErreur(undefined);
    setEnvoi(true);
    try {
      // Prospect : on ouvre d'abord son espace client (même règle que « Passer en client »).
      if (!contact.clientId) await crm.preparerAcces(contact.id);
      setAcces(await creerAccesClient(contact.id, contact.email ?? ''));
      onCree();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de créer son accès.');
    } finally {
      setEnvoi(false);
    }
  }

  if (acces)
    return (
      <View style={{ gap: espace(2) }}>
        <Texte doux style={{ fontSize: 13 }}>
          Envoie-le-lui maintenant : ce mot de passe provisoire ne sera plus affiché. À sa première connexion, {contact.prenom || 'ton client'} choisira le
          sien.
        </Texte>
        <EnvoiMessage contact={contact} sujet="Ton accès à CoachGo" message={messageAcces(contact.prenom, coach, acces, LIEN_APPLI, LIEN_TUTO)} />
      </View>
    );

  if (etat === 'sans_appli')
    return <Texte doux style={{ fontSize: 13 }}>Formule « séances seulement » : coche l’accès appli dans son abonnement pour lui créer un compte.</Texte>;

  return (
    <View style={{ gap: espace(2) }}>
      {!contact.email && (
        <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>
          Ajoute d’abord son e-mail dans les coordonnées ci-dessous : ce sera son identifiant.
        </Text>
      )}
      {erreur && <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge }}>{erreur}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
        {etat === 'pret' ? (
          <BoutonContour libelle={envoi ? 'Création…' : 'Renvoyer un mot de passe provisoire'} desactive={envoi || archive} onPress={creer} />
        ) : (
          (() => {
            const Bouton = principal ? BoutonEtape : BoutonContour;
            return <Bouton libelle={envoi ? 'Création…' : 'Créer et envoyer son accès'} desactive={envoi || archive || !contact.email} onPress={creer} />;
          })()
        )}
        {contact.clientId && onVoirAppli && <BoutonContour libelle="Voir son appli" onPress={() => onVoirAppli(contact.clientId!)} />}
      </View>
    </View>
  );
}

/** Le bouton de l'étape à faire : plein, rouge, un seul par écran autant que possible. */
export function BoutonEtape({ libelle, onPress, desactive }: { libelle: string; onPress: () => void; desactive?: boolean }) {
  return (
    <Text
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      onPress={desactive ? undefined : onPress}
      style={{
        minHeight: 44,
        lineHeight: 44,
        paddingHorizontal: 16,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: couleurs.rouge,
        opacity: desactive ? 0.45 : 1,
        color: '#FFFFFF',
        fontFamily: polices.texteMoyen,
        fontSize: 14,
        textAlign: 'center',
      }}
    >
      {libelle}
    </Text>
  );
}
