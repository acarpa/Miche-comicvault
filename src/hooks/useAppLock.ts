import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';

/**
 * - al primo avvio, se c'è un PIN, parte bloccata
 * - si blocca quando torna in primo piano dopo il tempo impostato
 * - nasconde il contenuto nelle app recenti e impedisce gli screenshot (se attivo)
 */
export function useAppLock(ready: boolean) {
  const secureScreen = useSettings((s) => s.secureScreen);
  const backgroundAt = useRef<number | null>(null);

  useEffect(() => {
    if (ready && useSettings.getState().pinEnabled) useLock.getState().lock();
  }, [ready]);

  useEffect(() => {
    const action = secureScreen ? ScreenCapture.preventScreenCaptureAsync() : ScreenCapture.allowScreenCaptureAsync();
    action.catch(() => {});
  }, [secureScreen]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundAt.current = Date.now();
        return;
      }
      if (state !== 'active' || backgroundAt.current === null) return;
      const elapsed = (Date.now() - backgroundAt.current) / 1000;
      backgroundAt.current = null;
      const { pinEnabled, lockAfter } = useSettings.getState();
      if (pinEnabled && !useLock.getState().externalActivity && elapsed >= lockAfter) {
        useLock.getState().lock();
      }
    });
    return () => sub.remove();
  }, []);
}
