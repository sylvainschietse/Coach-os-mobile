// Dictée vocale : le coach parle au lieu d'écrire. La reconnaissance du téléphone (ou du navigateur) transcrit en
// français ; le texte dicté s'ajoute à ce qui est déjà écrit, et reste modifiable au clavier.
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { Mic, Square } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, Text } from 'react-native';

import { couleurs, polices } from './theme';

// Une seule dictée à la fois : les événements arrivent à tous les boutons affichés, seul celui qui l'a lancée les lit.
let proprietaire = 0;
let compteur = 0;

const disponible = () => {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch {
    return false;
  }
};

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Autorise le micro dans les réglages du téléphone pour dicter.',
  'no-speech': 'Je n’ai rien entendu. Réessaie en parlant près du téléphone.',
  network: 'La dictée a besoin d’une connexion internet.',
  'language-not-supported': 'Le français n’est pas disponible pour la dictée sur cet appareil.',
};

export function BoutonDictee({ valeur, onChange, desactive }: { valeur: string; onChange: (v: string) => void; desactive?: boolean }) {
  const id = useRef(++compteur).current;
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState('');
  const base = useRef('');
  const actif = () => proprietaire === id;

  useSpeechRecognitionEvent('result', (e) => {
    if (!actif()) return;
    const dit = e.results[0]?.transcript?.trim() ?? '';
    const texte = [base.current, dit].filter(Boolean).join(' ');
    if (dit) onChange(texte);
    if (e.isFinal) base.current = texte;
  });
  useSpeechRecognitionEvent('end', () => {
    if (!actif()) return;
    proprietaire = 0;
    setEcoute(false);
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (!actif() || e.error === 'aborted') return;
    setErreur(MESSAGES[e.error] ?? 'La dictée s’est arrêtée. Réessaie.');
  });

  if (!disponible()) return null;

  async function basculer() {
    setErreur('');
    if (ecoute) return ExpoSpeechRecognitionModule.stop();
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) return setErreur(MESSAGES['not-allowed']);
    if (proprietaire) ExpoSpeechRecognitionModule.abort();
    proprietaire = id;
    base.current = valeur.trim();
    setEcoute(true);
    ExpoSpeechRecognitionModule.start({ lang: 'fr-FR', interimResults: true, continuous: true, addsPunctuation: true });
  }

  const Icone = ecoute ? Square : Mic;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ecoute ? 'Arrêter la dictée' : 'Dicter au lieu d’écrire'}
        accessibilityState={{ disabled: desactive }}
        disabled={desactive}
        onPress={basculer}
        hitSlop={6}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: ecoute ? couleurs.rouge : couleurs.bordure,
          backgroundColor: ecoute ? couleurs.rouge : couleurs.carte,
          opacity: desactive ? 0.5 : 1,
        }}
      >
        <Icone size={15} color={ecoute ? '#FFFFFF' : couleurs.rouge} fill={ecoute ? '#FFFFFF' : 'none'} />
        <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: ecoute ? '#FFFFFF' : couleurs.texte }}>
          {ecoute ? 'J’écoute… toucher pour arrêter' : 'Dicter'}
        </Text>
      </Pressable>
      {erreur ? (
        <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge }}>
          {erreur}
        </Text>
      ) : null}
    </>
  );
}
