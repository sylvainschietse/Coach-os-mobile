// Rappels programmés sur le téléphone du client (séances, repas, motivation, bilan) et jeton de notification
// pour les messages du coach. Sur le web, rien n'est programmé.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { PREFERENCES_PAR_DEFAUT, type PreferencesRappels, type Rappel } from '@/domain/rappels';
import { supabase } from '@/data/supabase';

import { autoriserNotifications } from './notifications';

export const CANAL_RAPPELS = 'rappels';
export const CANAL_MESSAGES = 'messages';
const PREFIXE = 'rappel-';
const actif = Platform.OS !== 'web';
const cle = (clientId: string) => `coachgo.rappels.${clientId}`;

export async function lirePreferences(clientId: string): Promise<PreferencesRappels> {
  try {
    const brut = await AsyncStorage.getItem(cle(clientId));
    return { ...PREFERENCES_PAR_DEFAUT, ...(brut ? (JSON.parse(brut) as Partial<PreferencesRappels>) : {}) };
  } catch {
    return PREFERENCES_PAR_DEFAUT;
  }
}

export async function enregistrerPreferences(clientId: string, p: PreferencesRappels) {
  await AsyncStorage.setItem(cle(clientId), JSON.stringify(p));
}

/** Canaux Android : l'utilisateur peut couper l'un sans l'autre dans les réglages du téléphone. */
export async function preparerCanaux() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_RAPPELS, {
    name: 'Rappels (séances, repas, bilan)',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
  await Notifications.setNotificationChannelAsync(CANAL_MESSAGES, {
    name: 'Messages du coach',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
  });
}

/** Remplace tous les rappels programmés par ceux-ci. Renvoie le nombre programmé (0 sans autorisation). */
export async function programmerRappels(rappels: Rappel[], demander: boolean): Promise<number> {
  if (!actif) return 0;
  const permis = demander ? await autoriserNotifications() : (await Notifications.getPermissionsAsync()).granted;
  const deja = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(deja.filter((n) => n.identifier.startsWith(PREFIXE)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!permis) return 0;
  let n = 0;
  for (const r of rappels) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIXE}${r.id}`,
        content: { title: r.titre, body: r.corps, data: { url: r.url }, sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.quand, channelId: CANAL_RAPPELS },
      });
      n++;
    } catch {
      // Un rappel refusé par le téléphone n'empêche pas les suivants.
    }
  }
  return n;
}

export async function annulerRappels() {
  await programmerRappels([], false);
}

/** Identifiant du projet Expo : sans lui, pas de notification envoyée par le serveur (messages). */
const projetExpo = (): string | undefined =>
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId ??
  (process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined);

let jetonCourant: string | undefined;

/**
 * Inscrit ce téléphone pour recevoir les messages (coach ou client), ou le retire si `actif` est faux.
 * Renvoie l'état, pour l'écran des réglages.
 */
export async function inscrireMessages(oui: boolean): Promise<'ok' | 'refuse' | 'indisponible'> {
  if (!actif || !supabase || !Device.isDevice) return 'indisponible';
  const projectId = projetExpo();
  if (!projectId) return 'indisponible';
  try {
    if (!oui) {
      const jeton = jetonCourant ?? (await Notifications.getExpoPushTokenAsync({ projectId })).data;
      await supabase.rpc('oublier_appareil', { p_jeton: jeton });
      return 'ok';
    }
    if (!(await autoriserNotifications())) return 'refuse';
    const jeton = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    jetonCourant = jeton;
    const { error } = await supabase.rpc('enregistrer_appareil', { p_jeton: jeton, p_plateforme: Platform.OS });
    return error ? 'indisponible' : 'ok';
  } catch {
    return 'indisponible';
  }
}

/** À la déconnexion : ce téléphone ne reçoit plus les messages de ce compte. */
export async function oublierCeTelephone() {
  if (!supabase || !jetonCourant) return;
  await supabase.rpc('oublier_appareil', { p_jeton: jetonCourant }).then(
    () => undefined,
    () => undefined,
  );
  jetonCourant = undefined;
}
