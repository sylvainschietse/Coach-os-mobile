import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function vibrer() {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
