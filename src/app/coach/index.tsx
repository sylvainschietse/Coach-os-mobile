import { Redirect, router, useFocusEffect } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { depot } from '@/data';
import { useSession } from '@/data/session';
import type { ClientResume } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, Ecran, Erreur, Pastille, SousTitre, Texte, Titre } from '@/ui/composants';
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

export default function EspaceCoach() {
  const { profil, deconnecter } = useSession();
  const { width } = useWindowDimensions();
  const large = width >= LARGEUR_LARGE;
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const { donnee: clients, erreur, recharger } = useCharger(() => depot.clientsDuCoach(coachId), coachId);
  const [selection, setSelection] = useState<string>();
  useFocusEffect(recharger);

  if (profil?.role !== 'coach') return <Redirect href="/" />;

  const entete = (
    <>
      <Titre>Bonjour {profil.nom}</Titre>
      {depot.mode === 'demo' && (
        <Texte doux style={{ fontSize: 14 }}>
          Mode démo : les séances faites sur cet appareil apparaissent ici.
        </Texte>
      )}
      {erreur && <Erreur message={erreur} />}
      {!clients && !erreur && <Chargement />}
    </>
  );

  // Ordinateur ou tablette : la liste à gauche, le suivi du client à droite.
  if (large) {
    const choisi = selection ?? clients?.[0]?.id;
    return (
      <View style={styles.colonnes}>
        <ScrollView style={styles.gauche} contentContainerStyle={{ padding: espace(6), gap: espace(4) }}>
          {entete}
          {clients && <ListeClients clients={clients} selection={choisi} onChoisir={(c) => setSelection(c.id)} />}
          <Bouton variante="discret" libelle="Se déconnecter" onPress={deconnecter} />
        </ScrollView>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: espace(6), gap: espace(4), maxWidth: 820 }}>
          {choisi && clients && (
            <>
              <Titre>{clients.find((c) => c.id === choisi)?.prenom}</Titre>
              <DetailClient key={choisi} clientId={choisi} />
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <Ecran>
      {entete}
      {clients && (
        <ListeClients
          clients={clients}
          onChoisir={(c) => router.push({ pathname: '/coach/client/[id]', params: { id: c.id, prenom: c.prenom } })}
        />
      )}
      <Bouton variante="discret" libelle="Se déconnecter" onPress={deconnecter} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  colonnes: { flex: 1, flexDirection: 'row', backgroundColor: couleurs.fond },
  gauche: { width: 400, flexGrow: 0, borderRightWidth: 1, borderRightColor: couleurs.bordure },
});
