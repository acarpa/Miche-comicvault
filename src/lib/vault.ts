/**
 * Backup vero in un solo file: "ComicVault <data>.comicvault" (è uno ZIP).
 * Contiene tutto il database (comicvault.json: fumetti, serie, tag, progressi, preferiti, media)
 * e i file (pagine, copertine, GIF, video). Si apre allo stesso modo su telefono e PC.
 *
 *   comicvault.json            indice (scritto per primo: si legge subito senza estrarre il resto)
 *   comics/<id>/0001.jpg ...   pagine e copertina
 *   media/<file>               GIF, immagini, video
 *   media/thumbs/<file>        miniature dei media
 *
 * "Solo progressi" crea un file piccolo con il solo indice: utile per portare il segno
 * di lettura dal telefono al PC (e viceversa) senza ricopiare tutti i fumetti.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import ComicArchive from '../../modules/comic-archive';
import type { Comic, ComicSummary, MediaItem, MediaKind, PageInfo, ReadingMode, VaultManifest, VaultSettings } from '@/types';
import { CanceledError, pickFolder, stamp, type Progress } from './backup';
import {
  insertComic,
  insertMedia,
  listComics,
  listComicsWithPages,
  listMedia,
  updateComic,
  updateMedia,
  type ComicPatch,
} from './db';
import { formatBytes, formatDateTime, titleFromFileName } from './format';
import { comicDir, comicDirPrefix, mediaRoot, mediaThumbsDir, mediaUri, mediaThumbUri } from './paths';
import { normalizeTags } from './series';

export const VAULT_MANIFEST = 'comicvault.json';
export const VAULT_MIME = 'application/octet-stream';
export const VAULT_EXTENSION = '.comicvault';
export const APP_VERSION = '2.0.0';

export type VaultKind = VaultManifest['kind'];

export function vaultFileName(kind: VaultKind, d = new Date()): string {
  return `ComicVault ${stamp(d)}${kind === 'progress' ? ' progressi' : ''}${VAULT_EXTENSION}`;
}

// ---------------------------------------------------------------------------
// Lettura e controllo dell'indice
// ---------------------------------------------------------------------------

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SAFE_NAME = /^(?!\.{1,2}$)[^/\\\u0000-\u001f]{1,200}$/;
const MODES: ReadingMode[] = ['ltr', 'rtl', 'vertical'];
const KINDS: MediaKind[] = ['gif', 'image', 'video'];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const iso = (v: unknown): string | null => (typeof v === 'string' && !Number.isNaN(new Date(v).getTime()) ? v : null);

function parseComic(raw: unknown): Comic | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const id = str(c.id);
  if (!SAFE_ID.test(id)) return null;
  const pages: PageInfo[] = (Array.isArray(c.pages) ? c.pages : [])
    .map((p): PageInfo | null => {
      if (!p || typeof p !== 'object') return null;
      const o = p as Record<string, unknown>;
      const n = str(o.n);
      return SAFE_NAME.test(n) ? { n, w: num(o.w), h: num(o.h) } : null;
    })
    .filter((p): p is PageInfo => p !== null);
  if (pages.length === 0) return null;
  const fileName = str(c.fileName) || `${id}.cbz`;
  const cover = str(c.cover);
  return {
    id,
    title: str(c.title).trim() || titleFromFileName(fileName),
    fileName,
    format: str(c.format),
    pageCount: pages.length,
    pages,
    sizeBytes: Math.max(0, Math.round(num(c.sizeBytes))),
    addedAt: iso(c.addedAt) ?? new Date().toISOString(),
    lastReadAt: iso(c.lastReadAt),
    currentPage: Math.min(Math.max(0, Math.round(num(c.currentPage))), pages.length - 1),
    completed: c.completed === true,
    favorite: c.favorite === true,
    readingMode: MODES.includes(c.readingMode as ReadingMode) ? (c.readingMode as ReadingMode) : null,
    cover: cover && SAFE_NAME.test(cover) ? cover : null,
    series: str(c.series).trim(),
    chapter: typeof c.chapter === 'number' && Number.isFinite(c.chapter) ? c.chapter : null,
    author: str(c.author).trim(),
    tags: normalizeTags(Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : []),
  };
}

function parseMedia(raw: unknown): MediaItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const id = str(m.id);
  const fileName = str(m.fileName);
  if (!SAFE_ID.test(id) || !SAFE_NAME.test(fileName)) return null;
  const thumb = str(m.thumb);
  return {
    id,
    title: str(m.title).trim() || titleFromFileName(str(m.originalName, fileName)),
    originalName: str(m.originalName, fileName),
    kind: KINDS.includes(m.kind as MediaKind) ? (m.kind as MediaKind) : 'image',
    fileName,
    width: Math.max(0, Math.round(num(m.width))),
    height: Math.max(0, Math.round(num(m.height))),
    durationMs: Math.max(0, Math.round(num(m.durationMs))),
    sizeBytes: Math.max(0, Math.round(num(m.sizeBytes))),
    addedAt: iso(m.addedAt) ?? new Date().toISOString(),
    favorite: m.favorite === true,
    thumb: thumb && SAFE_NAME.test(thumb) ? thumb : null,
  };
}

function parseSettings(raw: unknown): VaultSettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const s = raw as Record<string, unknown>;
  const out: VaultSettings = {};
  if (MODES.includes(s.defaultMode as ReadingMode)) out.defaultMode = s.defaultMode as ReadingMode;
  if (typeof s.tapZones === 'boolean') out.tapZones = s.tapZones;
  if (s.gridColumns === 2 || s.gridColumns === 3) out.gridColumns = s.gridColumns;
  if (s.progressStyle === 'pill' || s.progressStyle === 'line' || s.progressStyle === 'none') out.progressStyle = s.progressStyle;
  return out;
}

/** Controlla l'indice del backup (anche se creato dal PC). null = non valido. */
export function parseVaultManifest(text: string): VaultManifest | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  if (!raw || raw.app !== 'comicvault' || typeof raw.format !== 'number' || raw.format < 2) return null;
  const comics = (Array.isArray(raw.comics) ? raw.comics : []).map(parseComic).filter((c): c is Comic => c !== null);
  const media = (Array.isArray(raw.media) ? raw.media : []).map(parseMedia).filter((m): m is MediaItem => m !== null);
  const device = raw.device === 'android' || raw.device === 'windows' ? raw.device : 'other';
  return {
    app: 'comicvault',
    format: 2,
    kind: raw.kind === 'progress' ? 'progress' : 'full',
    exportedAt: iso(raw.exportedAt) ?? '',
    device,
    appVersion: str(raw.appVersion),
    comics,
    media,
    settings: parseSettings(raw.settings),
  };
}

export async function readVaultManifest(uri: string): Promise<VaultManifest> {
  let text: string | null;
  try {
    text = await ComicArchive.zipReadText(uri, VAULT_MANIFEST);
  } catch (e) {
    throw new Error(`Impossibile leggere il file: non è un backup di ComicVault o è danneggiato. (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!text) throw new Error('Questo file non è un backup di ComicVault (manca comicvault.json).');
  const manifest = parseVaultManifest(text);
  if (!manifest) throw new Error("Il backup è danneggiato o è stato creato da una versione dell'app non compatibile.");
  return manifest;
}

// ---------------------------------------------------------------------------
// Creazione
// ---------------------------------------------------------------------------

export async function buildManifest(kind: VaultKind, settings: VaultSettings): Promise<VaultManifest> {
  return {
    app: 'comicvault',
    format: 2,
    kind,
    exportedAt: new Date().toISOString(),
    device: 'android',
    appVersion: APP_VERSION,
    comics: await listComicsWithPages(),
    media: await listMedia(),
    settings,
  };
}

export interface VaultWriteResult {
  comics: number;
  media: number;
}

/** Scrive il backup in "dest" (file:// o content://). */
export async function writeVault(
  dest: string,
  manifest: VaultManifest,
  onProgress: (p: Progress) => void,
  isCanceled: () => boolean,
): Promise<VaultWriteResult> {
  const zip = await ComicArchive.zipOpen(dest);
  let closed = false;
  try {
    await ComicArchive.zipAddText(zip, VAULT_MANIFEST, JSON.stringify(manifest));
    if (manifest.kind === 'full') {
      const total = manifest.comics.length + manifest.media.length;
      let done = 0;
      for (const c of manifest.comics) {
        if (isCanceled()) throw new CanceledError();
        onProgress({ done, total, current: c.title });
        const names = c.pages.map((p) => p.n);
        if (c.cover && !names.includes(c.cover)) names.push(c.cover);
        const prefix = comicDirPrefix(c.id);
        await ComicArchive.zipAddFiles(
          zip,
          names.map((n) => prefix + n),
          names.map((n) => `comics/${c.id}/${n}`),
        );
        done++;
      }
      for (const m of manifest.media) {
        if (isCanceled()) throw new CanceledError();
        onProgress({ done, total, current: m.title });
        const paths = [mediaUri(m.fileName)];
        const names = [`media/${m.fileName}`];
        if (m.thumb) {
          paths.push(mediaThumbUri(m.thumb));
          names.push(`media/thumbs/${m.thumb}`);
        }
        await ComicArchive.zipAddFiles(zip, paths, names);
        done++;
      }
      onProgress({ done: total, total, current: '' });
    }
    await ComicArchive.zipClose(zip);
    closed = true;
    return { comics: manifest.comics.length, media: manifest.media.length };
  } finally {
    if (!closed) await ComicArchive.zipClose(zip).catch(() => {});
  }
}

/** Salva il backup in una cartella scelta (Download, scheda SD, chiavetta OTG...). null = annullato. */
export async function exportVaultToFolder(
  kind: VaultKind,
  settings: VaultSettings,
  onStart: () => void,
  onProgress: (p: Progress) => void,
  isCanceled: () => boolean,
): Promise<(VaultWriteResult & { name: string }) | null> {
  const folder = await pickFolder();
  if (!folder) return null;
  onStart();
  const manifest = await buildManifest(kind, settings);
  const name = vaultFileName(kind);
  const file = folder.createFile(name, VAULT_MIME);
  try {
    const result = await writeVault(file.uri, manifest, onProgress, isCanceled);
    return { ...result, name };
  } catch (e) {
    try {
      file.delete(); // niente file a metà
    } catch {
      // ignora
    }
    throw e;
  }
}

function exportDir(): Directory {
  return new Directory(Paths.cache, 'vault');
}

/** Crea il backup e apre "Condividi" (per mandarlo al PC, a Drive, a Telegram...). */
export async function shareVault(
  kind: VaultKind,
  settings: VaultSettings,
  onProgress: (p: Progress) => void,
  isCanceled: () => boolean,
): Promise<VaultWriteResult> {
  const dir = exportDir();
  if (dir.exists) dir.delete(); // elimina i backup condivisi in precedenza
  dir.create({ intermediates: true, idempotent: true });
  const manifest = await buildManifest(kind, settings);
  const file = new File(dir, vaultFileName(kind));
  try {
    const result = await writeVault(file.uri, manifest, onProgress, isCanceled);
    await Sharing.shareAsync(file.uri, { mimeType: VAULT_MIME, dialogTitle: 'Invia il backup di ComicVault' });
    return result;
  } catch (e) {
    try {
      if (file.exists) file.delete();
    } catch {
      // ignora
    }
    throw e;
  }
}

/** Elimina i file temporanei rimasti dai backup condivisi e dai ripristini. */
export function cleanupVaultTemp() {
  try {
    const dir = exportDir();
    if (dir.exists) dir.delete();
    for (const item of Paths.cache.list()) {
      if (item instanceof Directory && /\/restore-\d+\/?$/.test(item.uri)) item.delete();
    }
  } catch {
    // ignora
  }
}

// ---------------------------------------------------------------------------
// Ripristino
// ---------------------------------------------------------------------------

export type RestoreMode = 'merge' | 'replace';

export interface VaultRestoreResult {
  added: number;
  updated: number;
  unchanged: number;
  media: number;
  /** Fumetti del backup "solo progressi" che non sono su questo dispositivo. */
  missing: number;
  failed: { name: string; message: string }[];
}

/** Chiave per riconoscere lo stesso fumetto importato separatamente su due dispositivi. */
export const sameComicKey = (c: Pick<ComicSummary, 'fileName' | 'pageCount'>) => `${c.fileName.toLowerCase()}|${c.pageCount}`;

/**
 * Unione "intelligente" tra il fumetto sul telefono e quello nel backup:
 * vince la lettura più recente; preferiti, tag, serie e autore si sommano senza cancellare nulla.
 */
export function mergeComic(local: ComicSummary, backup: ComicSummary): ComicPatch {
  const patch: ComicPatch = {};
  if ((backup.lastReadAt ?? '') > (local.lastReadAt ?? '')) {
    patch.lastReadAt = backup.lastReadAt;
    patch.currentPage = Math.min(Math.max(0, backup.currentPage), Math.max(0, local.pageCount - 1));
    patch.completed = backup.completed;
  } else if (backup.completed && !local.completed && !local.lastReadAt) {
    patch.completed = true;
  }
  if (backup.favorite && !local.favorite) patch.favorite = true;
  if (!local.series.trim() && backup.series.trim()) {
    patch.series = backup.series;
    patch.chapter = backup.chapter;
  } else if (local.chapter === null && backup.chapter !== null && local.series.trim().toLowerCase() === backup.series.trim().toLowerCase()) {
    patch.chapter = backup.chapter;
  }
  if (!local.author.trim() && backup.author.trim()) patch.author = backup.author;
  const tags = normalizeTags([...local.tags, ...backup.tags]);
  if (tags.length !== local.tags.length) patch.tags = tags;
  if (!local.readingMode && backup.readingMode) patch.readingMode = backup.readingMode;
  const neverRenamed = local.title === titleFromFileName(local.fileName);
  if (neverRenamed && backup.title.trim() && backup.title !== local.title) patch.title = backup.title;
  return patch;
}

function countFiles(manifest: VaultManifest): number {
  let n = 1; // l'indice
  for (const c of manifest.comics) n += c.pages.length + (c.cover && !c.pages.some((p) => p.n === c.cover) ? 1 : 0);
  for (const m of manifest.media) n += m.thumb ? 2 : 1;
  return n;
}

function bytesOf(manifest: VaultManifest): number {
  return (
    manifest.comics.reduce((sum, c) => sum + c.sizeBytes, 0) + manifest.media.reduce((sum, m) => sum + m.sizeBytes, 0)
  );
}

/** Controllo dello spazio libero prima di estrarre (se il telefono lo sa dire). */
function checkSpace(manifest: VaultManifest) {
  const free = (Paths as unknown as { availableDiskSpace?: number }).availableDiskSpace;
  const needed = bytesOf(manifest) * 1.05 + 50 * 1024 * 1024;
  if (typeof free === 'number' && free > 0 && free < needed) {
    throw new Error(
      `Spazio insufficiente sul telefono: servono circa ${formatBytes(needed)}, liberi ${formatBytes(free)}. Libera spazio e riprova.`,
    );
  }
}

export interface RestoreHooks {
  onProgress: (p: Progress) => void;
  isCanceled: () => boolean;
  /** Svuota la libreria e i media (solo per "sostituisci"). */
  clearAll: () => Promise<void>;
}

export async function restoreVault(
  uri: string,
  manifest: VaultManifest,
  mode: RestoreMode,
  hooks: RestoreHooks,
): Promise<VaultRestoreResult> {
  const result: VaultRestoreResult = { added: 0, updated: 0, unchanged: 0, media: 0, missing: 0, failed: [] };

  if (manifest.kind === 'progress') {
    await applyProgress(manifest, result, hooks);
    return result;
  }

  checkSpace(manifest);
  const staging = new Directory(Paths.cache, `restore-${Date.now()}`);
  staging.create({ intermediates: true, idempotent: true });
  try {
    // 1. Estrazione di tutto il backup in una cartella temporanea.
    const total = countFiles(manifest);
    hooks.onProgress({ done: 0, total, current: 'Estrazione del backup…' });
    const sub = ComicArchive.addListener('onProgress', (e) => {
      if (e.op === 'extract') hooks.onProgress({ done: Math.min(e.done, total), total, current: 'Estrazione del backup…' });
    });
    try {
      await ComicArchive.zipExtract(uri, staging.uri);
    } finally {
      sub.remove();
    }
    if (hooks.isCanceled()) throw new CanceledError();

    // 2. Solo ora (backup letto per intero) si svuota la libreria, se richiesto.
    if (mode === 'replace') await hooks.clearAll();

    // 3. Fumetti: si spostano le cartelle (istantaneo) e si aggiunge la scheda.
    const local = mode === 'replace' ? [] : await listComics();
    const byId = new Map(local.map((c) => [c.id, c]));
    const byKey = new Map(local.map((c) => [sameComicKey(c), c]));
    const steps = manifest.comics.length + manifest.media.length;
    let done = 0;
    for (const c of manifest.comics) {
      if (hooks.isCanceled()) throw new CanceledError();
      hooks.onProgress({ done: done++, total: steps, current: c.title });
      const existing = byId.get(c.id) ?? byKey.get(sameComicKey(c));
      try {
        if (existing) {
          const patch = mergeComic(existing, c);
          if (Object.keys(patch).length > 0) {
            await updateComic(existing.id, patch);
            result.updated++;
          } else {
            result.unchanged++;
          }
          continue;
        }
        const src = new Directory(staging, 'comics', c.id);
        if (!src.exists || !new File(src, c.pages[0].n).exists) {
          result.failed.push({ name: c.title, message: 'le pagine mancano nel backup' });
          continue;
        }
        const moved = await ComicArchive.moveDirectory(src.uri, comicDir(c.id).uri);
        if (!moved) throw new Error('impossibile copiare le pagine');
        await insertComic(c);
        byId.set(c.id, c);
        byKey.set(sameComicKey(c), c);
        result.added++;
      } catch (e) {
        result.failed.push({ name: c.title, message: e instanceof Error ? e.message : String(e) });
      }
    }

    // 4. Media
    const localMedia = mode === 'replace' ? [] : await listMedia();
    const mediaById = new Map(localMedia.map((m) => [m.id, m]));
    const root = mediaRoot();
    root.create({ intermediates: true, idempotent: true });
    const thumbs = mediaThumbsDir();
    thumbs.create({ intermediates: true, idempotent: true });
    for (const m of manifest.media) {
      if (hooks.isCanceled()) throw new CanceledError();
      hooks.onProgress({ done: done++, total: steps, current: m.title });
      try {
        const existing = mediaById.get(m.id);
        if (existing) {
          if (m.favorite && !existing.favorite) await updateMedia(m.id, { favorite: true });
          continue;
        }
        const src = new File(staging, 'media', m.fileName);
        if (!src.exists) {
          result.failed.push({ name: m.title, message: 'il file manca nel backup' });
          continue;
        }
        const target = new File(root, m.fileName);
        if (target.exists) target.delete();
        src.move(target);
        let thumb: string | null = null;
        if (m.thumb) {
          const t = new File(staging, 'media', 'thumbs', m.thumb);
          if (t.exists) {
            const tTarget = new File(thumbs, m.thumb);
            if (tTarget.exists) tTarget.delete();
            t.move(tTarget);
            thumb = m.thumb;
          }
        }
        await insertMedia({ ...m, thumb });
        result.media++;
      } catch (e) {
        result.failed.push({ name: m.title, message: e instanceof Error ? e.message : String(e) });
      }
    }
    hooks.onProgress({ done: steps, total: steps, current: '' });
    return result;
  } finally {
    try {
      if (staging.exists) staging.delete();
    } catch {
      // verrà pulita al prossimo avvio
    }
  }
}

/** Backup "solo progressi": aggiorna i fumetti già presenti, senza file. */
async function applyProgress(manifest: VaultManifest, result: VaultRestoreResult, hooks: RestoreHooks) {
  const local = await listComics();
  const byId = new Map(local.map((c) => [c.id, c]));
  const byKey = new Map(local.map((c) => [sameComicKey(c), c]));
  const total = manifest.comics.length;
  let done = 0;
  for (const c of manifest.comics) {
    if (hooks.isCanceled()) throw new CanceledError();
    hooks.onProgress({ done: done++, total, current: c.title });
    const existing = byId.get(c.id) ?? byKey.get(sameComicKey(c));
    if (!existing) {
      result.missing++;
      continue;
    }
    const patch = mergeComic(existing, c);
    if (Object.keys(patch).length === 0) {
      result.unchanged++;
      continue;
    }
    await updateComic(existing.id, patch);
    result.updated++;
  }
  const localMedia = new Map((await listMedia()).map((m) => [m.id, m]));
  for (const m of manifest.media) {
    const existing = localMedia.get(m.id);
    if (existing && m.favorite && !existing.favorite) await updateMedia(m.id, { favorite: true });
  }
  hooks.onProgress({ done: total, total, current: '' });
}

/** Riassunto leggibile di un backup (prima di ripristinarlo). */
export function describeManifest(m: VaultManifest): string {
  const where = m.device === 'windows' ? 'dal PC' : m.device === 'android' ? 'dal telefono' : '';
  const when = m.exportedAt ? `del ${formatDateTime(m.exportedAt)}` : '';
  const what =
    m.kind === 'progress'
      ? `Solo progressi di ${m.comics.length} fumetti`
      : `${m.comics.length} fumetti e ${m.media.length} media · ${formatBytes(bytesOf(m))}`;
  return [what, [when, where].filter(Boolean).join(' ')].filter(Boolean).join('\n');
}
