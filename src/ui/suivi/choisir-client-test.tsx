// Raccourci « Faire un test » : choisir le client, puis sa fiche s'ouvre sur l'onglet Tests.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { crm } from '@/data/crm';
import { useCharger } from '@/lib/useCharger';

import { Chargement, Erreur } from '../composants';
import { Modale, Saisie } from '../crm/dossier';
import { couleurs, espace, polices } from '../theme';

export function ChoisirClientTest({ onChoisir, onFermer }: { onChoisir: (contactId: string) => void; onFermer: () => void }) {
  const charge = useCharger(async () => (await crm.contacts()).filter((c) => c.clientId && c.statut !== 'archive'), 'clients-test');
  const [cherche, setCherche] = useState('');
  const q = cherche.trim().toLowerCase();
  const clients = (charge.donnee ?? [])
    .filter((c) => !q || `${c.prenom} ${c.nom}`.toLowerCase().includes(q))
    .sort((a, b) => `${a.prenom} ${a.nom}`.localeCompare(`${b.prenom} ${b.nom}`, 'fr'));
  return (
    <Modale titre="Faire un test · choisir le client" onFermer={onFermer}>
      {charge.erreur ? (
        <Erreur message={charge.erreur} onReessayer={charge.recharger} />
      ) : !charge.donnee ? (
        <Chargement />
      ) : (
        <View style={{ gap: espace(2) }}>
          <Saisie libelle="Rechercher" valeur={cherche} onChange={setCherche} placeholder="Prénom ou nom" />
          {clients.length === 0 && <Text style={styles.vide}>Aucun client trouvé.</Text>}
          {clients.map((c) => (
            <Pressable key={c.id} accessibilityRole="button" onPress={() => onChoisir(c.id)} style={styles.ligne}>
              <Text style={styles.nom}>{`${c.prenom} ${c.nom}`.trim()}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Modale>
  );
}

const styles = StyleSheet.create({
  ligne: { minHeight: 48, justifyContent: 'center', borderBottomWidth: 1, borderColor: couleurs.bordure },
  nom: { fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte },
  vide: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux },
});
