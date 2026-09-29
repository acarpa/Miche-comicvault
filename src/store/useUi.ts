import { create } from 'zustand';

import type { IconName } from '@/theme/icons';

export interface SheetOption {
  label: string;
  icon: IconName;
  destructive?: boolean;
  selected?: boolean;
  onPress: () => void;
}

interface Snackbar {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

/** Copertina che "vola" dalla griglia al lettore (animazione Hero). */
export interface HeroInfo {
  key: number;
  uri: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UiState {
  hero: HeroInfo | null;
  startHero: (h: Omit<HeroInfo, 'key'>) => void;
  endHero: () => void;

  /** Pulsante antipanico: schermo completamente nero. */
  blackout: boolean;
  setBlackout: (v: boolean) => void;

  snackbar: Snackbar | null;
  showSnackbar: (s: Omit<Snackbar, 'id'>) => void;
  hideSnackbar: () => void;

  actionSheet: { title?: string; options: SheetOption[] } | null;
  showActionSheet: (sheet: { title?: string; options: SheetOption[] }) => void;
  hideActionSheet: () => void;
}

/** Stato temporaneo dell'interfaccia (non salvato). */
export const useUi = create<UiState>()((set) => ({
  hero: null,
  startHero: (h) => set({ hero: { ...h, key: Date.now() } }),
  endHero: () => set({ hero: null }),

  blackout: false,
  setBlackout: (blackout) => set({ blackout }),

  snackbar: null,
  showSnackbar: (s) => set({ snackbar: { ...s, id: Date.now() } }),
  hideSnackbar: () => set({ snackbar: null }),

  actionSheet: null,
  showActionSheet: (actionSheet) => set({ actionSheet }),
  hideActionSheet: () => set({ actionSheet: null }),
}));
