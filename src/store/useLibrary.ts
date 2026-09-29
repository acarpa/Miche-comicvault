import { Directory } from 'expo-file-system';
import { create } from 'zustand';

import { deleteAllRows, deleteComicRow, listComics, updateComic, type ComicPatch } from '@/lib/db';
import { comicDir, comicsRoot, lastSegment } from '@/lib/paths';
import type { ComicSummary } from '@/types';

interface LibraryState {
  comics: ComicSummary[];
  loaded: boolean;
  error: string | null;
  load: () => Promise<void>;
  add: (comic: ComicSummary) => void;
  update: (id: string, patch: ComicPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  removeAll: () => Promise<void>;
}

/** Elenco dei fumetti in memoria, sempre allineato al database. */
export const useLibrary = create<LibraryState>()((set, get) => ({
  comics: [],
  loaded: false,
  error: null,

  load: async () => {
    try {
      const firstLoad = !get().loaded;
      const comics = await listComics();
      set({ comics, loaded: true, error: null });
      // Solo al primo caricamento, quando nessuna importazione è in corso.
      if (firstLoad) cleanupOrphans(new Set(comics.map((c) => c.id)));
    } catch (e) {
      set({ loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },

  add: (comic) => {
    // Rimuovi i campi extra (es. l'elenco pagine) per tenere leggera la lista.
    const { id, title, fileName, format, pageCount, sizeBytes, addedAt, lastReadAt, currentPage, completed, favorite, readingMode, cover } =
      comic;
    const summary: ComicSummary = {
      id,
      title,
      fileName,
      format,
      pageCount,
      sizeBytes,
      addedAt,
      lastReadAt,
      currentPage,
      completed,
      favorite,
      readingMode,
      cover,
    };
    set((s) => ({ comics: [summary, ...s.comics.filter((c) => c.id !== id)] }));
  },

  update: async (id, patch) => {
    set((s) => ({ comics: s.comics.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    await updateComic(id, patch);
  },

  remove: async (id) => {
    set((s) => ({ comics: s.comics.filter((c) => c.id !== id) }));
    await deleteComicRow(id);
    try {
      const dir = comicDir(id);
      if (dir.exists) dir.delete();
    } catch {
      // se non riesce ora, la pulizia all'avvio la rimuoverà
    }
  },

  removeAll: async () => {
    const ids = get().comics.map((c) => c.id);
    set({ comics: [] });
    await deleteAllRows();
    for (const id of ids) {
      try {
        const dir = comicDir(id);
        if (dir.exists) dir.delete();
      } catch {
        // ignora
      }
    }
  },
}));

/** Cartelle rimaste senza scheda (es. importazione interrotta): si eliminano. */
function cleanupOrphans(known: Set<string>) {
  // Se il database risulta vuoto non si tocca nulla: meglio qualche file in più che perdere fumetti.
  if (known.size === 0) return;
  try {
    const root = comicsRoot();
    if (!root.exists) return;
    for (const item of root.list()) {
      if (!(item instanceof Directory)) continue;
      const id = lastSegment(item.uri);
      // Prudenza: se non si riesce a leggere il nome non si cancella niente.
      if (id && /^[a-z0-9]+$/i.test(id) && !known.has(id)) {
        try {
          item.delete();
        } catch {
          // ignora
        }
      }
    }
  } catch {
    // ignora
  }
}
