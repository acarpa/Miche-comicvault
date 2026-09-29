import { create } from 'zustand';

import { deleteAllMediaRows, deleteMediaRow, listMedia, updateMedia, type MediaPatch } from '@/lib/db';
import { deleteMediaFiles } from '@/lib/media';
import type { MediaItem } from '@/types';

interface MediaState {
  items: MediaItem[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (item: MediaItem) => void;
  update: (id: string, patch: MediaPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
}

/** GIF, immagini e video personali, allineati al database. */
export const useMedia = create<MediaState>()((set, get) => ({
  items: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      set({ items: await listMedia(), loaded: true, error: null });
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  add: (item) => set((s) => ({ items: [item, ...s.items.filter((m) => m.id !== item.id)] })),

  update: async (id, patch) => {
    set((s) => ({ items: s.items.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
    await updateMedia(id, patch);
  },

  remove: async (id) => {
    const item = get().items.find((m) => m.id === id);
    set((s) => ({ items: s.items.filter((m) => m.id !== id) }));
    await deleteMediaRow(id);
    if (item) deleteMediaFiles(item);
  },

  removeAll: async () => {
    const items = get().items;
    set({ items: [] });
    await deleteAllMediaRows();
    items.forEach(deleteMediaFiles);
  },
}));
