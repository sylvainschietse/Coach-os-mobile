// Son du minuteur. App à l'écran : l'appli joue elle-même les bips 3, 2, 1 et la sonnerie choisie.
// Écran verrouillé, autre appli ou page internet : une alerte programmée par fin de phase prend le relais, avec la même
// sonnerie (et les bips intégrés au son), même si l'appli a été fermée entre-temps.
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { alertes, signalEntre, type Phase, type Son, type Sonnerie } from '@/domain/formats-minuteur';

import { annulerAlertes, autoriserNotifications, programmerSonnerie } from './notifications';
import { vibrer } from './vibrer';

type CleSon = Exclude<Sonnerie, 'vibreur'> | 'bip';
const SOURCES: Record<CleSon | 'silence', number> = {
  bip: require('../../assets/sons/bip.wav'),
  gong: require('../../assets/sons/gong.wav'),
  sifflet: require('../../assets/sons/sifflet.wav'),
  cloche: require('../../assets/sons/cloche.wav'),
  boxe: require('../../assets/sons/boxe.wav'),
  digital: require('../../assets/sons/digital.wav'),
  silence: require('../../assets/sons/silence.wav'),
};
const lecteurs: Partial<Record<CleSon | 'silence', AudioPlayer>> = {};
const lecteur = (cle: CleSon | 'silence') => (lecteurs[cle] ??= createAudioPlayer(SOURCES[cle]));

/**
 * À appeler sur l'appui « Démarrer » ou en ouvrant les réglages : le son passe même en mode silencieux, se mêle à la
 * musique du client sans la couper, et tous les sons sont chargés d'avance (un son chargé au moment de le jouer
 * arrivait trop tard ou pas du tout).
 */
export function preparerSons() {
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
  try {
    (Object.keys(SOURCES) as (CleSon | 'silence')[]).forEach(lecteur);
  } catch {
    // Pas de son sur cet appareil : le minuteur continue sans.
  }
}

export function jouer(cle: CleSon | 'vibreur') {
  if (cle === 'vibreur') return;
  try {
    const l = lecteur(cle);
    // Un son déjà joué reste en fin de lecture : on le ramène au début, puis on le lance.
    if (l.currentTime > 0) l.seekTo(0).then(() => l.play(), () => l.play());
    else l.play();
  } catch {
    // Le son est un confort : le minuteur continue sans lui.
  }
}

/**
 * Pendant le minuteur, un silence tourne en boucle : le haut-parleur et la liaison Bluetooth (voiture, enceinte,
 * écouteurs) restent éveillés, sinon ils coupent le début de chaque bip.
 */
export function useSortieEveillee(actif: boolean) {
  useEffect(() => {
    if (!actif || Platform.OS === 'web') return;
    let l: AudioPlayer | null = null;
    try {
      l = lecteur('silence');
      l.loop = true;
      l.play();
    } catch {
      l = null;
    }
    return () => {
      try {
        l?.pause();
      } catch {
        // Lecteur déjà libéré.
      }
    };
  }, [actif]);
}

/** Fait entendre une sonnerie dans les réglages. */
export function ecouter(s: Sonnerie) {
  if (!lecteurs.bip) preparerSons();
  if (s === 'vibreur') vibrer();
  else jouer(s);
}

/** Programme les alertes de fin de phase à partir de la seconde depuisS ; renvoie leurs identifiants. */
export async function programmerAlertes(phases: Phase[], son: Son, depuisS: number, nomExercice?: (n: number) => string | undefined): Promise<(string | null)[]> {
  if (Platform.OS === 'web' || !(await autoriserNotifications())) return [];
  return Promise.all(alertes(phases, son, depuisS, nomExercice).map((a) => programmerSonnerie(a.dansS, a.titre, a.corps, son.sonnerie, a.bips)));
}

export const annulerSonneries = annulerAlertes;

/**
 * Joue les bips et la sonnerie au fil du temps écoulé (ecouleS null : minuteur arrêté ou en pause).
 * Rien ne sonne quand l'appli n'est pas à l'écran : les alertes programmées s'en chargent, sans doublon.
 */
export function useSignauxMinuteur(phases: Phase[], son: Son, ecouleS: number | null) {
  const avant = useRef<number | null>(null);
  useEffect(() => {
    const precedent = avant.current;
    avant.current = ecouleS;
    // Un saut de plus d'une seconde : retour sur l'appli, ce qui devait sonner a déjà sonné par alerte.
    if (ecouleS === null || precedent === null || ecouleS - precedent > 1.5 || AppState.currentState !== 'active') return;
    const s = signalEntre(phases, son, precedent, ecouleS);
    if (s === 'bip' && son.sonnerie !== 'vibreur') jouer('bip');
    if (s === 'sonnerie') jouer(son.sonnerie);
    if (s && (son.vibrer || son.sonnerie === 'vibreur')) vibrer();
  }, [phases, son, ecouleS]);
}
