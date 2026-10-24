import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CANAL = 'minuteur';
const actif = Platform.OS !== 'web';

/** À appeler une fois au démarrage : affiche les alertes même app ouverte. */
export async function preparerNotifications() {
  if (!actif) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, {
      name: 'Minuteur',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 150, 250],
    });
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
