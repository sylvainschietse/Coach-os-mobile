import { Redirect, router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { depot } from '@/data';
import { ecouterCrm } from '@/data/crm';
import { useSession } from '@/data/session';
import type { ClientResume } from '@/domain/types';
import { useCharger, useRechargerSur } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, Ecran, Erreur, Pastille, Puce, Puces, SousTitre, Texte, Titre } from '@/ui/composants';
import { Contacts } from '@/ui/crm/contacts';
import { FicheContactVue } from '@/ui/crm/fiche';
import { Journee } from '@/ui/crm/journee';
import { DetailClient } from '@/ui/detail-client';
import { couleurs, espace, LARGEUR_LARGE } from '@/ui/theme';

const quand = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

function ListeClients({
  clients,
  selection,
  onChoisir,
}: {
  clients: ClientResume[];
  selection?: string;
  onChoisir: (c: ClientResume) => void;
}) {
  return (
    <View style={{ gap: espace(3) }}>
      {clients.map((c) => (
        <Pressable key={c.id} onPress={() => onChoisir(c)}>
          <Carte style={selection === c.id ? { borderColor: couleurs.rouge, borderWidth: 2 } : undefined}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <SousTitre>
                {c.prenom} {c.nom}
              </SousTitre>
              {c.derniereSeance && <Pastille libelle={quand(c.derniereSeance.fin)} couleur={couleurs.vert} />}
            </View>
            <Texte doux style={{ fontSize: 14 }}>
              {c.derniereSeance ? `Dernière séance : ${c.derniereSeance.titre}` : 'Pas encore de séance réalisée'}
            </Texte>
            {c.derniereSeance?.commentaire && (
              <Texte style={{ fontSize: 14 }} >« {c.derniereSeance.commentaire} »</Texte>
            )}
          </Carte>
        </Pressable>
      ))}
    </View>
  );
}

type Onglet = 'journee' | 'contacts' | 'clients';
type Selection = { type: 'contact' | 'client'; id: string } | undefined;

const ONGLETS: { cle: Onglet; libelle: string }[] = [
  { cle: 'journee', libelle: 'Aujourd’hui' },
  { cle: 'contacts', libelle: 'Contacts' },
  { cle: 'clients', libelle: 'Clients' },
];

export default function EspaceCoach() {
  const { profil, deconnecter } = useSession();
  const { width } = useWindowDimensions();
  const large = width >= LARGEUR_LARGE;
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const { donnee: clients, erreur, recharger } = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  const [onglet, setOnglet] = useState<Onglet>('journee');
  const [selection, setSelection] = useState<Selection>();
  useFocusEffect(recharger);
  useRechargerSur(recharger, ecouterCrm);

  if (profil?.role !== 'coach') return <Redirect href="/" />;

  // Ordinateur ou tablette : la liste à gauche, la fiche à droite. Téléphone : on ouvre un nouvel écran.
  const ouvrirContact = (id: string) =>
    large ? setSelection({ type: 'contact', id }) : router.push({ pathname: '/coach/contact/[id]', params: { id } });
  const ouvrirClient = (id: string, prenom: string) => {
    if (large) {
      setOnglet('clients');
      setSelection({ type: 'client', id });
    } else router.push({ pathname: '/coach/client/[id]', params: { id, prenom } });
  };
  const voirQuestionnaire = (lien: string) => router.push({ pathname: '/questionnaire/[lien]', params: { lien } });

  const liste = (
    <>
      <Titre>Bonjour {profil.nom}</Titre>
      {depot.mode === 'demo' && (
        <Texte doux style={{ fontSize: 14 }}>
          Mode démo : contacts fictifs, tout reste sur cet appareil.
        </Texte>
      )}
      <Puces>
        {ONGLETS.map((o) => (
          <Puce key={o.cle} libelle={o.libelle} actif={onglet === o.cle} onPress={() => setOnglet(o.cle)} />
        ))}
      </Puces>
      {onglet === 'journee' && <Journee onOuvrirContact={ouvrirContact} onVoirQuestionnaire={voirQuestionnaire} />}
      {onglet === 'contacts' && (
        <Contacts selection={selection?.type === 'contact' ? selection.id : undefined} onOuvrir={ouvrirContact} />
      )}
      {onglet === 'clients' && (
        <>
          {erreur && <Erreur message={erreur} />}
          {!clients && !erreur && <Chargement />}
          {clients && (
            <ListeClients
              clients={clients}
              selection={selection?.type === 'client' ? selection.id : undefined}
              onChoisir={(c) => ouvrirClient(c.id, c.prenom)}
            />
          )}
        </>
      )}
      <Bouton variante="discret" libelle="Se déconnecter" onPress={deconnecter} />
    </>
  );

  if (!large) return <Ecran>{liste}</Ecran>;

  const clientChoisi = selection?.type === 'client' ? clients?.find((c) => c.id === selection.id) : undefined;
  return (
    <View style={styles.colonnes}>
      <ScrollView style={styles.gauche} contentContainerStyle={{ padding: espace(6), gap: espace(4) }}>
        {liste}
      </ScrollView>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: espace(6), gap: espace(4), maxWidth: 820 }}>
        {selection?.type === 'contact' && (
          <FicheContactVue key={selection.id} id={selection.id} onVoirClient={ouvrirClient} />
        )}
        {selection?.type === 'client' && (
          <>
            <Titre>{clientChoisi?.prenom ?? 'Client'}</Titre>
            <DetailClient key={selection.id} clientId={selection.id} />
          </>
        )}
        {!selection && <Texte doux>Choisis un contact ou un client pour voir sa fiche.</Texte>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  colonnes: { flex: 1, flexDirection: 'row', backgroundColor: couleurs.fond },
  gauche: { width: 400, flexGrow: 0, borderRightWidth: 1, borderRightColor: couleurs.bordure },
});
