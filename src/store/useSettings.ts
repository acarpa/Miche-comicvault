import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SeriesSort } from '@/lib/series';
import type { LibraryFilter, LibrarySort, MediaFilter, PanicAction, ProgressStyle, ReadingMode, ThemeMode } from '@/types';

export interface SettingsValues {
  theme: ThemeMode;
  gridColumns: 2 | 3;
  sort: LibrarySort;
  filter: LibraryFilter;
  defaultMode: ReadingMode;
  tapZones: boolean;
  keepAwake: boolean;
  /** Indicatore di avanzamento nel lettore quando i comandi sono nascosti. */
  progressStyle: ProgressStyle;
  /** Vibrazioni leggere (preferiti, fine capitolo, menu). */
  haptics: boolean;
  seriesSort: SeriesSort;
  mediaFilter: MediaFilter;
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
  theme: 'dark',
  gridColumns: 3,
  sort: 'recent',
  filter: 'all',
  defaultMode: 'ltr',
  tapZones: true,
  keepAwake: true,
  progressStyle: 'pill',
  haptics: true,
  seriesSort: 'recent',
  mediaFilter: 'all',
  pinEnabled: false,
  pinLength: 4,
  biometric: true,
  lockAfter: 0,
  secureScreen: true,
  panicAction: 'blackout',
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
      version: 2,
      // Dalla versione 1 dell'app: nuovo tema scuro viola, antipanico "schermo nero", barra di avanzamento.
      migrate: (persisted, version) => {
        const old = (persisted ?? {}) as Partial<SettingsValues> & { showPageNumber?: boolean };
        if (version < 2) {
          const { showPageNumber, ...rest } = old;
          return {
            ...DEFAULT_SETTINGS,
            ...rest,
            theme: rest.theme === 'light' ? 'light' : 'dark',
            progressStyle: showPageNumber === false ? 'none' : 'pill',
            panicAction: 'blackout',
          } as SettingsValues as SettingsState;
        }
        return { ...DEFAULT_SETTINGS, ...old } as SettingsValues as SettingsState;
      },
    },
  ),
);
