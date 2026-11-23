// Activités du client en dehors des séances du programme : marche, course, cours collectif, séance de muscu à lui…
// qu'il les ait saisies lui-même ou qu'elles viennent de sa montre (Health Connect, Apple Santé). Montrées à côté
// des séances du programme, chez le coach (suivi d'entraînement, réalisé) comme chez le client (son programme).
import { useState } from 'react';
import { Text, View } from 'react-native';

import { activites } from '@/data/activites';
import type { Activite } from '@/domain/activites';
import { useCharger } from '@/lib/useCharger';

import { Action, ts } from '../entrainement/commun';
import { couleurs } from '../theme';
import { LigneActivite } from './sport';

const PAR_PAGE = 10;

/** Activités du client, des plus récentes aux plus anciennes (la table peut manquer si la base n'est pas à jour). */
export function useActivitesClient(clientId: string) {
  return useCharger(() => (clientId ? activites.liste(clientId, 200).catch(() => [] as Activite[]) : Promise.resolve([] as Activite[])), `activites-client-${clientId}`);
}

export function ActivitesHorsProgramme({
  liste,
  proprietaire,
  titre = 'Activités hors programme',
}: {
  liste: Activite[] | null;
  /** Le client sur son téléphone (« Ajoutée par toi ») ; sinon le coach (« Saisie par le client »). */
  proprietaire: boolean;
  titre?: string;
}) {
  const [nb, setNb] = useState(PAR_PAGE);
  if (!liste) return null;
  return (
    <View style={[ts.carte, { gap: 4 }]}>
      <Text style={ts.titreSection}>{titre}</Text>
      <Text style={ts.doux}>
        {proprietaire
          ? 'Ce que tu fais en plus de ton programme : activités ajoutées et séances de ta montre.'
          : 'Ce que le client fait en plus du programme : activités qu’il a ajoutées et séances de sa montre.'}
      </Text>
      {liste.length === 0 ? (
        <Text style={[ts.texte, { color: couleurs.texteDoux, paddingTop: 8 }]}>Aucune activité pour l’instant.</Text>
      ) : (
        <>
          {liste.slice(0, nb).map((a) => (
            <LigneActivite key={a.id} a={a} proprietaire={proprietaire} />
          ))}
          {liste.length > nb && (
            <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
              <Action petit variante="contour" libelle={`Voir plus (${liste.length - nb})`} onPress={() => setNb(nb + PAR_PAGE)} />
            </View>
          )}
        </>
      )}
    </View>
  );
}
