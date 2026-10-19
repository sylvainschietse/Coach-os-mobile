import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { dureeTotale, ecoule, etatA, lireMinuteur, planifier, resumeMinuteur, TABATA, type ConfigMinuteur } from '@/domain/minuteur';
import { annulerAlertes, autoriserNotifications, programmerAlerte } from '@/lib/notifications';
import { maintenantMs } from '@/lib/temps';
import { vibrer } from '@/lib/vibrer';
import { Bouton, Carte, Ecran, Texte } from '@/ui/composants';
import { ReglagesMinuteur } from '@/ui/reglages-minuteur';
import { couleurs, espace, polices } from '@/ui/theme';

type Marche = { debutMs: number; pausesMs: number; pauseDepuisMs?: number; alertes: (string | null)[] };

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) === 60 ? 0 : Math.ceil(s % 60)).padStart(2, '0')}`;

export default function Minuteur() {
  useKeepAwake();
  // Ouvert depuis une séance : le chrono réglé par le coach arrive en paramètre.
  const params = useLocalSearchParams<{ config?: string; titre?: string }>();
  const [prevu] = useState(() => lireMinuteur(params.config));
  const [config, setConfig] = useState<ConfigMinuteur>(prevu ?? TABATA);
  const [marche, setMarche] = useState<Marche | null>(null);
  const [maintenant, setMaintenant] = useState(maintenantMs);
  const phases = useMemo(() => planifier(config), [config]);
  const derniereIndex = useRef(-1);

  useEffect(() => {
    if (!marche || marche.pauseDepuisMs) return;
    const t = setInterval(() => setMaintenant(maintenantMs()), 200);
    return () => clearInterval(t);
  }, [marche]);

  const etat = marche ? etatA(phases, ecoule(marche.debutMs, maintenant, marche.pausesMs, marche.pauseDepuisMs)) : null;

  // Vibration à chaque changement de phase quand l'app est à l'écran.
  useEffect(() => {
    const index = etat?.statut === 'en_cours' ? etat.indexPhase : etat?.statut === 'termine' ? phases.length : -1;
    if (index > 0 && index !== derniereIndex.current) vibrer();
    derniereIndex.current = index;
  }, [etat, phases.length]);

  /** Une alerte par fin de phase : le minuteur sonne même téléphone verrouillé. */
  async function programmer(depuisS: number) {
    await autoriserNotifications();
    const alertes = await Promise.all(
      phases
        .filter((p) => p.debutS + p.dureeS > depuisS)
        .slice(0, 60)
        .map((p, i, liste) => {
          const fin = p.debutS + p.dureeS - depuisS;
          const suivante = phases[phases.indexOf(p) + 1];
          const corps = suivante
            ? suivante.type === 'travail'
              ? `Go ! Exercice ${suivante.exercice} · tour ${suivante.tour}`
              : 'Repos'
            : 'Séance terminée, bravo !';
          return i === liste.length - 1 || fin > 0 ? programmerAlerte(fin, p.type === 'travail' ? 'Stop' : 'C’est reparti', corps) : null;
        }),
    );
    return alertes;
  }

  async function demarrer() {
    const t0 = maintenantMs();
    setMaintenant(t0);
    setMarche({ debutMs: t0, pausesMs: 0, alertes: await programmer(0) });
  }

  async function basculerPause() {
    if (!marche) return;
    const t = maintenantMs();
    if (marche.pauseDepuisMs) {
      const pausesMs = marche.pausesMs + (t - marche.pauseDepuisMs);
      const depuis = ecoule(marche.debutMs, t, pausesMs);
      setMarche({ debutMs: marche.debutMs, pausesMs, alertes: await programmer(depuis) });
    } else {
      await annulerAlertes(marche.alertes);
      setMarche({ ...marche, pauseDepuisMs: t, alertes: [] });
    }
    setMaintenant(t);
  }

  async function arreter() {
    if (marche) await annulerAlertes(marche.alertes);
    setMarche(null);
  }

  if (!marche || !etat) {
    return (
      <Ecran>
        {params.titre && <Stack.Screen options={{ title: params.titre }} />}
        {prevu ? (
          <Texte doux>Chrono prévu par ton coach : {resumeMinuteur(prevu)}. Tu peux l’ajuster avant de lancer.</Texte>
        ) : (
          <Texte doux>Tabata, circuit ou fractionné : règle le format puis lance.</Texte>
        )}
        <Carte>
          <ReglagesMinuteur config={config} onChange={setConfig} />
        </Carte>
        <Texte doux style={{ textAlign: 'center' }}>Durée totale {mmss(dureeTotale(phases))}</Texte>
        <Bouton libelle="Démarrer" onPress={demarrer} />
        {prevu ? (
          <Bouton variante="discret" libelle="Revenir au réglage du coach" onPress={() => setConfig(prevu)} />
        ) : (
          <Bouton variante="discret" libelle="Revenir au Tabata (8 × 20 s / 10 s)" onPress={() => setConfig(TABATA)} />
        )}
      </Ecran>
    );
  }

  const travail = etat.statut === 'en_cours' && etat.phase.type === 'travail';
  const fond = etat.statut === 'termine' ? couleurs.noir : travail ? couleurs.rouge : '#2A2A30';

  return (
    <View style={[styles.plein, { backgroundColor: fond }]}>
      {etat.statut === 'termine' ? (
        <Text style={styles.phase}>Terminé</Text>
      ) : (
        <>
          <Text style={styles.phase}>{travail ? 'Travail' : 'Repos'}</Text>
          <Text style={styles.compte}>{mmss(etat.restantS)}</Text>
          <Text style={styles.detail}>
            Exercice {etat.phase.exercice}/{config.exercices} · Tour {etat.phase.tour}/{config.tours}
          </Text>
        </>
      )}
      <View style={styles.actions}>
        {etat.statut !== 'termine' && (
          <Bouton variante="secondaire" libelle={marche.pauseDepuisMs ? 'Reprendre' : 'Pause'} onPress={basculerPause} />
        )}
        {etat.statut === 'termine' && prevu ? (
          <Bouton variante="contour" libelle="Retour à la séance" onPress={() => router.back()} />
        ) : (
          <Bouton variante="contour" libelle={etat.statut === 'termine' ? 'Nouveau minuteur' : 'Arrêter'} onPress={arreter} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plein: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espace(6), gap: espace(2) },
  phase: { fontFamily: polices.titre, fontSize: 48, color: '#FFFFFF', letterSpacing: 2 },
  compte: { fontFamily: polices.titre, fontSize: 140, lineHeight: 150, color: '#FFFFFF' },
  detail: { fontFamily: polices.texteMoyen, fontSize: 18, color: '#FFFFFFCC' },
  actions: { width: '100%', maxWidth: 360, gap: espace(3), marginTop: espace(10) },
});
