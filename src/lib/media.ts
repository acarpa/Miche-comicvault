/**
 * Sezione Media: GIF, immagini e video personali, salvati nella memoria privata dell'app.
 */
import { File } from 'expo-file-system';

import ComicArchive from '../../modules/comic-archive';
import type { MediaItem, MediaKind } from '@/types';
import { insertMedia } from './db';
import { createId, extensionOf, titleFromFileName } from './format';
import { isTempCopy, resolveFileName, type ImportSource } from './importer';
import { mediaRoot, mediaThumbsDir } from './paths';

const DEFAULT_EXT: Record<MediaKind, string> = { gif: 'gif', image: 'jpg', video: 'mp4' };

export async function importMedia(source: ImportSource, kind: MediaKind): Promise<MediaItem> {
  const originalName = await resolveFileName(source);
  const id = createId();
  const ext = extensionOf(originalName) || DEFAULT_EXT[kind];
  const fileName = `${id}.${ext}`;

  const root = mediaRoot();
  root.create({ intermediates: true, idempotent: true });
  const thumbs = mediaThumbsDir();
  thumbs.create({ intermediates: true, idempotent: true });

  const target = new File(root, fileName);
  const thumbName = `${id}.jpg`;
  const thumbFile = new File(thumbs, thumbName);

  try {
    // Le copie temporanee del selettore si spostano (istantaneo), gli altri file si copiano.
    if (isTempCopy(source.uri)) new File(source.uri).move(target);
    else await ComicArchive.copyFile(source.uri, target.uri);

    const info = await ComicArchive.mediaInfo(target.uri, kind, thumbFile.uri);
    const item: MediaItem = {
      id,
      title: titleFromFileName(originalName),
      originalName,
      kind,
      fileName,
      width: info.width,
      height: info.height,
      durationMs: info.durationMs,
      sizeBytes: target.size ?? 0,
      addedAt: new Date().toISOString(),
      favorite: false,
      thumb: info.thumb ? thumbName : null,
    };
    await insertMedia(item);
    return item;
  } catch (e) {
    deleteMediaFiles({ fileName, thumb: thumbName });
    throw e;
  }
}

/** Elimina il file e la miniatura (se non ci riesce, pazienza: sono nella memoria privata). */
export function deleteMediaFiles(item: Pick<MediaItem, 'fileName' | 'thumb'>) {
  for (const f of [new File(mediaRoot(), item.fileName), item.thumb ? new File(mediaThumbsDir(), item.thumb) : null]) {
    try {
      if (f?.exists) f.delete();
    } catch {
      // ignora
    }
  }
}
