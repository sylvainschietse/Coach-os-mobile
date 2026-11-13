import { Redirect, useLocalSearchParams } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { consentements } from '@/data/consentement';
import { useSession } from '@/data/session';
import { accordAttendu, type Consentement } from '@/domain/consentement';
import { messageErreur } from '@/lib/useCharger';
import { AccesSuspendu } from '@/ui/abonnement';
import { DefilementClavier } from '@/ui/clavier';
import { Chargement, Erreur } from '@/ui/composants';
import { AccordDonnees } from '@/ui/consentement';
import { BoutonIcone, EnTete } from '@/ui/coque';
import { Minuteurs } from '@/ui/entrainement/minuteurs';
import { EspaceClient, UNIVERS_CLIENT, type OngletClient } from '@/ui/espace-client';
import { BoutonMessagesClient } from '@/ui/messagerie/conversation';
import { ClocheClient, useRappelsClient } from '@/ui/notifications/rappels';
import { couleurs, espace, LARGEUR_CLIENT, polices, univers } from '@/ui/theme';

// « moi » reste accepté : un ancien lien ou une notification qui le demande ouvre Mon compte.
const ONGLETS: OngletClient[] = ['accueil', 'programme', 'suivi', 'nutrition', 'moi'];

export default function AccueilClient() {
  const { profil, deconnecter } = useSession();
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const accord = useAccord(clientId);
  const [ouvert, setOuvert] = useState<OngletClient>('accueil');
  // Chaque toucher du logo demande l'accueil, même si on y était déjà passé.
  const [versAccueil, setVersAccueil] = useState(0);
  // Chaque toucher de l'avatar ouvre Mon compte.
  const [versCompte, setVersCompte] = useState(0);
  // Rappels et notifications : seulement une fois l'accord RGPD donné, et l'accès ouvert.
  const pretPourRappels = profil?.role === 'client' && !profil.suspendu && !!accord.donnee && !accordAttendu(accord.donnee);
  useRappelsClient(pretPourRappels ? clientId : '', profil?.role === 'client' ? profil.prenom : '');
  if (profil?.role !== 'client') return <Redirect href="/" />;
  const initial = ONGLETS.find((o) => o === onglet) ?? 'accueil';

  if (profil.suspendu) {
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete largeur={LARGEUR_CLIENT} sousTitre="Mon espace coaching" droite={<BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />} />
        <DefilementClavier contentContainerStyle={{ padding: espace(4) }}>
          <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
            <AccesSuspendu prenom={profil.prenom} />
          </View>
        </DefilementClavier>
      </View>
    );
  }

  // RGPD : rien ne s'affiche ni ne s'enregistre avant l'accord du client sur ses données de santé.
  if (accord.donnee === undefined || accordAttendu(accord.donnee)) {
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete largeur={LARGEUR_CLIENT} sousTitre="Mon espace coaching" droite={<BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />} />
        <DefilementClavier contentContainerStyle={{ padding: espace(4), paddingBottom: espace(12) }}>
          <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
            {accord.erreur ? (
              <Erreur message={accord.erreur} onReessayer={accord.recharger} />
            ) : accord.donnee === undefined ? (
              <Chargement />
            ) : (
              <AccordDonnees clientId={profil.clientId} prenom={profil.prenom} onFait={accord.definir} onRefuser={deconnecter} />
            )}
          </View>
        </DefilementClavier>
      </View>
    );
  }

  return (
    <Minuteurs key={profil.clientId} utilisateurId={profil.clientId}>
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete
          largeur={LARGEUR_CLIENT}
          sousTitre="Mon espace coaching"
          univers={univers[UNIVERS_CLIENT[ouvert]]}
          onLogo={() => setVersAccueil((n) => n + 1)}
          droite={
            <>
              <ClocheClient clientId={profil.clientId} prenom={profil.prenom} />
              <BoutonMessagesClient clientId={profil.clientId} />
              <Avatar prenom={profil.prenom} actif={ouvert === 'moi'} onPress={() => setVersCompte((n) => n + 1)} />
            </>
          }
        />
        <EspaceClient
          clientId={profil.clientId}
          prenom={profil.prenom}
          ongletInitial={initial}
          versAccueil={versAccueil}
          versCompte={versCompte}
          onOnglet={setOuvert}
          onDeconnecter={deconnecter}
        />
      </View>
    </Minuteurs>
  );
}

/** L'initiale du client : un appui ouvre Mon compte (coordonnées, formule, factures, déconnexion). */
function Avatar({ prenom, actif, onPress }: { prenom: string; actif: boolean; onPress: () => void }) {
  const initiale = prenom.trim().charAt(0).toUpperCase() || '?';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mon compte"
      onPress={onPress}
      hitSlop={6}
      style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: actif ? '#FFFFFF' : couleurs.rouge,
          borderWidth: 2,
          borderColor: 'rgba(255,255,255,0.6)',
        }}
      >
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: actif ? couleurs.rouge : '#FFFFFF' }}>{initiale}</Text>
      </View>
    </Pressable>
  );
}

/** undefined : en cours de lecture ; null : aucun accord encore donné. */
function useAccord(clientId: string) {
  const [donnee, setDonnee] = useState<Consentement | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!clientId) return;
    let annule = false;
    consentements.lire(clientId).then(
      (c) => !annule && setDonnee(c),
      (e: unknown) => !annule && setErreur(messageErreur(e)),
    );
    return () => {
      annule = true;
    };
  }, [clientId, version]);

  const recharger = useCallback(() => {
    setErreur(null);
    setVersion((v) => v + 1);
  }, []);
  return { donnee, erreur, recharger, definir: setDonnee };
}
