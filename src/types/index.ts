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
  /** Serie a cui appartiene ("" = fumetto singolo). */
  series: string;
  /** Numero di capitolo/episodio/volume nella serie (null = sconosciuto). */
  chapter: number | null;
  author: string;
  tags: string[];
}

/** Fumetto completo, con le pagine (serve al lettore). */
export interface Comic extends ComicSummary {
  pages: PageInfo[];
}

export type MediaKind = 'gif' | 'image' | 'video';

/** GIF, immagine o video della sezione Media. */
export interface MediaItem {
  id: string;
  title: string;
  /** Nome del file originale. */
  originalName: string;
  kind: MediaKind;
  /** Nome del file nella cartella media dell'app (es. "abc123.mp4"). */
  fileName: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  addedAt: string;
  favorite: boolean;
  /** Nome della miniatura in media/thumbs (null = nessuna). */
  thumb: string | null;
}

export type LibraryFilter = 'all' | 'reading' | 'unread' | 'completed' | 'favorites';
export type LibrarySort = 'recent' | 'added' | 'title' | 'series';
export type ThemeMode = 'system' | 'light' | 'dark';
/** blackout = schermo nero all'istante; lock = schermata del PIN; lockAndExit = PIN e chiude l'app. */
export type PanicAction = 'blackout' | 'lock' | 'lockAndExit';
/** Indicatore di avanzamento nel lettore quando i comandi sono nascosti. */
export type ProgressStyle = 'pill' | 'line' | 'none';
export type MediaFilter = 'all' | 'gif' | 'video' | 'image' | 'favorites';

/** Vecchio backup "a cartella" (versione 1 dell'app): un .cbz per fumetto + questo indice. */
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

/**
 * Indice del backup .comicvault (file ZIP), lo stesso su telefono e PC:
 *   comicvault.json            questo indice (tutto il database)
 *   comics/<id>/0001.jpg ...   pagine e copertina di ogni fumetto
 *   media/<file>               GIF, immagini e video
 *   media/thumbs/<file>        miniature dei media
 */
export interface VaultManifest {
  app: 'comicvault';
  format: 2;
  /** full = libreria completa con i file; progress = solo progressi, preferiti e dati (file piccolo). */
  kind: 'full' | 'progress';
  exportedAt: string;
  device: 'android' | 'windows' | 'other';
  appVersion: string;
  comics: Comic[];
  media: MediaItem[];
  settings?: VaultSettings;
}

/** Preferenze di lettura che viaggiano col backup (mai il PIN). */
export interface VaultSettings {
  defaultMode?: ReadingMode;
  tapZones?: boolean;
  gridColumns?: 2 | 3;
  progressStyle?: ProgressStyle;
}
