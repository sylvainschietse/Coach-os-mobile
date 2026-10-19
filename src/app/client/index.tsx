import { Redirect, router, useFocusEffect } from 'expo-router';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { envoyerEnAttente } from '@/data/file-envoi';
import { useSession } from '@/data/session';
import { useCharger } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, Ecran, Erreur, Pastille, SousTitre, Texte, Titre } from '@/ui/composants';
import { couleurs, espace } from '@/ui/theme';

const dateCourte = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function SeancesClient() {
  const { profil, deconnecter } = useSession();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const { donnee: seances, erreur, recharger } = useCharger(() => depot.seancesDuClient(clientId), clientId);
  const attente = useCharger(() => envoyerEnAttente(), clientId);
  useFocusEffect(recharger);
  useFocusEffect(attente.recharger);

  if (profil?.role !== 'client') return <Redirect href="/" />;

  return (
    <Ecran>
      <Titre>Bonjour {profil.prenom}</Titre>
      {!!attente.donnee && (
        <Carte style={{ borderColor: couleurs.rouge }}>
          <Texte>
            {attente.donnee === 1 ? '1 séance attend' : `${attente.donnee} séances attendent`} le réseau. Elle sera
            envoyée à ton coach automatiquement, rien n’est perdu.
          </Texte>
        </Carte>
      )}
      {erreur && <Erreur message={erreur} />}
      {!seances && !erreur && <Chargement />}
      {seances?.length === 0 && <Texte doux>Ton coach ne t’a pas encore attribué de séance.</Texte>}
      {seances?.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/client/seance/${s.id}`)}>
          <Carte>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <SousTitre>{s.titre}</SousTitre>
              {s.derniereRealisation ? (
                <Pastille libelle="Faite" couleur={couleurs.vert} />
              ) : (
                <Pastille libelle="À faire" couleur={couleurs.rouge} />
              )}
            </View>
            <Texte doux>
              {s.nbExercices} exercices
              {s.derniereRealisation ? ` · dernière fois ${dateCourte(s.derniereRealisation)}` : ''}
            </Texte>
          </Carte>
        </Pressable>
      ))}
      <View style={{ gap: espace(3), marginTop: espace(4) }}>
        <Bouton variante="secondaire" libelle="Minuteur d’intervalles" onPress={() => router.push('/client/minuteur')} />
        <Bouton variante="discret" libelle="Se déconnecter" onPress={deconnecter} />
      </View>
    </Ecran>
  );
}
