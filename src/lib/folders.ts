/**
 * Importazione di una cartella intera:
 * - i fumetti (.cbz, .cbr, .pdf...) dentro la cartella si importano uno per uno;
 * - le immagini sciolte diventano un fumetto (es. un capitolo di webtoon scaricato come JPG);
 * - le sottocartelle piene di immagini diventano i capitoli di una serie che ha il nome della cartella;
 * - GIF e video vanno nella sezione Media.
 */
import { Directory, File } from 'expo-file-system';

import ComicArchive from '../../modules/comic-archive';
import type { MediaKind } from '@/types';
import { isComicFileName, isImageFileName, mediaKindFromName, naturalCompare } from './format';
import { parseSeriesInfo } from './series';

export interface NamedUri {
  uri: string;
  name: string;
}

export interface ImageSetJob {
  label: string;
  title: string;
  series: string;
  chapter: number | null;
  files: NamedUri[];
}

export interface FolderScan {
  folderName: string;
  /** seriesHint: se dal nome del file non si capisce la serie, si usa il nome della cartella. */
  archives: (NamedUri & { seriesHint: string })[];
  imageSets: ImageSetJob[];
  media: (NamedUri & { kind: MediaKind })[];
}

/** Nome leggibile di un file o di una cartella (anche per gli indirizzi content:// del selettore). */
export async function nameOf(item: { uri: string; name?: string }): Promise<string> {
  const direct = item.name;
  if (direct && !/[%:/]/.test(direct)) return direct;
  try {
    const name = await ComicArchive.getDisplayName(item.uri);
    if (name) return name;
  } catch {
    // ricava dall'URI
  }
  return nameFromUri(item.uri);
}

export function nameFromUri(uri: string): string {
  const last = uri.replace(/\/+$/, '').split('/').pop() ?? '';
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    // lascia com'è
  }
  const afterSlash = decoded.split('/').pop() ?? decoded;
  return afterSlash.includes(':') ? afterSlash.slice(afterSlash.lastIndexOf(':') + 1) : afterSlash;
}

/** Numero del capitolo dal nome della sottocartella ("Capitolo 12", "12", "c012"). */
export function chapterFromFolder(name: string): number | null {
  const plain = /^\s*(\d+(?:[.,]\d+)?)\s*$/.exec(name);
  if (plain) return Number.parseFloat(plain[1].replace(',', '.'));
  return parseSeriesInfo(name).chapter;
}

interface Listing {
  files: NamedUri[];
  dirs: { dir: Directory; name: string }[];
}

async function listFolder(folder: Directory): Promise<Listing> {
  const out: Listing = { files: [], dirs: [] };
  for (const item of folder.list()) {
    if (item instanceof File) out.files.push({ uri: item.uri, name: await nameOf(item) });
    else if (item instanceof Directory) out.dirs.push({ dir: item, name: await nameOf(item) });
  }
  out.files.sort((a, b) => naturalCompare(a.name, b.name));
  out.dirs.sort((a, b) => naturalCompare(a.name, b.name));
  return out;
}

function splitFiles(files: NamedUri[]) {
  const archives = files.filter((f) => isComicFileName(f.name));
  const images = files.filter((f) => isImageFileName(f.name) && !f.name.startsWith('.'));
  const videos = files.filter((f) => mediaKindFromName(f.name) === 'video');
  // Solo GIF: sono animazioni da guardare, non pagine di un fumetto.
  const onlyGifs = images.length > 0 && images.every((f) => /\.gif$/i.test(f.name));
  return { archives, images: onlyGifs ? [] : images, gifs: onlyGifs ? images : [], videos };
}

export async function scanFolder(folder: Directory): Promise<FolderScan> {
  const folderName = await nameOf(folder);
  const top = await listFolder(folder);
  const scan: FolderScan = { folderName, archives: [], imageSets: [], media: [] };

  const root = splitFiles(top.files);
  scan.archives.push(...root.archives.map((f) => ({ ...f, seriesHint: folderName })));
  scan.media.push(...root.gifs.map((f) => ({ ...f, kind: 'gif' as const })), ...root.videos.map((f) => ({ ...f, kind: 'video' as const })));

  const hasChapterDirs = top.dirs.length > 0;
  if (root.images.length > 0) {
    const parsed = parseSeriesInfo(folderName);
    scan.imageSets.push({
      label: folderName,
      title: folderName,
      // Se ci sono anche sottocartelle, le immagini sciolte sono un capitolo della stessa serie.
      series: hasChapterDirs ? folderName : parsed.series,
      chapter: hasChapterDirs ? 0 : parsed.chapter,
      files: root.images,
    });
  }

  // Un livello di sottocartelle: "Serie/Capitolo 1/*.jpg", "Serie/Volume 2.cbz"...
  for (const { dir, name } of top.dirs) {
    const sub = await listFolder(dir);
    const parts = splitFiles(sub.files);
    scan.archives.push(...parts.archives.map((f) => ({ ...f, seriesHint: name })));
    scan.media.push(...parts.gifs.map((f) => ({ ...f, kind: 'gif' as const })), ...parts.videos.map((f) => ({ ...f, kind: 'video' as const })));
    if (parts.images.length > 0) {
      scan.imageSets.push({
        label: `${folderName}/${name}`,
        title: `${folderName} - ${name}`,
        series: folderName,
        chapter: chapterFromFolder(name),
        files: parts.images,
      });
    }
  }
  return scan;
}
