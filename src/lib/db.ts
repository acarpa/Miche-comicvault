/**
 * Database locale (SQLite) con l'elenco dei fumetti e i progressi di lettura.
 * Le immagini NON stanno nel database: sono file veri nella memoria dell'app.
 */
import * as SQLite from 'expo-sqlite';

import type { Comic, ComicSummary, PageInfo, ReadingMode } from '@/types';

const DB_NAME = 'comicvault.db';
const SCHEMA_VERSION = 1;

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
}

interface ComicRowWithPages extends ComicRow {
  pages: string;
}

const SUMMARY_COLUMNS =
  'id, title, fileName, format, pageCount, sizeBytes, addedAt, lastReadAt, currentPage, completed, favorite, readingMode, cover';

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
  // Qui in futuro: if (version < 2) { ALTER TABLE ... }
  if (version < SCHEMA_VERSION) await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

const MODES: ReadingMode[] = ['ltr', 'rtl', 'vertical'];

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

export async function getComic(id: string): Promise<Comic | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<ComicRowWithPages>(`SELECT ${SUMMARY_COLUMNS}, pages FROM comics WHERE id = ?`, id);
  if (!row) return null;
  return { ...toSummary(row), pages: parsePages(row.pages) };
}

export async function insertComic(comic: Comic): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO comics (id, title, fileName, format, pageCount, pages, sizeBytes, addedAt, lastReadAt, currentPage, completed, favorite, readingMode, cover)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
}

export type ComicPatch = Partial<
  Pick<ComicSummary, 'title' | 'lastReadAt' | 'currentPage' | 'completed' | 'favorite' | 'readingMode' | 'cover'>
>;

const PATCHABLE: (keyof ComicPatch)[] = ['title', 'lastReadAt', 'currentPage', 'completed', 'favorite', 'readingMode', 'cover'];

export async function updateComic(id: string, patch: ComicPatch): Promise<void> {
  const keys = PATCHABLE.filter((k) => k in patch);
  if (keys.length === 0) return;
  const values = keys.map((k) => {
    const v = patch[k];
    return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
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
