/**
 * Vibrazioni leggere (feedback aptico): preferiti, fine capitolo, menu, schede.
 * Si possono spegnere dalle impostazioni.
 */
import * as Haptics from 'expo-haptics';

import { useSettings } from '@/store/useSettings';

const enabled = () => useSettings.getState().haptics;

/** Tocco leggerissimo: cambio scheda, scelta in un elenco. */
export function hapticSelect() {
  if (enabled()) Haptics.selectionAsync().catch(() => {});
}

/** Colpetto: apertura di un menu, pressione prolungata. */
export function hapticTap(strength: 'light' | 'medium' | 'heavy' = 'light') {
  if (!enabled()) return;
  const style =
    strength === 'heavy'
      ? Haptics.ImpactFeedbackStyle.Heavy
      : strength === 'medium'
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light;
  Haptics.impactAsync(style).catch(() => {});
}

/** Conferma: aggiunto ai preferiti, fine del capitolo, backup completato. */
export function hapticSuccess() {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function hapticWarning() {
  if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
