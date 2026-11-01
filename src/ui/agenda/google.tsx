// Connexion du coach à son Google Agenda : connecter, synchroniser maintenant, déconnecter.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { RefreshCw } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { agenda, type EtatGoogle } from '@/data/agenda';
import { heureDe } from '@/domain/agenda';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour } from '../coque';
import { Carte, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

import { jourLong } from './commun';

export function GoogleAgenda({ onChange }: { onChange: () => void }) {
  const etat = useCharger(async () => ({ g: await agenda.google() }), 'agenda-google');
  const [occupe, setOccupe] = useState<string>();
  const [message, setMessage] = useState<{ texte: string; erreur?: boolean }>();

  async function faire(quoi: string, action: () => Promise<string | void>) {
    setOccupe(quoi);
    setMessage(undefined);
    try {
      const texte = await action();
      if (texte) setMessage({ texte });
      etat.recharger();
      onChange();
    } catch (e) {
      setMessage({ texte: e instanceof Error ? e.message : 'Action impossible pour le moment.', erreur: true });
    } finally {
      setOccupe(undefined);
    }
  }

  const connecter = () =>
    faire('connecter', async () => {
      const retour = Linking.createURL('agenda-google');
      const url = await agenda.connecterGoogle(retour);
      const r = await WebBrowser.openAuthSessionAsync(url, retour);
      if (r.type !== 'success') return;
      const resultat = new URL(r.url).searchParams.get('google');
      if (resultat === 'ok') return 'Google Agenda connecté : tes rendez-vous y sont copiés.';
      throw new Error(resultat === 'refuse' ? 'Connexion annulée.' : 'Google n’a pas donné l’accès. Réessaie.');
    });

  if (!etat.donnee) return null;
  const g: EtatGoogle | null = etat.donnee.g;
  const aujourdhui = new Date().toDateString();
  const quand = (iso: string) => `${new Date(iso).toDateString() === aujourdhui ? 'aujourd’hui' : jourLong(iso.slice(0, 10))} à ${heureDe(iso)}`;
  return (
    <Carte>
      <SousTitre>Google Agenda</SousTitre>
      {!g ? (
        <>
          <Texte doux>
            Tes rendez-vous sont copiés dans ton Google Agenda, tes événements perso s’affichent en gris ici et l’appli te prévient en cas de chevauchement. Pour
            une visio, le lien Google Meet se crée tout seul.
          </Texte>
          <BoutonContour libelle={occupe === 'connecter' ? 'Connexion…' : 'Connecter mon Google Agenda'} desactive={!!occupe} onPress={connecter} />
        </>
      ) : (
        <>
          <Texte>
            Connecté : {g.email || 'compte Google'}
            {g.synchroLe ? ` · dernière synchro ${quand(g.synchroLe)}` : ''}
          </Texte>
          {g.erreur && <Texte style={{ fontSize: 14, color: couleurs.orange }}>{g.erreur}</Texte>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
            <BoutonContour
              libelle={occupe === 'synchro' ? 'Synchro…' : 'Synchroniser maintenant'}
              icone={RefreshCw}
              iconeAGauche
              desactive={!!occupe}
              onPress={() => faire('synchro', async () => (await agenda.synchroniserGoogle(), 'Synchro faite.'))}
            />
            {g.erreur && <BoutonContour libelle="Reconnecter" desactive={!!occupe} onPress={connecter} />}
            <BoutonContour
              libelle={occupe === 'deconnecter' ? 'Déconnexion…' : 'Déconnecter'}
              desactive={!!occupe}
              onPress={() => faire('deconnecter', async () => (await agenda.deconnecterGoogle(), 'Google Agenda déconnecté. Les événements déjà copiés restent dans ton agenda Google.'))}
            />
          </View>
        </>
      )}
      {message && <Texte style={{ fontSize: 14, color: message.erreur ? couleurs.rouge : couleurs.vert }}>{message.texte}</Texte>}
    </Carte>
  );
}
