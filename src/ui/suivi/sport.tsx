// Rubrique « Sport » du suivi : courses, sorties vélo, marches… lues dans Health Connect (Garmin Connect, Strava,
// Samsung Health…). Le client autorise la lecture et synchronise ; son coach voit la même liste et les totaux.
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { activites } from '@/data/activites';
import { derniereSynchro, synchroniserSport } from '@/data/synchro-sport';
import { formaterDistance, formaterDuree, libelleSport, rythme, SPORTS, totauxParSemaine, type Activite } from '@/domain/activites';
import { jourParis, lundiDe } from '@/domain/entrainement';
import { accesAccordes, demanderAcces, etatHealthConnect, ouvrirReglages, type EtatHealthConnect } from '@/lib/health-connect';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

const APPLIS: Record<string, string> = {
  'com.garmin.android.apps.connectmobile': 'Garmin Connect',
  'com.strava': 'Strava',
  'com.sec.android.app.shealth': 'Samsung Health',
  'com.google.android.apps.fitness': 'Google Fit',
  'com.fitbit.FitbitMobile': 'Fitbit',
  'com.suunto.android': 'Suunto',
  'com.polar.polarflow': 'Polar Flow',
  'com.coros.coros': 'COROS',
};
const nomAppli = (p?: string) => (p ? (APPLIS[p] ?? p) : '');

const quand = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });
const jourCourt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' });

/** Accès à Health Connect et synchronisation, sur le téléphone du client seulement. */
function Connexion({ clientId, onSynchro }: { clientId: string; onSynchro: () => void }) {
  const [etat, setEtat] = useState<EtatHealthConnect | null>(null);
  const [acces, setAcces] = useState(false);
  const [derniere, setDerniere] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState('');
  const [erreur, setErreur] = useState('');
  const auto = useRef(false);

  const synchroniser = useCallback(async () => {
    setOccupe(true);
    setErreur('');
    try {
      const r = await synchroniserSport(clientId);
      setMessage(r.lues ? `${r.lues} séance${r.lues > 1 ? 's' : ''} lue${r.lues > 1 ? 's' : ''} dans Health Connect.` : 'Aucune nouvelle séance dans Health Connect.');
      setDerniere(await derniereSynchro(clientId));
      onSynchro();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  }, [clientId, onSynchro]);

  useEffect(() => {
    let annule = false;
    (async () => {
      const e = await etatHealthConnect();
      const a = e === 'disponible' && (await accesAccordes()).includes('ExerciseSession');
      if (annule) return;
      setEtat(e);
      setAcces(a);
      setDerniere(await derniereSynchro(clientId));
      // Synchro automatique à l'ouverture de la rubrique, une fois.
      if (a && !auto.current) {
        auto.current = true;
        synchroniser();
      }
    })();
    return () => {
      annule = true;
    };
  }, [clientId, synchroniser]);

  async function autoriser() {
    setErreur('');
    try {
      const ok = (await demanderAcces()).includes('ExerciseSession');
      setAcces(ok);
      if (ok) await synchroniser();
      else setErreur('Accès non accordé : sans lui, Coach OS ne peut pas lire tes séances.');
    } catch (e) {
      setErreur(messageErreur(e));
    }
  }

  if (!etat) return null;
  if (etat === 'indisponible')
    return (
      <Carte>
        <SousTitre>Montre et applis de sport</SousTitre>
        <Texte doux style={{ fontSize: 14 }}>
          {Platform.OS === 'android'
            ? 'Health Connect n’est pas disponible : il faut Android 8 ou plus et la dernière version de Coach OS.'
            : 'La lecture automatique de tes courses se fait sur Android, avec Health Connect. Ouvre Coach OS sur ton téléphone Android.'}
        </Texte>
      </Carte>
    );
  if (etat === 'a_installer')
    return (
      <Carte>
        <SousTitre>Montre et applis de sport</SousTitre>
        <Texte doux style={{ fontSize: 14 }}>Installe ou mets à jour Health Connect pour que Coach OS lise tes courses.</Texte>
        <Bouton libelle="Installer Health Connect" onPress={() => Linking.openURL('market://details?id=com.google.android.apps.healthdata')} />
      </Carte>
    );
  return (
    <Carte>
      <SousTitre>Montre et applis de sport</SousTitre>
      {acces ? (
        <>
          <Texte doux style={{ fontSize: 14 }}>
            Tes séances arrivent depuis Health Connect{derniere ? ` · dernière synchro ${quand(derniere)}` : ''}. Ton coach les voit aussi.
          </Texte>
          <Bouton libelle="Synchroniser maintenant" onPress={synchroniser} chargement={occupe} />
          <Bouton variante="discret" libelle="Réglages Health Connect" onPress={ouvrirReglages} />
        </>
      ) : (
        <>
          <Texte style={{ fontSize: 15 }}>Coach OS peut lire tes courses, sorties vélo et marches : distance, durée, allure, fréquence cardiaque et dénivelé.</Texte>
          <Texte doux style={{ fontSize: 14 }}>
            Dans Garmin Connect, Strava ou Samsung Health, active d’abord l’envoi vers Health Connect (Réglages, Applis connectées, Health Connect). Les 30 derniers jours seront importés.
          </Texte>
          <Bouton libelle="Autoriser la lecture" onPress={autoriser} />
        </>
      )}
      {!!message && <Texte doux style={{ fontSize: 13 }}>{message}</Texte>}
      {!!erreur && <Erreur message={erreur} />}
    </Carte>
  );
}

function Ligne({ a, proprietaire, onRetirer }: { a: Activite; proprietaire: boolean; onRetirer: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const r = rythme(a);
  const details = [
    a.distanceM ? formaterDistance(a.distanceM) : '',
    formaterDuree(a.dureeS),
    r,
    a.fcMoy ? `FC ${a.fcMoy}${a.fcMax ? `/${a.fcMax}` : ''} bpm` : '',
    a.deniveleM ? `D+ ${a.deniveleM} m` : '',
  ].filter(Boolean);
  return (
    <View style={{ gap: espace(1), paddingVertical: espace(2), borderTopWidth: 1, borderTopColor: couleurs.bordure }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
        <Texte style={{ fontSize: 16, fontWeight: '600', flex: 1 }}>
          {libelleSport(a.sport)}
          {a.titre ? ` · ${a.titre}` : ''}
        </Texte>
        <Texte doux style={{ fontSize: 13 }}>{quand(a.debut)}</Texte>
      </View>
      <Texte style={{ fontSize: 15 }}>{details.join(' · ')}</Texte>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
        <Texte doux style={{ fontSize: 12 }}>{nomAppli(a.appareil) || 'Health Connect'}</Texte>
        {proprietaire &&
          (confirmer ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onRetirer}>
              <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer le retrait</Texte>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setConfirmer(true)}>
              <Texte doux style={{ fontSize: 13 }}>Retirer</Texte>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

/** `proprietaire` : le client sur son téléphone (accès Health Connect, retrait) ; sinon le coach, en lecture. */
export function Sport({ clientId, proprietaire = true }: { clientId: string; proprietaire?: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => activites.liste(clientId, 200), clientId);
  const [erreurRetrait, setErreurRetrait] = useState('');
  const semaines = donnee ? totauxParSemaine(donnee, (i) => lundiDe(jourParis(i))).slice(0, 4) : [];

  async function retirer(id: string) {
    setErreurRetrait('');
    try {
      await activites.retirer(clientId, id);
      recharger();
    } catch (e) {
      setErreurRetrait(messageErreur(e));
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      {proprietaire && <Connexion clientId={clientId} onSynchro={recharger} />}
      {erreur && <Erreur message={erreur} onReessayer={recharger} />}
      {!donnee && !erreur && <Chargement />}
      {donnee?.length === 0 && (
        <Texte doux>{proprietaire ? 'Aucune séance importée pour l’instant.' : 'Aucune séance importée par ce client pour l’instant.'}</Texte>
      )}
      {semaines.length > 0 && (
        <Carte>
          <SousTitre>Par semaine</SousTitre>
          {semaines.map((s) => (
            <View key={s.lundi} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2), flexWrap: 'wrap' }}>
              <Texte doux style={{ fontSize: 14 }}>Semaine du {jourCourt(s.lundi)}</Texte>
              <Texte style={{ fontSize: 14 }}>
                {[
                  `${s.nombre} séance${s.nombre > 1 ? 's' : ''}`,
                  formaterDuree(s.dureeS),
                  ...SPORTS.filter((x) => s.distanceParSport[x.cle]).map((x) => `${x.libelle.toLowerCase()} ${formaterDistance(s.distanceParSport[x.cle]!)}`),
                ].join(' · ')}
                {s.deniveleM ? ` · D+ ${s.deniveleM} m` : ''}
              </Texte>
            </View>
          ))}
        </Carte>
      )}
      {!!donnee?.length && (
        <Carte>
          <SousTitre>Séances</SousTitre>
          {erreurRetrait ? <Erreur message={erreurRetrait} /> : null}
          {donnee.map((a) => (
            <Ligne key={a.id} a={a} proprietaire={proprietaire} onRetirer={() => retirer(a.id)} />
          ))}
        </Carte>
      )}
    </View>
  );
}
