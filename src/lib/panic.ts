import { BackHandler } from 'react-native';

import { useLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { hapticTap } from './haptics';

/**
 * Pulsante antipanico (icona con l'occhio barrato):
 * - "Schermo nero": lo schermo diventa subito completamente nero (e, se c'è un PIN, l'app si blocca);
 *   per tornare si tiene premuto lo schermo per 2 secondi.
 * - "Blocca": mostra subito la schermata del PIN (senza PIN: schermo nero).
 * - "Blocca ed esci": blocca e chiude l'app.
 */
export function panic() {
  const { pinEnabled, panicAction } = useSettings.getState();
  hapticTap('heavy');
  if (pinEnabled) useLock.getState().lock();
  if (panicAction === 'lockAndExit') {
    BackHandler.exitApp();
    return;
  }
  if (panicAction === 'blackout' || !pinEnabled) useUi.getState().setBlackout(true);
}
