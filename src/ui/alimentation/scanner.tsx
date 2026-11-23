import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';

import { codeBarresValide } from '@/domain/alimentation';

import { Bouton, ChampTexte, Erreur, Texte } from '../composants';
import { espace } from '../theme';

/** Scanne un code-barres avec l'appareil photo ; on peut aussi taper les chiffres sous le code. */
export function Scanner({ onCode, onFermer }: { onCode: (code: string) => void; onFermer: () => void }) {
  const [permission, demander] = useCameraPermissions();
  const [saisie, setSaisie] = useState('');
  const [erreur, setErreur] = useState<string>();
  const lu = useRef(false);
  const camera = Platform.OS !== 'web';

  function valider(code: string) {
    const propre = code.replace(/\s/g, '');
    if (!codeBarresValide(propre)) return setErreur('Un code-barres a 8 ou 13 chiffres.');
    onCode(propre);
  }

  return (
    <View style={{ gap: espace(3) }}>
      {camera && permission?.granted && (
        <View style={{ height: 260, borderRadius: 14, overflow: 'hidden' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => {
              // La caméra lit le même code plusieurs fois par seconde : on ne garde que la première lecture.
              if (lu.current || !codeBarresValide(data)) return;
              lu.current = true;
              onCode(data);
            }}
          />
        </View>
      )}
      {camera && permission && !permission.granted && (
        <View style={{ gap: espace(2) }}>
          <Texte doux style={{ fontSize: 14 }}>Autorise l’appareil photo pour scanner les codes-barres.</Texte>
          <Bouton variante="secondaire" libelle="Autoriser l’appareil photo" onPress={demander} />
        </View>
      )}
      {camera && permission?.granted && <Texte doux style={{ fontSize: 14 }}>Vise le code-barres du paquet.</Texte>}
      <ChampTexte
        libelle={camera ? 'Ou tape les chiffres sous le code-barres' : 'Chiffres sous le code-barres'}
        type="nombre"
        valeur={saisie}
        onChange={(t) => (setSaisie(t), setErreur(undefined))}
        placeholder="3017620422003"
      />
      {erreur && <Erreur message={erreur} />}
      <Bouton variante="secondaire" libelle="Chercher ce code" onPress={() => valider(saisie)} desactive={!saisie.trim()} />
      <Bouton variante="discret" libelle="Annuler" onPress={onFermer} />
    </View>
  );
}
