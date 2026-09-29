/**
 * Serie e capitoli (funzioni pure, testabili senza telefono).
 * Dal nome del file si ricava la serie e il numero di capitolo:
 *   "One Piece - Chapter 1045.cbz"  -> One Piece, 1045
 *   "Naruto v01 c003.cbr"           -> Naruto, 3
 *   "[Gruppo] Solo Leveling 150.cbz" -> Solo Leveling, 150
 *   "Batman Vol. 2 (2016).cbz"      -> Batman, 2
 * Si può sempre correggere a mano dalla scheda del fumetto.
 */
import type { ComicSummary } from '@/types';
import { naturalCompare, titleFromFileName } from './format';

export interface SeriesInfo {
  /** "" se non si riconosce una serie. */
  series: string;
  chapter: number | null;
}

const NUM = '(\\d+(?:[.,]\\d+)?)';
const BEFORE = '(?:^|[\\s_\\-.,(\\[])';
const CHAPTER_RE = new RegExp(
  `${BEFORE}(?:(?:chapter|chap|ch|capitolo|cap|episodio|episode|epis|ep|issue|numero|num|no|n°|nº)\\.?\\s*|[ce](?=\\d)|#\\s*)${NUM}`,
  'i',
);
const VOLUME_RE = new RegExp(`${BEFORE}(?:(?:volume|vol|tomo|book|libro|parte|part|pt)\\.?\\s*|[vt](?=\\d))${NUM}`, 'i');
/** "Serie - 012 - Titolo del capitolo" */
const DASH_RE = /^(.*?\D)\s+[-–—:]\s+(\d{1,4}(?:[.,]\d+)?)(?:\s+[-–—:]\s+.*)?$/;
/** "Solo Leveling 150", "Batman 012", "Serie #3" */
const TRAILING_RE = /^(.*?[^\d\s])[\s_\-.#]*(\d{1,4}(?:[.,]\d+)?)$/;

function toNumber(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function cleanSeries(s: string): string {
  return s
    .replace(/^[\s\-_.,:;#–—]+/, '')
    .replace(/[\s\-_.,:;#–—]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Toglie estensione, trattini bassi e le parti tra parentesi (gruppi, anni, qualità). */
export function cleanName(fileName: string): string {
  return titleFromFileName(fileName)
    .replace(/\[[^\]]*\]|\([^)]*\)|\{[^}]*\}/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function parseSeriesInfo(fileName: string): SeriesInfo {
  const name = cleanName(fileName);
  if (!name) return { series: '', chapter: null };

  const ch = CHAPTER_RE.exec(name);
  const vol = VOLUME_RE.exec(name);
  if (ch || vol) {
    const cut = Math.min(ch?.index ?? Infinity, vol?.index ?? Infinity);
    const chapter = toNumber((ch ?? vol)![1]);
    return { series: cleanSeries(name.slice(0, cut)), chapter };
  }

  const dash = DASH_RE.exec(name);
  if (dash) return { series: cleanSeries(dash[1]), chapter: toNumber(dash[2]) };

  const trailing = TRAILING_RE.exec(name);
  if (trailing) {
    const series = cleanSeries(trailing[1]);
    if (series.length >= 2) return { series, chapter: toNumber(trailing[2]) };
  }
  return { series: '', chapter: null };
}

/** Chiave per raggruppare: "One Piece", "one piece" e "One_Piece" sono la stessa serie. */
export function seriesKey(series: string): string {
  return series
    .toLowerCase()
    .replace(/[\s\-_.,:;!?'"’`()[\]{}#&+]+/g, ' ')
    .trim();
}

/** Ordine dei capitoli: per numero, poi per titolo. */
export function compareChapters(a: ComicSummary, b: ComicSummary): number {
  if (a.chapter !== null && b.chapter !== null && a.chapter !== b.chapter) return a.chapter - b.chapter;
  if (a.chapter !== null && b.chapter === null) return -1;
  if (a.chapter === null && b.chapter !== null) return 1;
  return naturalCompare(a.title, b.title) || naturalCompare(a.fileName, b.fileName);
}

export interface SeriesGroup {
  key: string;
  name: string;
  /** Capitoli in ordine. */
  items: ComicSummary[];
  readCount: number;
  lastReadAt: string | null;
  addedAt: string;
  author: string;
  /** Da dove continuare: il capitolo in corso più recente, altrimenti il primo non letto. */
  next: ComicSummary | null;
  favorite: boolean;
}

function maxDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

export function continueTarget(items: ComicSummary[]): ComicSummary | null {
  let inProgress: ComicSummary | null = null;
  for (const c of items) {
    if (!c.completed && c.currentPage > 0 && (!inProgress || (c.lastReadAt ?? '') > (inProgress.lastReadAt ?? ''))) {
      inProgress = c;
    }
  }
  if (inProgress) return inProgress;
  // Il primo non letto dopo l'ultimo letto (così non si riparte dal capitolo 1 se hai saltato qualcosa).
  let lastDone = -1;
  items.forEach((c, i) => {
    if (c.completed) lastDone = i;
  });
  return items.slice(lastDone + 1).find((c) => !c.completed) ?? items.find((c) => !c.completed) ?? null;
}

/** Raggruppa i fumetti per serie (solo quelli con una serie). */
export function groupSeries(comics: ComicSummary[]): SeriesGroup[] {
  const map = new Map<string, ComicSummary[]>();
  for (const c of comics) {
    const key = seriesKey(c.series);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  const groups: SeriesGroup[] = [];
  for (const [key, list] of map) {
    const items = [...list].sort(compareChapters);
    // Nome più usato tra i capitoli (a parità, il primo).
    const counts = new Map<string, number>();
    for (const c of items) counts.set(c.series.trim(), (counts.get(c.series.trim()) ?? 0) + 1);
    let name = items[0].series.trim();
    for (const [n, k] of counts) if (k > (counts.get(name) ?? 0)) name = n;
    groups.push({
      key,
      name,
      items,
      readCount: items.filter((c) => c.completed).length,
      lastReadAt: items.reduce<string | null>((acc, c) => maxDate(acc, c.lastReadAt), null),
      addedAt: items.reduce((acc, c) => (c.addedAt > acc ? c.addedAt : acc), items[0].addedAt),
      author: items.find((c) => c.author.trim())?.author.trim() ?? '',
      next: continueTarget(items),
      favorite: items.some((c) => c.favorite),
    });
  }
  return groups;
}

export type SeriesSort = 'recent' | 'title' | 'added';

export function sortSeries(groups: SeriesGroup[], sort: SeriesSort): SeriesGroup[] {
  const out = [...groups];
  if (sort === 'title') out.sort((a, b) => naturalCompare(a.name, b.name));
  else if (sort === 'added') out.sort((a, b) => (a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : 0));
  else
    out.sort((a, b) => {
      const x = a.lastReadAt ?? '';
      const y = b.lastReadAt ?? '';
      if (x !== y) return x < y ? 1 : -1;
      return a.addedAt < b.addedAt ? 1 : a.addedAt > b.addedAt ? -1 : naturalCompare(a.name, b.name);
    });
  return out;
}

/** Capitoli della stessa serie in ordine. */
export function seriesItems(comics: ComicSummary[], series: string): ComicSummary[] {
  const key = seriesKey(series);
  if (!key) return [];
  return comics.filter((c) => seriesKey(c.series) === key).sort(compareChapters);
}

/** Capitolo successivo nella serie (null se è l'ultimo o non ha serie). */
export function nextInSeries(comics: ComicSummary[], current: ComicSummary): ComicSummary | null {
  const items = seriesItems(comics, current.series);
  const i = items.findIndex((c) => c.id === current.id);
  return i >= 0 && i < items.length - 1 ? items[i + 1] : null;
}

export function prevInSeries(comics: ComicSummary[], current: ComicSummary): ComicSummary | null {
  const items = seriesItems(comics, current.series);
  const i = items.findIndex((c) => c.id === current.id);
  return i > 0 ? items[i - 1] : null;
}

/** Tag scritti dall'utente: "azione, Manga ,azione" -> ["azione", "Manga"] */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    for (const part of raw.split(',')) {
      const tag = part.replace(/^#+/, '').replace(/\s{2,}/g, ' ').trim().slice(0, 30);
      const k = tag.toLowerCase();
      if (!tag || seen.has(k)) continue;
      seen.add(k);
      out.push(tag);
    }
  }
  return out;
}

export interface Facet {
  value: string;
  count: number;
}

function facets(values: string[]): Facet[] {
  const map = new Map<string, Facet>();
  for (const v of values) {
    const value = v.trim();
    if (!value) continue;
    const k = value.toLowerCase();
    const f = map.get(k);
    if (f) f.count++;
    else map.set(k, { value, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || naturalCompare(a.value, b.value));
}

export function allTags(comics: ComicSummary[]): Facet[] {
  return facets(comics.flatMap((c) => c.tags));
}

export function allAuthors(comics: ComicSummary[]): Facet[] {
  return facets(comics.map((c) => c.author));
}

export function allSeriesNames(comics: ComicSummary[]): Facet[] {
  return facets(comics.map((c) => c.series));
}
