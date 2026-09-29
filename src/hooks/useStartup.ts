import { useIncomingShare } from 'expo-sharing';
import { useEffect, useState } from 'react';

import { importFromOtherApp } from '@/hooks/useComicActions';
import { useLibrary } from '@/store/useLibrary';
import { useLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';

/**
 * true quando le impostazioni sono state lette dal telefono.
 * Se c'è un PIN, l'app viene bloccata PRIMA di mostrare qualsiasi contenuto.
 */
export function useSettingsReady(): boolean {
  const [ready, setReady] = useState(() => useSettings.persist.hasHydrated());

  useEffect(() => {
    const finish = () => {
      if (useSettings.getState().pinEnabled) useLock.getState().lock();
      setReady(true);
    };
    if (useSettings.persist.hasHydrated()) {
      finish();
      return;
    }
    return useSettings.persist.onFinishHydration(finish);
  }, []);

  return ready;
}

/** Carica la libreria dal database all'avvio. */
export function useLibraryLoader() {
  useEffect(() => {
    void useLibrary.getState().load();
  }, []);
}

/** Fumetti condivisi da un'altra app (menu "Condividi" → ComicVault). */
export function useIncomingShares(enabled: boolean) {
  const { resolvedSharedPayloads, isResolving, clearSharedPayloads } = useIncomingShare();

  useEffect(() => {
    if (!enabled || isResolving || resolvedSharedPayloads.length === 0) return;
    const sources = resolvedSharedPayloads
      .map((p) => ({ uri: p.contentUri ?? p.value, name: p.originalName }))
      .filter((s) => typeof s.uri === 'string' && /^(content|file):\/\//i.test(s.uri));
    clearSharedPayloads();
    void importFromOtherApp(sources);
  }, [enabled, isResolving, resolvedSharedPayloads, clearSharedPayloads]);
}
