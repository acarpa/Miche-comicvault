/** Filtri e ordinamenti della libreria (funzioni pure, testabili a parte). */
import type { ComicSummary, LibraryFilter, LibrarySort, MediaFilter, MediaItem } from '@/types';
import { naturalCompare } from './format';
import { compareChapters, seriesKey } from './series';

export function isReading(c: ComicSummary): boolean {
  return !c.completed && (c.currentPage > 0 || c.lastReadAt !== null);
}

export function matchesFilter(c: ComicSummary, filter: LibraryFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'reading':
      return isReading(c);
    case 'unread':
      return !c.completed && !isReading(c);
    case 'completed':
      return c.completed;
    case 'favorites':
      return c.favorite;
  }
}

function byDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
}

export function sortComics(list: ComicSummary[], sort: LibrarySort): ComicSummary[] {
  const out = [...list];
  switch (sort) {
    case 'title':
      out.sort((a, b) => naturalCompare(a.title, b.title));
      break;
    case 'added':
      out.sort((a, b) => byDateDesc(a.addedAt, b.addedAt) || naturalCompare(a.title, b.title));
      break;
    case 'series':
      // Raggruppati per serie (capitoli in ordine), i fumetti singoli per titolo.
      out.sort((a, b) => {
        const ka = seriesKey(a.series) || seriesKey(a.title);
        const kb = seriesKey(b.series) || seriesKey(b.title);
        if (ka !== kb) return naturalCompare(ka, kb);
        return compareChapters(a, b);
      });
      break;
    case 'recent':
      // prima quelli letti di recente, poi i nuovi arrivi
      out.sort(
        (a, b) =>
          byDateDesc(a.lastReadAt, b.lastReadAt) || byDateDesc(a.addedAt, b.addedAt) || naturalCompare(a.title, b.title),
      );
      break;
  }
  return out;
}

export function searchComics(list: ComicSummary[], query: string): ComicSummary[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return list;
  return list.filter((c) => {
    const haystack = `${c.title} ${c.fileName} ${c.series} ${c.author} ${c.tags.map((t) => `#${t}`).join(' ')}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export interface LibraryQuery {
  filter: LibraryFilter;
  sort: LibrarySort;
  query: string;
  /** Solo i fumetti con questo tag (senza distinguere maiuscole). */
  tag?: string | null;
  /** Solo i fumetti di questo autore. */
  author?: string | null;
}

export function visibleComics(list: ComicSummary[], opts: LibraryQuery): ComicSummary[] {
  const tag = opts.tag?.trim().toLowerCase() || null;
  const author = opts.author?.trim().toLowerCase() || null;
  const filtered = list.filter(
    (c) =>
      matchesFilter(c, opts.filter) &&
      (!tag || c.tags.some((t) => t.toLowerCase() === tag)) &&
      (!author || c.author.trim().toLowerCase() === author),
  );
  return sortComics(searchComics(filtered, opts.query), opts.sort);
}

/** "Continua a leggere": in corso, dal più recente. */
export function continueReading(list: ComicSummary[], max = 12): ComicSummary[] {
  return list
    .filter((c) => isReading(c) && c.lastReadAt)
    .sort((a, b) => byDateDesc(a.lastReadAt, b.lastReadAt))
    .slice(0, max);
}

export function countByFilter(list: ComicSummary[]): Record<LibraryFilter, number> {
  const out: Record<LibraryFilter, number> = { all: 0, reading: 0, unread: 0, completed: 0, favorites: 0 };
  for (const c of list) {
    out.all++;
    if (matchesFilter(c, 'reading')) out.reading++;
    if (matchesFilter(c, 'unread')) out.unread++;
    if (c.completed) out.completed++;
    if (c.favorite) out.favorites++;
  }
  return out;
}

export function totalSize(list: ComicSummary[]): number {
  return list.reduce((sum, c) => sum + c.sizeBytes, 0);
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export function visibleMedia(list: MediaItem[], filter: MediaFilter, query: string): MediaItem[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return list
    .filter((m) => (filter === 'all' ? true : filter === 'favorites' ? m.favorite : m.kind === filter))
    .filter((m) => {
      if (words.length === 0) return true;
      const haystack = `${m.title} ${m.originalName}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    })
    .sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0));
}

export function countMedia(list: MediaItem[]): Record<MediaFilter, number> {
  const out: Record<MediaFilter, number> = { all: 0, gif: 0, video: 0, image: 0, favorites: 0 };
  for (const m of list) {
    out.all++;
    out[m.kind]++;
    if (m.favorite) out.favorites++;
  }
  return out;
}
