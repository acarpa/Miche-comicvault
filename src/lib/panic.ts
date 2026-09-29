import { BackHandler } from 'react-native';

import { useLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';

/**
 * Pulsante antipanico: blocca subito l'app (se c'è un PIN) e, se impostato, la chiude.
 * Senza PIN l'app viene semplicemente chiusa, così il contenuto sparisce dallo schermo.
 */
export function panic() {
  const { pinEnabled, panicAction } = useSettings.getState();
  if (pinEnabled) useLock.getState().lock();
  if (!pinEnabled || panicAction === 'lockAndExit') BackHandler.exitApp();
}
