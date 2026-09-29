/** Funzioni pure di formattazione e ordinamento (testabili senza telefono). */

export function createId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const COMIC_EXTENSIONS = /\.(cbz|cbr|cb7|cbt|zip|rar|7z|tar|pdf)$/i;
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|bmp|heic|heif|avif)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm|mkv|3gp|avi)$/i;

export function isComicFileName(name: string): boolean {
  return COMIC_EXTENSIONS.test(name);
}

/** Pagina di un fumetto in una cartella di immagini (le GIF valgono come pagine). */
export function isImageFileName(name: string): boolean {
  return IMAGE_EXTENSIONS.test(name) || /\.gif$/i.test(name);
}

/** Tipo di media dal nome del file (null = non è un media). */
export function mediaKindFromName(name: string): 'gif' | 'image' | 'video' | null {
  if (/\.gif$/i.test(name)) return 'gif';
  if (IMAGE_EXTENSIONS.test(name)) return 'image';
  if (VIDEO_EXTENSIONS.test(name)) return 'video';
  return null;
}

/** File di backup di ComicVault. */
export function isVaultFileName(name: string): boolean {
  return /\.comicvault$/i.test(name.trim());
}

/** Estensione in minuscolo senza punto ("" se manca). */
export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : '';
}

/** "1:05", "12:30", "1:02:03" */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** "12", "12,5" (capitoli con decimali) */
export function formatChapter(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

/** "Batman_-_Year_One_01.cbz" -> "Batman - Year One 01" */
export function titleFromFileName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const noExt = base.replace(COMIC_EXTENSIONS, '').replace(VIDEO_EXTENSIONS, '').replace(IMAGE_EXTENSIONS, '').replace(/\.gif$/i, '');
  const cleaned = noExt
    .replace(/_/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || 'Senza titolo';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value >= 100 || unit <= 1 ? 0 : 1;
  return `${value.toFixed(digits).replace('.', ',')} ${units[unit]}`;
}

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** "oggi", "ieri", "3 giorni fa", "12 set 2026" */
export function formatRelative(iso: string | null, now = new Date()): string {
  if (!iso) return 'mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'mai';
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** Confronto "naturale": "Vol 2" prima di "Vol 10", senza distinguere maiuscole. */
export function naturalCompare(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  let i = 0;
  let j = 0;
  while (i < x.length && j < y.length) {
    const ci = x[i];
    const cj = y[j];
    const di = ci >= '0' && ci <= '9';
    const dj = cj >= '0' && cj <= '9';
    if (di && dj) {
      let ei = i;
      while (ei < x.length && x[ei] >= '0' && x[ei] <= '9') ei++;
      let ej = j;
      while (ej < y.length && y[ej] >= '0' && y[ej] <= '9') ej++;
      const ni = x.slice(i, ei).replace(/^0+/, '');
      const nj = y.slice(j, ej).replace(/^0+/, '');
      if (ni.length !== nj.length) return ni.length - nj.length;
      if (ni !== nj) return ni < nj ? -1 : 1;
      i = ei;
      j = ej;
    } else {
      if (ci !== cj) return ci < cj ? -1 : 1;
      i++;
      j++;
    }
  }
  const rest = x.length - i - (y.length - j);
  if (rest !== 0) return rest;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** "29 set 2026, 08:15" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Percentuale di lettura (0-100). */
export function progressPercent(currentPage: number, pageCount: number, completed: boolean): number {
  if (completed) return 100;
  if (pageCount <= 1) return 0;
  return Math.max(0, Math.min(100, Math.round((currentPage / (pageCount - 1)) * 100)));
}

/** Nome file sicuro per il backup (niente caratteri vietati su Windows/Android). */
export function safeFileName(title: string, fallback: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}
