/**
 * Importazione:
 * 1. si riconosce il tipo di file dal contenuto (fumetto, GIF/immagine/video, backup)
 * 2. fumetti: il modulo nativo apre l'archivio (CBZ/CBR/CB7/CBT/PDF) e salva le pagine come file numerati
 * 3. si crea una copertina piccola (per la griglia) e si salva la scheda nel database
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import ComicArchive, { type DetectedType, type ExtractResult } from '../../modules/comic-archive';
import type { Comic, MediaKind, PageInfo } from '@/types';
import { fileNameExists, insertComic } from './db';
import { createId, isVaultFileName, mediaKindFromName, titleFromFileName } from './format';
import { comicDir, comicDirPrefix } from './paths';
import { parseSeriesInfo } from './series';

export interface ImportSource {
  /** file:// oppure content:// */
  uri: string;
  /** Nome originale del file, se già noto. */
  name?: string | null;
}

export class DuplicateError extends Error {
  constructor(public fileName: string) {
    super(`"${fileName}" è già in libreria`);
  }
}

const COVER_WIDTH = 420;

export async function resolveFileName(source: ImportSource): Promise<string> {
  if (source.name) return source.name;
  try {
    const name = await ComicArchive.getDisplayName(source.uri);
    if (name) return name;
  } catch {
    // ignora: usiamo il nome dall'URI
  }
  let last = source.uri.split('/').pop() ?? '';
  try {
    last = decodeURIComponent(last);
  } catch {
    // lascia com'è
  }
  last = last.split('/').pop() ?? last;
  if (last.includes(':')) last = last.slice(last.lastIndexOf(':') + 1);
  return last || 'file';
}

export type Destination = { kind: 'comic' } | { kind: 'media'; media: MediaKind } | { kind: 'vault' };

/**
 * Dove va un file: nella libreria, nei media o è un backup da ripristinare.
 * Si guarda il contenuto (i primi byte); il nome serve solo se il contenuto non dice nulla.
 */
export async function classify(uri: string, name: string): Promise<Destination> {
  if (isVaultFileName(name)) return { kind: 'vault' };
  let detected: DetectedType | null = null;
  try {
    detected = await ComicArchive.detectType(uri);
  } catch {
    detected = null;
  }
  if (detected === 'gif') return { kind: 'media', media: 'gif' };
  if (detected === 'image') return { kind: 'media', media: 'image' };
  if (detected === 'video') return { kind: 'media', media: 'video' };
  if (detected && detected !== 'unknown') return { kind: 'comic' };
  const byName = mediaKindFromName(name);
  if (byName) return { kind: 'media', media: byName };
  return { kind: 'comic' }; // ci prova l'estrattore, che in caso di errore spiega il motivo
}

export interface ComicMeta {
  title?: string;
  series?: string;
  chapter?: number | null;
}

export async function importComic(
  source: ImportSource,
  opts: { allowDuplicates?: boolean; meta?: ComicMeta } = {},
): Promise<Comic> {
  const fileName = await resolveFileName(source);
  if (!opts.allowDuplicates && (await fileNameExists(fileName))) throw new DuplicateError(fileName);
  return createComic(fileName, opts.meta ?? {}, (dir) => ComicArchive.extractImages(source.uri, dir.uri));
}

/** Una cartella di immagini (es. un capitolo di webtoon scaricato) diventa un fumetto. */
export async function importImageSet(
  label: string,
  files: { uri: string; name: string }[],
  meta: ComicMeta = {},
): Promise<Comic> {
  if (await fileNameExists(label)) throw new DuplicateError(label);
  return createComic(label, meta, (dir) =>
    ComicArchive.importImages(
      files.map((f) => f.uri),
      files.map((f) => f.name),
      dir.uri,
    ),
  );
}

async function createComic(
  fileName: string,
  meta: ComicMeta,
  extract: (dir: Directory) => Promise<ExtractResult>,
): Promise<Comic> {
  const id = createId();
  const dir = comicDir(id);
  dir.create({ intermediates: true, idempotent: true });

  try {
    const result = await extract(dir);
    if (result.pages.length === 0) {
      throw new Error('Nel file non ci sono immagini: non sembra un fumetto.');
    }
    const pages: PageInfo[] = result.pages.map((p) => ({ n: p.name, w: p.width, h: p.height }));
    // Se la miniatura non si riesce a creare, si usa direttamente la prima pagina.
    const cover = (await createCover(id, dir, pages[0])) ?? pages[0].n;
    const parsed = parseSeriesInfo(fileName);

    const comic: Comic = {
      id,
      title: meta.title?.trim() || titleFromFileName(fileName),
      fileName,
      format: result.format,
      pageCount: pages.length,
      sizeBytes: Math.round(result.totalBytes),
      addedAt: new Date().toISOString(),
      lastReadAt: null,
      currentPage: 0,
      completed: false,
      favorite: false,
      readingMode: null,
      cover,
      pages,
      series: meta.series?.trim() ?? parsed.series,
      chapter: meta.chapter !== undefined ? meta.chapter : parsed.chapter,
      author: '',
      tags: [],
    };
    await insertComic(comic);
    return comic;
  } catch (e) {
    try {
      if (dir.exists) dir.delete();
    } catch {
      // niente da fare
    }
    throw e;
  }
}

/**
 * Copertina ridotta della prima pagina. Per le pagine lunghissime (webtoon)
 * prende solo la parte alta, così la miniatura resta leggibile.
 */
async function createCover(id: string, dir: Directory, first: PageInfo): Promise<string | null> {
  try {
    const context = ImageManipulator.manipulate(`${comicDirPrefix(id)}${first.n}`);
    if (first.w > 0 && first.h > first.w * 1.7) {
      context.crop({ originX: 0, originY: 0, width: first.w, height: Math.round(first.w * 1.5) });
    }
    context.resize({ width: COVER_WIDTH, height: null });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
    const temp = new File(saved.uri);
    const target = new File(dir, 'cover.jpg');
    if (target.exists) target.delete();
    temp.move(target);
    return 'cover.jpg';
  } catch {
    return null; // senza copertina si usa la prima pagina
  }
}

/** true se il file è una copia temporanea nella cache dell'app (non un originale dell'utente). */
export function isTempCopy(uri: string): boolean {
  return uri.startsWith(Paths.cache.uri);
}

/** Rimuove la copia temporanea creata dal selettore file (non tocca mai i file originali). */
export function deleteTempCopy(uri: string) {
  // Solo file dentro la cache privata dell'app: gli originali dell'utente non si toccano mai.
  if (!isTempCopy(uri)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignora
  }
}
