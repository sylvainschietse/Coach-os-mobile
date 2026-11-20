import { Platform } from 'react-native';

// Rôles que React Native ne connaît pas (dialog, status, listbox…) : le web les comprend, mais Android les refuse et l'écran
// devient gris. On ne les pose donc que sur le web.
export function roleWeb(role: 'dialog' | 'alertdialog' | 'status' | 'listbox' | 'option') {
  return Platform.OS === 'web' ? { accessibilityRole: role as never } : {};
}
