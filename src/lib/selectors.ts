/** Filtri e ordinamenti della libreria (funzioni pure, testabili a parte). */
import type { ComicSummary, LibraryFilter, LibrarySort } from '@/types';
import { naturalCompare } from './format';

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
    const haystack = `${c.title} ${c.fileName}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function visibleComics(
  list: ComicSummary[],
  opts: { filter: LibraryFilter; sort: LibrarySort; query: string },
): ComicSummary[] {
  return sortComics(searchComics(list.filter((c) => matchesFilter(c, opts.filter)), opts.query), opts.sort);
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
