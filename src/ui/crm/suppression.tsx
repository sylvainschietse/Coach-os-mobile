// DeleteCRMDialog d'origine : confirmation nommée, rien d'autre n'est effacé.
import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { roleWeb } from '@/lib/role-web';

import { couleurs, espace, polices } from '../theme';
import { BoutonPied } from './dossier';

export function ConfirmerSuppression({
  quoi,
  nom,
  contact,
  onSupprimer,
  onFermer,
}: {
  quoi: string;
  nom: string;
  contact?: string;
  onSupprimer: () => Promise<void>;
  onFermer: () => void;
}) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const verrou = useRef(false);

  async function supprimer() {
    if (verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    setErreur(undefined);
    try {
      await onSupprimer();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Suppression non confirmée');
    } finally {
      setOccupe(false);
      verrou.current = false;
    }
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!occupe) onFermer();
      }}
    >
      <View style={styles.voile}>
        <View {...roleWeb('alertdialog')} style={styles.boite}>
          <Text style={styles.titre}>Supprimer {quoi} ?</Text>
          <Text style={styles.nom}>{nom}</Text>
          {contact && <Text style={styles.texte}>{contact}</Text>}
          <Text style={styles.texte}>
            Cette suppression est définitive. Les données saisies dans cet élément seront perdues. La fiche client et les autres éléments liés sont
            conservés.
          </Text>
          {erreur && (
            <Text accessibilityRole="alert" style={[styles.texte, { color: couleurs.rouge }]}>
              {erreur}
            </Text>
          )}
          <View style={styles.boutons}>
            <BoutonPied libelle="Annuler" desactive={occupe} onPress={onFermer} />
            <View style={styles.danger}>
              <Text accessibilityRole="button" onPress={occupe ? undefined : supprimer} style={styles.dangerTexte}>
                {occupe ? 'Suppression…' : 'Supprimer définitivement'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voile: {
    flex: 1,
    backgroundColor: 'rgba(17,18,22,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  boite: {
    width: '100%',
    maxWidth: 512,
    backgroundColor: couleurs.carte,
    borderRadius: 14,
    padding: 24,
    gap: espace(2),
  },
  titre: { fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte },
  nom: {
    marginTop: 4,
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: couleurs.texte,
  },
  texte: {
    fontFamily: polices.texte,
    fontSize: 14,
    lineHeight: 20,
    color: couleurs.texteDoux,
  },
  boutons: {
    marginTop: espace(3),
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: espace(2),
  },
  danger: {
    minHeight: 44,
    borderRadius: 11,
    backgroundColor: couleurs.rouge,
    justifyContent: 'center',
  },
  dangerTexte: {
    paddingHorizontal: 16,
    lineHeight: 44,
    fontFamily: polices.texteMoyen,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
