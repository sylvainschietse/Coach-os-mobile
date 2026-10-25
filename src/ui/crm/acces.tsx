import { useState } from 'react';
import { Text, View } from 'react-native';

import { aUnAcces, creerAccesClient } from '@/data/acces-client';
import { supabase } from '@/data/supabase';
import { messageAcces, type AccesClient } from '@/domain/acces-client';
import type { Contact } from '@/domain/crm';
import { adresseWeb } from '@/lib/adresse-web';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, SousTitre, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { BoutonsEnvoi, useCoachNom } from './commun';

const LIEN_APPLI = process.env.EXPO_PUBLIC_LIEN_APPLI || adresseWeb('/');

/** Donne au client son propre compte : il ne verra que ses séances et son suivi. */
export function AccesAppli({ contact }: { contact: Contact }) {
  const coach = useCoachNom();
  const { donnee: dejaAcces, recharger } = useCharger(() => aUnAcces(contact.clientId!), contact.clientId ?? '');
  const [acces, setAcces] = useState<AccesClient>();
  const [erreur, setErreur] = useState<string>();
  const [envoi, setEnvoi] = useState(false);

  async function creer() {
    setErreur(undefined);
    setEnvoi(true);
    try {
      setAcces(await creerAccesClient(contact.id, contact.email ?? ''));
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de créer son accès.');
    } finally {
      setEnvoi(false);
    }
  }

  if (!supabase) {
    return (
      <Carte>
        <SousTitre>Accès à l’appli</SousTitre>
        <Texte doux style={{ fontSize: 14 }}>En démo, les clients se choisissent sur l’écran d’accueil. Avec la vraie base, tu crées ici le compte de {contact.prenom}.</Texte>
      </Carte>
    );
  }

  if (acces) {
    return (
      <Carte>
        <SousTitre>Accès prêt pour {contact.prenom}</SousTitre>
        <View style={{ backgroundColor: couleurs.fond, borderRadius: 12, padding: espace(3), gap: espace(1) }}>
          <Texte style={{ fontSize: 14 }}>E-mail : {acces.email}</Texte>
          <Text selectable style={{ fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte }}>
            {acces.motDePasse}
          </Text>
        </View>
        <Texte doux style={{ fontSize: 13 }}>
          Envoie-le-lui maintenant : ce mot de passe provisoire ne sera plus affiché. À sa première connexion, {contact.prenom} choisira le sien.
        </Texte>
        <BoutonsEnvoi contact={contact} message={messageAcces(contact.prenom, coach, acces, LIEN_APPLI)} />
      </Carte>
    );
  }

  return (
    <Carte>
      <SousTitre>Accès à l’appli</SousTitre>
      {dejaAcces ? (
        <Texte style={{ fontSize: 14 }}>
          {contact.prenom} a déjà son compte. S’il a oublié son mot de passe, crée-lui un nouveau mot de passe provisoire.
        </Texte>
      ) : (
        <Texte style={{ fontSize: 14 }}>
          Crée son compte pour qu’il retrouve ses séances sur son téléphone. Il ne verra que ses propres données.
        </Texte>
      )}
      {!contact.email && <Texte doux style={{ fontSize: 13 }}>Ajoute d’abord son e-mail dans ses coordonnées.</Texte>}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
      <Bouton
        variante={dejaAcces ? 'secondaire' : 'primaire'}
        libelle={dejaAcces ? 'Nouveau mot de passe provisoire' : 'Créer son accès'}
        onPress={creer}
        chargement={envoi}
        desactive={!contact.email}
      />
    </Carte>
  );
}
