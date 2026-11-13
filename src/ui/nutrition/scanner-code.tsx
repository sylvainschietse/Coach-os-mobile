// FoodScanner.tsx d'origine : lire le code-barres d'un produit avec l'appareil photo, sans enregistrer d'image.
// L'original lisait aussi une photo du code-barres dans le navigateur ; ici la lecture se fait en direct sur le
// téléphone, et la saisie des chiffres reste disponible partout (dans le navigateur, c'est la seule voie).
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Camera } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Action, Etat } from '../entrainement/commun';
import { doux } from './commun';

const CODE = /^(?:\d{8}|\d{12}|\d{13}|\d{14})$/;

export function ScannerCode({ onCode }: { onCode: (code: string) => void }) {
  const [permission, demander] = useCameraPermissions();
  const [active, setActive] = useState(false);
  const [erreur, setErreur] = useState('');
  const lu = useRef(false);
  if (Platform.OS === 'web') return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <Action
          variante="contour"
          icone={Camera}
          libelle={active ? 'Arrêter la caméra' : 'Scanner le code-barres'}
          onPress={async () => {
            setErreur('');
            if (active) return setActive(false);
            const p = permission?.granted ? permission : await demander();
            if (!p.granted) return setErreur('Caméra indisponible ou accès refusé. Vous pouvez saisir les chiffres du code-barres.');
            lu.current = false;
            setActive(true);
          }}
        />
      </View>
      {active && (
        <View style={{ height: 260, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={({ data }) => {
              // La caméra lit le même code plusieurs fois par seconde : seule la première lecture compte.
              if (lu.current || !CODE.test(data)) return;
              lu.current = true;
              setActive(false);
              onCode(data);
            }}
          />
        </View>
      )}
      <Etat erreur={erreur || undefined} />
      <Text style={doux}>Cadrez le code-barres du produit. L’image est lue sur votre téléphone et n’est pas enregistrée.</Text>
    </View>
  );
}
