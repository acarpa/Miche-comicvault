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

interface UiState {
  snackbar: Snackbar | null;
  showSnackbar: (s: Omit<Snackbar, 'id'>) => void;
  hideSnackbar: () => void;

  actionSheet: { title?: string; options: SheetOption[] } | null;
  showActionSheet: (sheet: { title?: string; options: SheetOption[] }) => void;
  hideActionSheet: () => void;
}

/** Stato temporaneo dell'interfaccia (non salvato). */
export const useUi = create<UiState>()((set) => ({
  snackbar: null,
  showSnackbar: (s) => set({ snackbar: { ...s, id: Date.now() } }),
  hideSnackbar: () => set({ snackbar: null }),

  actionSheet: null,
  showActionSheet: (actionSheet) => set({ actionSheet }),
  hideActionSheet: () => set({ actionSheet: null }),
}));
