import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { LogOut, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { consentements } from '@/data/consentement';
import { useSession } from '@/data/session';
import { accordAttendu, type Consentement } from '@/domain/consentement';
import { demanderSortie } from '@/lib/brouillon';
import { messageErreur } from '@/lib/useCharger';
import { AccesSuspendu } from '@/ui/abonnement';
import { Chargement, Erreur } from '@/ui/composants';
import { AccordDonnees } from '@/ui/consentement';
import { BoutonIcone, EnTete } from '@/ui/coque';
import { LanceurMinuteurs, Minuteurs } from '@/ui/entrainement/minuteurs';
import { EspaceClient, type OngletClient } from '@/ui/espace-client';
import { couleurs, espace, LARGEUR_CLIENT } from '@/ui/theme';

const ONGLETS: OngletClient[] = ['programme', 'historique', 'suivi', 'nutrition', 'documents'];

export default function AccueilClient() {
  const { profil, deconnecter } = useSession();
  const { onglet } = useLocalSearchParams<{ onglet?: string }>();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const accord = useAccord(clientId);
  if (profil?.role !== 'client') return <Redirect href="/" />;
  const initial = ONGLETS.find((o) => o === onglet) ?? 'programme';

  if (profil.suspendu) {
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete largeur={LARGEUR_CLIENT} sousTitre="Mon espace coaching" droite={<BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />} />
        <ScrollView contentContainerStyle={{ padding: espace(4) }}>
          <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
            <AccesSuspendu prenom={profil.prenom} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // RGPD : rien ne s'affiche ni ne s'enregistre avant l'accord du client sur ses données de santé.
  if (accord.donnee === undefined || accordAttendu(accord.donnee)) {
    return (
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete largeur={LARGEUR_CLIENT} sousTitre="Mon espace coaching" droite={<BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={deconnecter} />} />
        <ScrollView contentContainerStyle={{ padding: espace(4), paddingBottom: espace(12) }}>
          <View style={{ width: '100%', maxWidth: LARGEUR_CLIENT, alignSelf: 'center' }}>
            {accord.erreur ? (
              <Erreur message={accord.erreur} onReessayer={accord.recharger} />
            ) : accord.donnee === undefined ? (
              <Chargement />
            ) : (
              <AccordDonnees clientId={profil.clientId} prenom={profil.prenom} onFait={accord.definir} onRefuser={deconnecter} />
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <Minuteurs key={profil.clientId} utilisateurId={profil.clientId}>
      <View style={{ flex: 1, backgroundColor: couleurs.fond }}>
        <EnTete
          largeur={LARGEUR_CLIENT}
          sousTitre="Mon espace coaching"
          droite={
            <>
              <LanceurMinuteurs />
              <BoutonIcone icone={ShieldCheck} nom="Mes données" onPress={() => demanderSortie(() => router.push('/client/donnees'))} />
              <BoutonIcone icone={LogOut} nom="Se déconnecter" onPress={() => demanderSortie(deconnecter)} />
            </>
          }
        />
        <EspaceClient clientId={profil.clientId} prenom={profil.prenom} ongletInitial={initial} />
      </View>
    </Minuteurs>
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
