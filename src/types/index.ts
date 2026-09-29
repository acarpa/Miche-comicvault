/** Modalità di lettura. */
export type ReadingMode = 'ltr' | 'rtl' | 'vertical';

/** Una pagina salvata sul telefono. */
export interface PageInfo {
  /** Nome del file nella cartella del fumetto (es. "0001.jpg"). */
  n: string;
  /** Larghezza e altezza in pixel (0 se sconosciute). */
  w: number;
  h: number;
}

/** Dati di un fumetto mostrati in libreria (senza l'elenco delle pagine). */
export interface ComicSummary {
  id: string;
  title: string;
  /** Nome del file originale importato. */
  fileName: string;
  format: string;
  pageCount: number;
  sizeBytes: number;
  addedAt: string; // ISO
  lastReadAt: string | null; // ISO
  /** Pagina corrente (0 = prima). */
  currentPage: number;
  completed: boolean;
  favorite: boolean;
  /** null = usa la modalità predefinita delle impostazioni. */
  readingMode: ReadingMode | null;
  /** Nome del file della copertina nella cartella del fumetto (null = usa la prima pagina). */
  cover: string | null;
}

/** Fumetto completo, con le pagine (serve al lettore). */
export interface Comic extends ComicSummary {
  pages: PageInfo[];
}

export type LibraryFilter = 'all' | 'reading' | 'unread' | 'completed' | 'favorites';
export type LibrarySort = 'recent' | 'added' | 'title';
export type ThemeMode = 'system' | 'light' | 'dark';
export type PanicAction = 'lock' | 'lockAndExit';

/** Dati di lettura esportati nel backup (i file delle pagine viaggiano come .cbz accanto). */
export interface BackupEntry {
  /** Nome del file .cbz nel backup. */
  file: string;
  title: string;
  fileName: string;
  addedAt: string;
  lastReadAt: string | null;
  currentPage: number;
  completed: boolean;
  favorite: boolean;
  readingMode: ReadingMode | null;
}

export interface BackupManifest {
  app: 'comicvault';
  format: 1;
  exportedAt: string;
  comics: BackupEntry[];
}
