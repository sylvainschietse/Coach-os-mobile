// « Alertes sur mon téléphone » : ce que le serveur envoie (messages, séances, programmes, paiements…).
// Chaque case s'enregistre aussitôt ; tout est actif par défaut.
import { BellRing } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import { alertesCoupees, reglerAlerte } from '@/data/alertes';
import { ALERTES, type Role } from '@/domain/alertes';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, SousTitre, Texte } from '../composants';
import { CaseACocher } from '../crm/dossier';
import { couleurs, espace } from '../theme';

export function AlertesTelephone({ role, titre = 'Alertes sur mon téléphone' }: { role: Role; titre?: string }) {
  const coupees = useCharger(alertesCoupees, `alertes-coupees-${role}`);
  const permission = useCharger(
    () => (Platform.OS === 'web' ? Promise.resolve(null) : Notifications.getPermissionsAsync()),
    'permission-notifications-alertes',
  );
  const [local, setLocal] = useState<Set<string> | null>(null);
  const [erreur, setErreur] = useState('');
  const liste = local ?? (coupees.donnee ? new Set(coupees.donnee) : null);
  if (coupees.erreur && !liste) return <Texte doux>{coupees.erreur}</Texte>;
  if (!liste) return <Chargement />;
  const refusees = permission.donnee && !permission.donnee.granted && !permission.donnee.canAskAgain;

  const changer = async (cle: string, active: boolean) => {
    const avant = liste;
    const apres = new Set(liste);
    if (active) apres.delete(cle);
    else apres.add(cle);
    setLocal(apres);
    setErreur('');
    try {
      await reglerAlerte(cle, active);
    } catch (e) {
      setLocal(avant);
      setErreur(e instanceof Error ? e.message : 'Réglage non enregistré, réessaie.');
    }
  };

  return (
    <Carte>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
        <BellRing size={18} color={couleurs.texte} />
        <SousTitre>{titre}</SousTitre>
      </View>
      {Platform.OS === 'web' && <Texte doux>Les alertes arrivent sur ton téléphone, dans l’appli CoachGo.</Texte>}
      {refusees && (
        <View style={{ gap: espace(2) }}>
          <Texte style={{ color: couleurs.rouge }}>Les notifications de CoachGo sont coupées dans les réglages du téléphone.</Texte>
          <Bouton variante="discret" libelle="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
        </View>
      )}
      {ALERTES[role].map((a) => (
        <View key={a.cle} style={{ gap: 2 }}>
          <CaseACocher libelle={a.titre} valeur={!liste.has(a.cle)} onChange={(v) => void changer(a.cle, v)} />
          <Texte doux style={{ fontSize: 13, marginLeft: 32 }}>
            {a.detail}
          </Texte>
        </View>
      ))}
      {!!erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </Carte>
  );
}
