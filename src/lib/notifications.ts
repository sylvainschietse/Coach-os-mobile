import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Sonnerie } from '@/domain/formats-minuteur';

const CANAL = 'minuteur';
const actif = Platform.OS !== 'web';

/** À appeler une fois au démarrage : affiche les alertes même app ouverte. */
export async function preparerNotifications() {
  if (!actif) return;
  Notifications.setNotificationHandler({
    // App à l'écran, le minuteur joue lui-même ses bips et sa sonnerie : ses alertes restent muettes.
    handleNotification: async (n) => {
      const minuteur = !!n.request.content.data?.minuteur;
      return { shouldShowBanner: !minuteur, shouldShowList: !minuteur, shouldPlaySound: !minuteur, shouldSetBadge: false };
    },
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Minuteur',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
    // Android fixe le son d'un canal une fois pour toutes : un canal par sonnerie, avec ou sans les bips 3, 2, 1.
    for (const sonnerie of SONNERIES) {
      for (const bips of [false, true]) {
        await Notifications.setNotificationChannelAsync(canal(sonnerie, bips), {
          name: `Minuteur · ${NOMS[sonnerie]}${bips ? ' avec décompte' : ''}`,
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 150, 250],
          sound: fichier(sonnerie, bips),
        });
      }
    }
    await Notifications.setNotificationChannelAsync(canal('vibreur', false), {
      name: 'Minuteur · vibreur seul',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      sound: null,
    });
  }
}

const SONNERIES = ['gong', 'sifflet', 'cloche', 'boxe', 'digital'] as const;
const NOMS: Record<Sonnerie, string> = { gong: 'gong', sifflet: 'sifflet', cloche: 'cloche', boxe: 'ring de boxe', digital: 'digital', vibreur: 'vibreur' };
const canal = (s: Sonnerie, bips: boolean) => (s === 'vibreur' ? 'minuteur_vibreur' : `minuteur_${s}${bips ? '_bips' : ''}`);
/** Fichiers de assets/sons, déclarés dans app.json (expo-notifications > sounds). */
const fichier = (s: Sonnerie, bips: boolean) => `${s}${bips ? '_bips' : ''}.wav`;

/**
 * Fin de phase du minuteur, téléphone verrouillé ou sur une autre appli : la sonnerie choisie, précédée des bips 3, 2, 1
 * quand bips est vrai (l'alerte part alors 3 s avant la fin, le fichier son contient le décompte).
 */
export async function programmerSonnerie(secondes: number, titre: string, corps: string, sonnerie: Sonnerie, bips: boolean): Promise<string | null> {
  if (!actif || secondes < 1) return null;
  const avecBips = bips && sonnerie !== 'vibreur';
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: titre, body: corps, sound: sonnerie === 'vibreur' ? false : fichier(sonnerie, avecBips), data: { minuteur: true } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(secondes), channelId: canal(sonnerie, avecBips) },
    });
  } catch {
    return null;
  }
}

export async function autoriserNotifications(): Promise<boolean> {
  if (!actif) return false;
  const actuelle = await Notifications.getPermissionsAsync();
  if (actuelle.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Alerte locale dans N secondes : elle sonne même téléphone verrouillé. */
export async function programmerAlerte(secondes: number, titre: string, corps: string): Promise<string | null> {
  if (!actif || secondes < 1) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title: titre, body: corps, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(secondes), channelId: CANAL },
    });
  } catch {
    return null;
  }
}

export async function annulerAlertes(ids: (string | null)[]) {
  if (!actif) return;
  await Promise.all(ids.filter((id): id is string => !!id).map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}
