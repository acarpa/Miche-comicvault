/**
 * Database locale (SQLite): fumetti, progressi di lettura, serie, tag e media.
 * Le immagini e i video NON stanno nel database: sono file veri nella memoria dell'app.
 */
import * as SQLite from 'expo-sqlite';

import type { Comic, ComicSummary, MediaItem, MediaKind, PageInfo, ReadingMode } from '@/types';
import { parseSeriesInfo } from './series';

const DB_NAME = 'comicvault.db';
const SCHEMA_VERSION = 2;

interface ComicRow {
  id: string;
  title: string;
  fileName: string;
  format: string;
  pageCount: number;
  sizeBytes: number;
  addedAt: string;
  lastReadAt: string | null;
  currentPage: number;
  completed: number;
  favorite: number;
  readingMode: string | null;
  cover: string | null;
  series: string | null;
  chapter: number | null;
  author: string | null;
  tags: string | null;
}

interface ComicRowWithPages extends ComicRow {
  pages: string;
}

interface MediaRow {
  id: string;
  title: string;
  originalName: string;
  kind: string;
  fileName: string;
  width: number;
  height: number;
  durationMs: number;
  sizeBytes: number;
  addedAt: string;
  favorite: number;
  thumb: string | null;
}

const SUMMARY_COLUMNS =
  'id, title, fileName, format, pageCount, sizeBytes, addedAt, lastReadAt, currentPage, completed, favorite, readingMode, cover, series, chapter, author, tags';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate().catch((e) => {
      dbPromise = null; // permette di riprovare
      throw e;
    });
  }
  return dbPromise;
}

async function columnsOf(db: SQLite.SQLiteDatabase, table: string): Promise<Set<string>> {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => r.name));
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;

  if (version < 1) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS comics (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        fileName TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT '',
        pageCount INTEGER NOT NULL,
        pages TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL DEFAULT 0,
        addedAt TEXT NOT NULL,
        lastReadAt TEXT,
        currentPage INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        favorite INTEGER NOT NULL DEFAULT 0,
        readingMode TEXT,
        cover TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_comics_fileName ON comics(fileName);
    `);
  }

  if (version < 2) {
    // Serie, capitoli, autore e tag + tabella dei media personali.
    const cols = await columnsOf(db, 'comics');
    const add: string[] = [];
    if (!cols.has('series')) add.push("ALTER TABLE comics ADD COLUMN series TEXT NOT NULL DEFAULT '';");
    if (!cols.has('chapter')) add.push('ALTER TABLE comics ADD COLUMN chapter REAL;');
    if (!cols.has('author')) add.push("ALTER TABLE comics ADD COLUMN author TEXT NOT NULL DEFAULT '';");
    if (!cols.has('tags')) add.push("ALTER TABLE comics ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';");
    await db.execAsync(`
      ${add.join('\n')}
      CREATE INDEX IF NOT EXISTS idx_comics_series ON comics(series);
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        originalName TEXT NOT NULL DEFAULT '',
        kind TEXT NOT NULL,
        fileName TEXT NOT NULL,
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        durationMs INTEGER NOT NULL DEFAULT 0,
        sizeBytes INTEGER NOT NULL DEFAULT 0,
        addedAt TEXT NOT NULL,
        favorite INTEGER NOT NULL DEFAULT 0,
        thumb TEXT
      );
    `);
    // I fumetti già importati: serie e capitolo ricavati dal nome del file.
    const old = await db.getAllAsync<{ id: string; fileName: string }>(
      "SELECT id, fileName FROM comics WHERE series = '' AND chapter IS NULL",
    );
    if (old.length > 0) {
      await db.withTransactionAsync(async () => {
        for (const c of old) {
          const info = parseSeriesInfo(c.fileName);
          if (info.series || info.chapter !== null) {
            await db.runAsync('UPDATE comics SET series = ?, chapter = ? WHERE id = ?', info.series, info.chapter, c.id);
          }
        }
      });
    }
  }

  if (version < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

const MODES: ReadingMode[] = ['ltr', 'rtl', 'vertical'];

export function parseTags(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

function toSummary(r: ComicRow): ComicSummary {
  return {
    id: r.id,
    title: r.title,
    fileName: r.fileName,
    format: r.format,
    pageCount: r.pageCount,
    sizeBytes: r.sizeBytes,
    addedAt: r.addedAt,
    lastReadAt: r.lastReadAt,
    currentPage: r.currentPage,
    completed: r.completed === 1,
    favorite: r.favorite === 1,
    readingMode: MODES.includes(r.readingMode as ReadingMode) ? (r.readingMode as ReadingMode) : null,
    cover: r.cover,
    series: r.series ?? '',
    chapter: typeof r.chapter === 'number' && Number.isFinite(r.chapter) ? r.chapter : null,
    author: r.author ?? '',
    tags: parseTags(r.tags),
  };
}

/** Solo i campi della libreria (toglie l'elenco delle pagine per tenere leggera la lista). */
export function summaryOf(c: ComicSummary): ComicSummary {
  return {
    id: c.id,
    title: c.title,
    fileName: c.fileName,
    format: c.format,
    pageCount: c.pageCount,
    sizeBytes: c.sizeBytes,
    addedAt: c.addedAt,
    lastReadAt: c.lastReadAt,
    currentPage: c.currentPage,
    completed: c.completed,
    favorite: c.favorite,
    readingMode: c.readingMode,
    cover: c.cover,
    series: c.series,
    chapter: c.chapter,
    author: c.author,
    tags: c.tags,
  };
}

function parsePages(json: string): PageInfo[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listComics(): Promise<ComicSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ComicRow>(`SELECT ${SUMMARY_COLUMNS} FROM comics`);
  return rows.map(toSummary);
}

/** Tutti i fumetti con le pagine (per il backup). */
export async function listComicsWithPages(): Promise<Comic[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ComicRowWithPages>(`SELECT ${SUMMARY_COLUMNS}, pages FROM comics`);
  return rows.map((r) => ({ ...toSummary(r), pages: parsePages(r.pages) }));
}

export async function getComic(id: string): Promise<Comic | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ComicRowWithPages>(`SELECT ${SUMMARY_COLUMNS}, pages FROM comics WHERE id = ?`, id);
  if (!row) return null;
  return { ...toSummary(row), pages: parsePages(row.pages) };
}

export async function comicExists(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM comics WHERE id = ?', id);
  return (row?.n ?? 0) > 0;
}

export async function insertComic(comic: Comic): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO comics (id, title, fileName, format, pageCount, pages, sizeBytes, addedAt, lastReadAt, currentPage, completed, favorite, readingMode, cover, series, chapter, author, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    comic.id,
    comic.title,
    comic.fileName,
    comic.format,
    comic.pageCount,
    JSON.stringify(comic.pages),
    comic.sizeBytes,
    comic.addedAt,
    comic.lastReadAt,
    comic.currentPage,
    comic.completed ? 1 : 0,
    comic.favorite ? 1 : 0,
    comic.readingMode,
    comic.cover,
    comic.series,
    comic.chapter,
    comic.author,
    JSON.stringify(comic.tags),
  );
}

export type ComicPatch = Partial<
  Pick<
    ComicSummary,
    | 'title'
    | 'lastReadAt'
    | 'currentPage'
    | 'completed'
    | 'favorite'
    | 'readingMode'
    | 'cover'
    | 'series'
    | 'chapter'
    | 'author'
    | 'tags'
  >
>;

const PATCHABLE: (keyof ComicPatch)[] = [
  'title',
  'lastReadAt',
  'currentPage',
  'completed',
  'favorite',
  'readingMode',
  'cover',
  'series',
  'chapter',
  'author',
  'tags',
];

export async function updateComic(id: string, patch: ComicPatch): Promise<void> {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (keys.length === 0) return;
  const values = keys.map((k) => {
    const v = patch[k];
    if (k === 'tags') return JSON.stringify(Array.isArray(v) ? v : []);
    return typeof v === 'boolean' ? (v ? 1 : 0) : ((v as string | number | null | undefined) ?? null);
  });
  const db = await getDb();
  await db.runAsync(`UPDATE comics SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...values, id);
}

export async function deleteComicRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM comics WHERE id = ?', id);
}

export async function deleteAllRows(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM comics');
}

export async function fileNameExists(fileName: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM comics WHERE fileName = ?', fileName);
  return (row?.n ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

const KINDS: MediaKind[] = ['gif', 'image', 'video'];

function toMedia(r: MediaRow): MediaItem {
  return {
    id: r.id,
    title: r.title,
    originalName: r.originalName,
    kind: KINDS.includes(r.kind as MediaKind) ? (r.kind as MediaKind) : 'image',
    fileName: r.fileName,
    width: r.width,
    height: r.height,
    durationMs: r.durationMs,
    sizeBytes: r.sizeBytes,
    addedAt: r.addedAt,
    favorite: r.favorite === 1,
    thumb: r.thumb,
  };
}

export async function listMedia(): Promise<MediaItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MediaRow>('SELECT * FROM media');
  return rows.map(toMedia);
}

export async function mediaExists(id: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM media WHERE id = ?', id);
  return (row?.n ?? 0) > 0;
}

export async function insertMedia(m: MediaItem): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO media (id, title, originalName, kind, fileName, width, height, durationMs, sizeBytes, addedAt, favorite, thumb)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.id,
    m.title,
    m.originalName,
    m.kind,
    m.fileName,
    Math.round(m.width),
    Math.round(m.height),
    Math.round(m.durationMs),
    Math.round(m.sizeBytes),
    m.addedAt,
    m.favorite ? 1 : 0,
    m.thumb,
  );
}

export type MediaPatch = Partial<Pick<MediaItem, 'title' | 'favorite'>>;

export async function updateMedia(id: string, patch: MediaPatch): Promise<void> {
  const keys = (['title', 'favorite'] as const).filter((k) => k in patch);
  if (keys.length === 0) return;
  const values = keys.map((k) => {
    const v = patch[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
  });
  const db = await getDb();
  await db.runAsync(`UPDATE media SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...values, id);
}

export async function deleteMediaRow(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM media WHERE id = ?', id);
}

export async function deleteAllMediaRows(): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM media');
}
