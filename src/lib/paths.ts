/**
 * Dove vivono i file sul telefono (memoria privata dell'app, non visibile ad altre app):
 *   <documenti app>/comics/<id>/0001.jpg, 0002.jpg, ..., copertina
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
