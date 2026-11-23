import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { crm } from '@/data/crm';
import { VERSION_POLITIQUE } from '@/domain/consentement';
import { normaliserEmail, normaliserTelephone } from '@/domain/crm';
import {
  ACCUEIL,
  estVisible,
  lireChoix,
  MERCI,
  nettoyerReponses,
  QUESTIONNAIRE,
  SEPARATEUR,
  TITRE_QUESTIONNAIRE,
  verifierReponses,
  type Question,
} from '@/domain/questionnaire';
import { Bouton, Carte, ChampTexte, Ecran, Erreur, Puce, Puces, Texte, Titre } from '@/ui/composants';
import { LienPolitique } from '@/ui/consentement';
import { CaseACocher } from '@/ui/crm/dossier';
import { Lock } from '@/ui/icones';
import { Kicker, Marque, SCENE_PROSPECT, SUR_SCENE } from '@/ui/offres/page-prospect';
import { couleurs, espace, espacementTitre, nuit, polices } from '@/ui/theme';
import { etatA11y } from '@/lib/accessibilite';

const normaliser = { telephone: normaliserTelephone, email: normaliserEmail };

/** Bilan d'accueil ouvert sans compte, page par page comme sur Tally : ce que remplit un prospect avant sa première séance. */
export default function QuestionnaireAccueil() {
  const { lien } = useLocalSearchParams<{ lien: string }>();
  // -1 : page d'accueil ; ensuite l'indice de la section affichée.
  const [page, setPage] = useState(-1);
  const [reponses, setReponses] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [envoye, setEnvoye] = useState(false);
  const [accord, setAccord] = useState(false);

  const repondre = (id: string, v: string) => {
    setReponses((r) => ({ ...r, [id]: v }));
    if (erreurs[id]) setErreurs(({ [id]: _, ...reste }) => reste);
  };

  const section = QUESTIONNAIRE[page];
  const derniere = page === QUESTIONNAIRE.length - 1;

  async function suivant() {
    const trouvees = verifierReponses(reponses, normaliser, section);
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) {
      setErreur('Il manque quelques réponses, elles sont signalées en rouge.');
      return;
    }
    setErreur(undefined);
    if (!derniere) {
      setPage(page + 1);
      return;
    }
    if (!accord) {
      setErreur('Coche la case d’accord pour envoyer tes réponses à ton coach.');
      return;
    }
    setEnvoi(true);
    try {
      // RGPD : l'accord sur les données de santé est gardé avec les réponses, daté, avec la version de la politique.
      const _consentement = `${new Date().toISOString()} · politique ${VERSION_POLITIQUE}`;
      await crm.soumettreQuestionnaire(lien, { ...nettoyerReponses(reponses), _consentement });
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
        <Titre>✅ Merci {reponses.prenom} !</Titre>
        {MERCI.map((p) => (
          <Texte key={p}>{p}</Texte>
        ))}
      </Ecran>
    );
  }

  if (!section) {
    return (
      // Accueil plein écran aux couleurs de CoachGo, comme la page d'offre (audit design, point 1).
      <SafeAreaView style={[SCENE_PROSPECT, { flex: 1 }]}>
        <Stack.Screen options={{ headerShown: false, title: TITRE_QUESTIONNAIRE }} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 28, justifyContent: 'space-between', gap: 40 }}>
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <Marque />
          </View>
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center', gap: 22 }}>
            <View style={{ gap: 10 }}>
              <Kicker>Bienvenue</Kicker>
              <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 54, lineHeight: 52, letterSpacing: espacementTitre(54), color: SUR_SCENE.texte }}>
                {TITRE_QUESTIONNAIRE}
              </Text>
              <Text style={{ fontFamily: polices.texte, fontSize: 17, lineHeight: 25, color: nuit.texteClair }}>{ACCUEIL}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Lock size={18} color={SUR_SCENE.kicker} />
              <Text style={{ fontFamily: polices.texte, fontSize: 14, color: SUR_SCENE.doux }}>Tes réponses ne sont visibles que par ton coach.</Text>
            </View>
          </View>
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>
            <Bouton libelle="Commencer mon bilan" onPress={() => setPage(0)} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const visibles = section.questions.filter((q) => estVisible(q, reponses));
  return (
    // La clé remonte l'écran à chaque page, ce qui le ramène en haut.
    <Ecran key={page}>
      <Stack.Screen options={{ title: TITRE_QUESTIONNAIRE }} />
      <Progression page={page} />
      <Titre>{section.titre}</Titre>
      {section.intro && <Texte doux>{section.intro}</Texte>}
      <Carte style={{ gap: espace(5) }}>
        {visibles.map((q, i) => {
          const titreRubrique = q.rubrique !== visibles[i - 1]?.rubrique ? q.rubrique : undefined;
          return (
            <View key={q.id} style={{ gap: espace(3) }}>
              {titreRubrique && (
                <Text style={{ fontFamily: polices.texteGras, fontSize: 17, color: couleurs.noir, marginTop: espace(2) }}>{titreRubrique}</Text>
              )}
              <ChampQuestion question={q} valeur={reponses[q.id] ?? ''} erreur={erreurs[q.id]} onChange={(v) => repondre(q.id, v)} />
            </View>
          );
        })}
      </Carte>
      {derniere && (
        <View style={{ gap: espace(2) }}>
          <CaseACocher
            libelle="J’accepte que mes réponses, dont celles sur ma santé, soient transmises à mon coach et gardées pour mon coaching."
            valeur={accord}
            onChange={setAccord}
          />
          <LienPolitique />
        </View>
      )}
      {erreur && <Erreur message={erreur} />}
      <Bouton libelle={derniere ? 'Envoyer mes réponses' : 'Suivant'} onPress={suivant} chargement={envoi} />
      <Bouton
        variante="discret"
        libelle="Retour"
        onPress={() => {
          setErreurs({});
          setErreur(undefined);
          setPage(page - 1);
        }}
      />
    </Ecran>
  );
}

function Progression({ page }: { page: number }) {
  return (
    <View style={{ gap: espace(1.5) }}>
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texteDoux }}>
        Étape {page + 1} sur {QUESTIONNAIRE.length}
      </Text>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {QUESTIONNAIRE.map((s, i) => (
          <View key={s.titre} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= page ? couleurs.rouge : couleurs.bordure }} />
        ))}
      </View>
    </View>
  );
}

function Libelle({ question }: { question: Question }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>
        {question.libelle}
        {question.obligatoire ? ' *' : ''}
      </Text>
      {question.aide && <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>{question.aide}</Text>}
    </View>
  );
}

function ChampQuestion({ question: q, valeur, erreur, onChange }: { question: Question; valeur: string; erreur?: string; onChange: (v: string) => void }) {
  const messageErreur = erreur && <Text style={{ color: couleurs.rouge, fontFamily: polices.texteMoyen, fontSize: 13 }}>{erreur}</Text>;

  if (q.type === 'choix' || q.type === 'choixMultiple') {
    const choisis = lireChoix(valeur);
    const basculer = (o: string) =>
      onChange(q.options!.filter((x) => (x === o ? !choisis.includes(o) : choisis.includes(x))).join(SEPARATEUR));
    return (
      <View style={{ gap: espace(2) }}>
        <Libelle question={q} />
        {q.type === 'choixMultiple' && <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>Plusieurs réponses possibles</Text>}
        <Puces>
          {q.options!.map((o) =>
            q.type === 'choix' ? (
              <Puce key={o} libelle={o} actif={valeur === o} onPress={() => onChange(o)} />
            ) : (
              <Puce key={o} libelle={choisis.includes(o) ? `✓ ${o}` : o} actif={choisis.includes(o)} onPress={() => basculer(o)} />
            ),
          )}
        </Puces>
        {messageErreur}
      </View>
    );
  }

  if (q.type === 'echelle') {
    return (
      <View style={{ gap: espace(2) }}>
        <Libelle question={q} />
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {Array.from({ length: 11 }, (_, n) => String(n)).map((n) => {
            const actif = valeur === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`${n} sur 10`}
                {...etatA11y({ selected: actif })}
                onPress={() => onChange(n)}
                style={{
                  flex: 1,
                  height: 40,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: actif ? couleurs.noir : couleurs.bordure,
                  backgroundColor: actif ? couleurs.noir : couleurs.carte,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: actif ? couleurs.blanc : couleurs.texte }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>0</Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux }}>10</Text>
        </View>
        {messageErreur}
      </View>
    );
  }

  return (
    <ChampTexte
      libelle={`${q.libelle}${q.obligatoire ? ' *' : ''}`}
      valeur={valeur}
      onChange={onChange}
      multiligne={q.type === 'long'}
      type={q.type === 'telephone' ? 'telephone' : q.type === 'email' ? 'email' : 'texte'}
      placeholder={q.type === 'date' ? 'jj/mm/aaaa' : q.placeholder}
      aide={q.aide}
      erreur={erreur}
    />
  );
}
