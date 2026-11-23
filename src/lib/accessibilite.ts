import { Platform, type AccessibilityState } from 'react-native';

/**
 * État d'un bouton pour les lecteurs d'écran (coché, choisi, ouvert, indisponible, en cours).
 * La version web ignore `accessibilityState` : elle reçoit les attributs aria équivalents, sinon VoiceOver
 * ne dit jamais « coché » ni « sélectionné ». Un bouton « choisi » devient « enfoncé » (aria-pressed), sauf un onglet.
 */
export function etatA11y(e: AccessibilityState, role?: 'tab'): { accessibilityState?: AccessibilityState } {
  if (Platform.OS !== 'web') return { accessibilityState: e };
  const aria: Record<string, boolean | 'mixed' | undefined> = {};
  if (e.checked !== undefined) aria['aria-checked'] = e.checked;
  if (e.disabled !== undefined) aria['aria-disabled'] = e.disabled;
  if (e.busy !== undefined) aria['aria-busy'] = e.busy;
  if (e.expanded !== undefined) aria['aria-expanded'] = e.expanded;
  if (e.selected !== undefined) aria[role === 'tab' ? 'aria-selected' : 'aria-pressed'] = e.selected;
  return aria as { accessibilityState?: AccessibilityState };
}
