import { useIncomingShare } from 'expo-sharing';
import { useEffect, useState } from 'react';

import { importFromOtherApp } from '@/hooks/useComicActions';
import { cleanupVaultTemp } from '@/lib/vault';
import { useLibrary } from '@/store/useLibrary';
import { useMedia } from '@/store/useMedia';
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

/** Carica libreria e media dal database all'avvio e pulisce i file temporanei. */
export function useLibraryLoader() {
  useEffect(() => {
    void useLibrary.getState().load();
    void useMedia.getState().load();
    // Dopo qualche secondo, con calma: backup condivisi e ripristini interrotti.
    const t = setTimeout(cleanupVaultTemp, 5000);
    return () => clearTimeout(t);
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
