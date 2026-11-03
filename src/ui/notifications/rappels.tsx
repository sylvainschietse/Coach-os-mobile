// Notifications du client : ses rappels sont recalculés à chaque ouverture de l'appli (séances prévues, rendez-vous,
// repas notés, bilan rempli) et il les règle depuis « Moi › Mes notifications ».
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform, View } from 'react-native';
import * as Notifications from 'expo-notifications';

import { depot } from '@/data';
import { agenda } from '@/data/agenda';
import { alimentation } from '@/data/alimentation';
import { suiviHebdo } from '@/data/suivi-hebdo';
import { aujourdhuiParis } from '@/domain/entrainement';
import { heureValide, planifierRappels, type PreferencesRappels } from '@/domain/rappels';
import { lundiCourant } from '@/domain/suivi-hebdo';
import { enregistrerPreferences, inscrireMessages, lirePreferences, programmerRappels } from '@/lib/rappels';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, SousTitre, Texte } from '../composants';
import { CaseACocher, Saisie } from '../crm/dossier';
import { couleurs, espace } from '../theme';

const CLE_DEMANDE = 'coachgo.notifications.demandees';

/** Calcule et programme les rappels du client. Les sources indisponibles (hors ligne) sont simplement ignorées. */
export async function replanifier(clientId: string, prenom: string, demander = false) {
  if (Platform.OS === 'web') return 0;
  const prefs = await lirePreferences(clientId);
  const aujourdhui = aujourdhuiParis();
  const [seances, rdv, repas, bilans] = await Promise.all([
    depot.seancesDuClient(clientId).catch(() => []),
    agenda.mesRendezVous(clientId).catch(() => []),
    alimentation.repas(clientId, aujourdhui).catch(() => []),
    suiviHebdo.bilansClient(clientId).catch(() => []),
  ]);
  const rappels = planifierRappels(prefs, {
    maintenant: new Date(),
    prenom,
    seances,
    rendezVous: rdv,
    repasDuJour: repas.filter((r) => r.date === aujourdhui).map((r) => r.moment),
    bilanFait: bilans.some((b) => b.semaine === lundiCourant()),
    journalRepas: true,
  });
  return programmerRappels(rappels, demander);
}

/** Client connecté : la première fois, demande l'autorisation ; ensuite, reprogramme à chaque retour sur l'appli. */
export function useRappelsClient(clientId: string, prenom: string) {
  useEffect(() => {
    if (Platform.OS === 'web' || !clientId) return;
    const lancer = async () => {
      const demandees = await AsyncStorage.getItem(CLE_DEMANDE).catch(() => null);
      if (!demandees) await AsyncStorage.setItem(CLE_DEMANDE, '1').catch(() => undefined);
      await replanifier(clientId, prenom, !demandees).catch(() => undefined);
      const prefs = await lirePreferences(clientId);
      await inscrireMessages(prefs.messages).catch(() => undefined);
    };
    void lancer();
    const s = AppState.addEventListener('change', (e) => e === 'active' && void replanifier(clientId, prenom).catch(() => undefined));
    return () => s.remove();
  }, [clientId, prenom]);
}

const TYPES: { cle: keyof PreferencesRappels; titre: string; detail: string }[] = [
  { cle: 'messages', titre: 'Messages de mon coach', detail: 'Dès que ton coach t’écrit.' },
  { cle: 'seances', titre: 'Mes séances', detail: 'Le matin d’une séance prévue, et 2 h avant un rendez-vous avec ton coach.' },
  { cle: 'repas', titre: 'Noter mes repas', detail: 'Le midi et le soir, seulement si le repas n’est pas encore noté.' },
  { cle: 'motivation', titre: 'Motivation', detail: 'Un petit mot d’encouragement le mardi et le vendredi matin.' },
  { cle: 'bilan', titre: 'Bilan de la semaine', detail: 'Le dimanche à 18 h, s’il n’est pas encore rempli.' },
];

/** « Moi › Mes notifications » : ce que le client veut recevoir. */
export function ReglagesNotifications({ clientId, prenom }: { clientId: string; prenom: string }) {
  const prefs = useCharger(() => lirePreferences(clientId), `prefs-rappels-${clientId}`);
  const permission = useCharger(
    () => (Platform.OS === 'web' ? Promise.resolve(null) : Notifications.getPermissionsAsync()),
    'permission-notifications',
  );
  const [p, setP] = useState<PreferencesRappels | null>(null);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok'>('repos');
  const [erreur, setErreur] = useState('');
  const [nb, setNb] = useState<number>();
  const valeur = p ?? prefs.donnee;
  if (!valeur) return <Chargement />;

  if (Platform.OS === 'web')
    return (
      <Carte>
        <Texte>Les notifications arrivent sur ton téléphone : règle-les depuis l’appli CoachGo.</Texte>
      </Carte>
    );

  const changer = (m: Partial<PreferencesRappels>) => {
    setP({ ...valeur, ...m });
    setEtat('repos');
  };
  const refusees = permission.donnee && !permission.donnee.granted && !permission.donnee.canAskAgain;

  const enregistrer = async () => {
    if (!heureValide(valeur.heureDejeuner) || !heureValide(valeur.heureDiner)) return setErreur('Heure illisible : écris-la comme 13:30.');
    setErreur('');
    setEtat('envoi');
    try {
      await enregistrerPreferences(clientId, valeur);
      setNb(await replanifier(clientId, prenom, true));
      await inscrireMessages(valeur.messages);
      permission.recharger();
      setEtat('ok');
    } catch {
      setErreur('Réglages non enregistrés, réessaie.');
      setEtat('repos');
    }
  };

  return (
    <View style={{ gap: espace(4) }}>
      {refusees && (
        <Carte style={{ borderColor: couleurs.rouge }}>
          <Texte>Les notifications de CoachGo sont coupées dans les réglages du téléphone. Active-les pour recevoir tes rappels.</Texte>
          <Bouton variante="discret" libelle="Ouvrir les réglages" onPress={() => Linking.openSettings()} />
        </Carte>
      )}
      <Carte>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
          <Bell size={18} color={couleurs.texte} />
          <SousTitre>Je veux être prévenu·e pour</SousTitre>
        </View>
        {TYPES.map((t) => (
          <View key={t.cle} style={{ gap: 2 }}>
            <CaseACocher libelle={t.titre} valeur={!!valeur[t.cle]} onChange={(v) => changer({ [t.cle]: v })} />
            <Texte doux style={{ fontSize: 13, marginLeft: 32 }}>
              {t.detail}
            </Texte>
          </View>
        ))}
        {valeur.repas && (
          <View style={{ flexDirection: 'row', gap: espace(3) }}>
            <View style={{ flex: 1 }}>
              <Saisie libelle="Rappel du midi" valeur={valeur.heureDejeuner} onChange={(heureDejeuner) => changer({ heureDejeuner })} placeholder="14:00" />
            </View>
            <View style={{ flex: 1 }}>
              <Saisie libelle="Rappel du soir" valeur={valeur.heureDiner} onChange={(heureDiner) => changer({ heureDiner })} placeholder="21:00" />
            </View>
          </View>
        )}
        {!!erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
        <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={etat === 'envoi'} />
        {etat === 'ok' && (
          <Texte style={{ fontSize: 14, color: couleurs.vert }}>
            {nb ? `C’est noté : ${nb} rappel${nb > 1 ? 's' : ''} prévu${nb > 1 ? 's' : ''} pour les deux prochaines semaines.` : 'C’est noté.'}
          </Texte>
        )}
      </Carte>
    </View>
  );
}
