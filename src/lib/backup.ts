/**
 * Esportazione di un singolo fumetto (.cbz) e ripristino dei vecchi backup "a cartella"
 * (versione 1: un .cbz per fumetto + "comicvault-library.json") o di una cartella qualsiasi di fumetti.
 * Il backup completo nuovo (.comicvault) è in vault.ts.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import ComicArchive from '../../modules/comic-archive';
import type { BackupEntry, BackupManifest, ComicSummary } from '@/types';
import { getComic, updateComic } from './db';
import { isComicFileName, safeFileName } from './format';
import { DuplicateError, importComic } from './importer';
import { comicDir } from './paths';

export const MANIFEST_NAME = 'comicvault-library.json';
const CBZ_MIME = 'application/vnd.comicbook+zip';

export class CanceledError extends Error {
  constructor() {
    super('Operazione annullata');
  }
}

/** Selettore di cartella di Android. Restituisce null se l'utente chiude senza scegliere. */
export async function pickFolder(): Promise<Directory | null> {
  try {
    return await Directory.pickDirectoryAsync();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(message)) return null;
    throw e;
  }
}

export function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Esportazione di un singolo fumetto
// ---------------------------------------------------------------------------

async function pageNames(id: string): Promise<string[]> {
  const comic = await getComic(id);
  if (!comic) throw new Error('Fumetto non trovato');
  return comic.pages.map((p) => p.n);
}

/** Crea il .cbz nella cache e apre il foglio di condivisione di Android. */
export async function shareComic(comic: ComicSummary): Promise<void> {
  const dir = new Directory(Paths.cache, 'export');
  if (dir.exists) dir.delete(); // elimina esportazioni precedenti
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, `${safeFileName(comic.title, comic.id)}.cbz`);
  await ComicArchive.writeCbz(comicDir(comic.id).uri, await pageNames(comic.id), file.uri);
  await Sharing.shareAsync(file.uri, { mimeType: CBZ_MIME, dialogTitle: comic.title });
}

/** Salva il .cbz in una cartella scelta (es. Download). Restituisce il nome del file o null se annullato. */
export async function saveComicToFolder(comic: ComicSummary): Promise<string | null> {
  const folder = await pickFolder();
  if (!folder) return null;
  const name = `${safeFileName(comic.title, comic.id)}.cbz`;
  const target = folder.createFile(name, CBZ_MIME);
  await ComicArchive.writeCbz(comicDir(comic.id).uri, await pageNames(comic.id), target.uri);
  return name;
}

export interface Progress {
  done: number;
  total: number;
  current: string;
}

// ---------------------------------------------------------------------------
// Ripristino
// ---------------------------------------------------------------------------

export function parseManifest(text: string): BackupManifest | null {
  try {
    const raw = JSON.parse(text.replace(/^﻿/, ''));
    if (!raw || raw.app !== 'comicvault' || !Array.isArray(raw.comics)) return null;
    const comics: BackupEntry[] = raw.comics
      .filter((c: unknown): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c: Record<string, unknown>) => ({
        file: String(c.file ?? ''),
        title: String(c.title ?? ''),
        fileName: String(c.fileName ?? c.file ?? ''),
        addedAt: typeof c.addedAt === 'string' ? c.addedAt : new Date().toISOString(),
        lastReadAt: typeof c.lastReadAt === 'string' ? c.lastReadAt : null,
        currentPage: Number.isInteger(c.currentPage) ? (c.currentPage as number) : 0,
        completed: c.completed === true,
        favorite: c.favorite === true,
        readingMode: c.readingMode === 'ltr' || c.readingMode === 'rtl' || c.readingMode === 'vertical' ? c.readingMode : null,
      }))
      .filter((c: BackupEntry) => c.file);
    return { app: 'comicvault', format: 1, exportedAt: String(raw.exportedAt ?? ''), comics };
  } catch {
    return null;
  }
}

/**
 * Nome "umano" di un file. Per le cartelle scelte con il selettore di Android gli URI sono del tipo
 * content://.../document/primary%3ADownload%2Fbackup%2FBatman.cbz: chiediamo il nome ad Android
 * e, se non risponde, lo ricaviamo dall'URI.
 */
export async function displayNameOf(uri: string): Promise<string> {
  try {
    const name = await ComicArchive.getDisplayName(uri);
    if (name) return name;
  } catch {
    // ricava dall'URI
  }
  return nameFromUri(uri);
}

export function nameFromUri(uri: string): string {
  const last = uri.split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // lascia com'è
  }
  const afterSlash = decoded.split('/').pop() ?? decoded;
  return afterSlash.includes(':') ? afterSlash.slice(afterSlash.lastIndexOf(':') + 1) : afterSlash;
}

export interface RestoreResult {
  imported: number;
  skipped: number;
  failed: { name: string; message: string }[];
}

/**
 * Ripristina da una cartella: importa tutti i fumetti presenti (anche senza manifest,
 * es. una cartella qualsiasi di .cbz/.cbr) e, se c'è il manifest, riapplica progressi e preferiti.
 */
export async function restoreFromFolder(
  folder: Directory,
  onProgress: (p: Progress) => void,
  isCanceled: () => boolean,
  onImported: (comic: ComicSummary) => void,
): Promise<RestoreResult> {
  const files: { file: File; name: string }[] = [];
  for (const item of folder.list()) {
    if (item instanceof File) files.push({ file: item, name: await displayNameOf(item.uri) });
  }
  const manifestFile = files.find((f) => f.name === MANIFEST_NAME);
  const manifest = manifestFile ? parseManifest(await manifestFile.file.text()) : null;
  const byFile = new Map((manifest?.comics ?? []).map((e) => [e.file, e]));

  const comicFiles = files.filter((f) => isComicFileName(f.name));
  const result: RestoreResult = { imported: 0, skipped: 0, failed: [] };

  for (let i = 0; i < comicFiles.length; i++) {
    if (isCanceled()) throw new CanceledError();
    const { file, name } = comicFiles[i];
    const entry = byFile.get(name);
    onProgress({ done: i, total: comicFiles.length, current: entry?.title || name });
    try {
      const comic = await importComic({ uri: file.uri, name: entry?.fileName || name });
      if (entry) {
        const patch = {
          title: entry.title || comic.title,
          currentPage: Math.min(Math.max(0, entry.currentPage), comic.pageCount - 1),
          completed: entry.completed,
          favorite: entry.favorite,
          readingMode: entry.readingMode,
          lastReadAt: entry.lastReadAt,
        };
        await updateComic(comic.id, patch);
        Object.assign(comic, patch);
      }
      onImported(comic);
      result.imported++;
    } catch (e) {
      if (e instanceof DuplicateError) result.skipped++;
      else result.failed.push({ name, message: e instanceof Error ? e.message : String(e) });
    }
  }
  onProgress({ done: comicFiles.length, total: comicFiles.length, current: '' });
  return result;
}
