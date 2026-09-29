/**
 * Dove vivono i file sul telefono (memoria privata dell'app, non visibile ad altre app):
 *   <documenti app>/comics/<id>/0001.jpg, 0002.jpg, ..., copertina
 *   <documenti app>/media/<id>.mp4, <id>.gif, ...
 *   <documenti app>/media/thumbs/<id>.jpg
 */
import { Directory, Paths } from 'expo-file-system';

export function comicsRoot(): Directory {
  return new Directory(Paths.document, 'comics');
}

export function comicDir(id: string): Directory {
  return new Directory(Paths.document, 'comics', id);
}

/** URI della cartella con la "/" finale, per costruire velocemente gli URI delle pagine. */
export function comicDirPrefix(id: string): string {
  const uri = comicDir(id).uri;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

export function mediaRoot(): Directory {
  return new Directory(Paths.document, 'media');
}

export function mediaThumbsDir(): Directory {
  return new Directory(Paths.document, 'media', 'thumbs');
}

function withSlash(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`;
}

/** URI di un file media salvato. */
export function mediaUri(fileName: string): string {
  return `${withSlash(mediaRoot().uri)}${fileName}`;
}

export function mediaThumbUri(fileName: string): string {
  return `${withSlash(mediaThumbsDir().uri)}${fileName}`;
}

export function pageUri(prefix: string, fileName: string): string {
  return `${prefix}${fileName}`;
}

export function importTempDir(): Directory {
  return new Directory(Paths.cache, 'import');
}

/** Ultimo pezzo del percorso (nome della cartella o del file), senza "/" finale. */
export function lastSegment(uri: string): string {
  const trimmed = uri.replace(/\/+$/, '');
  const last = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}
