import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { LibraryFilter, LibrarySort, PanicAction, ReadingMode, ThemeMode } from '@/types';

export interface SettingsValues {
  theme: ThemeMode;
  gridColumns: 2 | 3;
  sort: LibrarySort;
  filter: LibraryFilter;
  defaultMode: ReadingMode;
  tapZones: boolean;
  keepAwake: boolean;
  showPageNumber: boolean;
  /** true se è impostato un PIN (il PIN vero sta cifrato nel portachiavi del telefono). */
  pinEnabled: boolean;
  /** Numero di cifre del PIN (per sapere quando verificarlo). */
  pinLength: number;
  biometric: boolean;
  /** Secondi in background prima di richiedere il PIN (0 = subito). */
  lockAfter: 0 | 60 | 300;
  /** Nasconde il contenuto nelle app recenti e blocca gli screenshot. */
  secureScreen: boolean;
  panicAction: PanicAction;
  lastBackupAt: string | null;
}

interface SettingsState extends SettingsValues {
  set: (patch: Partial<SettingsValues>) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  theme: 'system',
  gridColumns: 3,
  sort: 'recent',
  filter: 'all',
  defaultMode: 'ltr',
  tapZones: true,
  keepAwake: true,
  showPageNumber: true,
  pinEnabled: false,
  pinLength: 4,
  biometric: true,
  lockAfter: 0,
  secureScreen: true,
  panicAction: 'lockAndExit',
  lastBackupAt: null,
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      set: (patch) => set(patch),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'comicvault/settings',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    },
  ),
);
