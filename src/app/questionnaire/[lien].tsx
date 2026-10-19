import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { normaliserEmail, normaliserTelephone } from '@/domain/crm';
import { QUESTIONNAIRE, verifierReponses } from '@/domain/questionnaire';
import { Bouton, Carte, ChampTexte, Ecran, Erreur, Puce, Puces, Texte, Titre } from '@/ui/composants';
import { couleurs, espace, polices } from '@/ui/theme';

/** Questionnaire d'accueil ouvert sans compte : ce que remplit un prospect avant sa première séance. */
export default function QuestionnaireAccueil() {
  const { lien } = useLocalSearchParams<{ lien: string }>();
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [envoye, setEnvoye] = useState(false);

  const repondre = (id: string, v: string) => {
    setReponses((r) => ({ ...r, [id]: v }));
    if (erreurs[id]) setErreurs(({ [id]: _, ...reste }) => reste);
  };

  async function envoyer() {
    const trouvees = verifierReponses(reponses, { telephone: normaliserTelephone, email: normaliserEmail });
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) {
      setErreur('Il manque quelques réponses, elles sont signalées en rouge.');
      return;
    }
    setEnvoi(true);
    setErreur(undefined);
    try {
      const propres = Object.fromEntries(Object.entries(reponses).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      await crm.soumettreQuestionnaire(lien, propres);
      setEnvoye(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible, réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  }

  if (envoye) {
    return (
      <Ecran>
        <Stack.Screen options={{ title: 'Merci !' }} />
        <Titre>Merci {reponses.prenom} !</Titre>
        <Texte>Tes réponses sont bien arrivées chez ton coach. Il revient vers toi très vite pour caler ta première séance.</Texte>
      </Ecran>
    );
  }

  return (
    <Ecran>
      <Stack.Screen options={{ title: 'Questionnaire d’accueil' }} />
      <Titre>Faisons connaissance</Titre>
      <Texte doux>Quelques minutes pour que ta première séance soit vraiment adaptée à toi.</Texte>
      {QUESTIONNAIRE.map((section) => (
        <Carte key={section.titre}>
          <Text style={{ fontFamily: polices.texteGras, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 1 }}>
            {section.titre}
          </Text>
          {section.questions.map((q) =>
            q.type === 'choix' ? (
              <View key={q.id} style={{ gap: espace(2) }}>
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>
                  {q.libelle}
                  {q.obligatoire ? ' *' : ''}
                </Text>
                <Puces>
                  {q.options!.map((o) => (
                    <Puce key={o} libelle={o} actif={reponses[q.id] === o} onPress={() => repondre(q.id, o)} />
                  ))}
                </Puces>
                {erreurs[q.id] && <Text style={{ color: couleurs.rouge, fontFamily: polices.texteMoyen, fontSize: 13 }}>{erreurs[q.id]}</Text>}
              </View>
            ) : (
              <ChampTexte
                key={q.id}
                libelle={`${q.libelle}${q.obligatoire ? ' *' : ''}`}
                valeur={reponses[q.id] ?? ''}
                onChange={(v) => repondre(q.id, v)}
                multiligne={q.type === 'long'}
                type={q.type === 'telephone' ? 'telephone' : q.type === 'email' ? 'email' : 'texte'}
                placeholder={q.type === 'date' ? 'jj/mm/aaaa' : undefined}
                aide={q.aide}
                erreur={erreurs[q.id]}
              />
            ),
          )}
        </Carte>
      ))}
      {erreur && <Erreur message={erreur} />}
      <Bouton libelle="Envoyer mes réponses" onPress={envoyer} chargement={envoi} />
      <Texte doux style={{ fontSize: 12, textAlign: 'center' }}>
        Tes réponses ne sont visibles que par ton coach.
      </Texte>
    </Ecran>
  );
}
