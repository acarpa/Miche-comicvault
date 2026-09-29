/**
 * Importazione di un fumetto:
 * 1. il modulo nativo apre l'archivio (CBZ/CBR/CB7/...) e salva le pagine come file numerati
 * 2. si crea una copertina piccola (per la griglia)
 * 3. si salva la scheda nel database
 */
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import ComicArchive from '../../modules/comic-archive';
import type { Comic, PageInfo } from '@/types';
import { fileNameExists, insertComic } from './db';
import { createId, titleFromFileName } from './format';
import { comicDir, comicDirPrefix } from './paths';

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
  const last = decodeURIComponent(source.uri.split('/').pop() ?? '');
  return last || 'fumetto.cbz';
}

export async function importComic(source: ImportSource, opts: { allowDuplicates?: boolean } = {}): Promise<Comic> {
  const fileName = await resolveFileName(source);
  if (!opts.allowDuplicates && (await fileNameExists(fileName))) throw new DuplicateError(fileName);

  const id = createId();
  const dir = comicDir(id);
  dir.create({ intermediates: true, idempotent: true });

  try {
    const result = await ComicArchive.extractImages(source.uri, dir.uri);
    if (result.pages.length === 0) {
      throw new Error('Nel file non ci sono immagini: non sembra un fumetto.');
    }
    const pages: PageInfo[] = result.pages.map((p) => ({ n: p.name, w: p.width, h: p.height }));
    // Se la miniatura non si riesce a creare, si usa direttamente la prima pagina.
    const cover = (await createCover(id, dir, pages[0])) ?? pages[0].n;

    const comic: Comic = {
      id,
      title: titleFromFileName(fileName),
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
    await temp.move(target);
    return 'cover.jpg';
  } catch {
    return null; // senza copertina si usa la prima pagina
  }
}

/** Rimuove la copia temporanea creata dal selettore file (non tocca mai i file originali). */
export function deleteTempCopy(uri: string) {
  // Solo file dentro la cache privata dell'app: gli originali dell'utente non si toccano mai.
  const cache = Paths.cache.uri;
  if (!uri.startsWith(cache)) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignora
  }
}
