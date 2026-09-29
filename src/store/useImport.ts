import { create } from 'zustand';

import type { ImageSetJob } from '@/lib/folders';
import { classify, DuplicateError, deleteTempCopy, importComic, importImageSet, resolveFileName, type ImportSource } from '@/lib/importer';
import { importMedia } from '@/lib/media';
import { parseSeriesInfo } from '@/lib/series';
import type { Comic, MediaItem, MediaKind } from '@/types';
import { useLibrary } from './useLibrary';
import { useMedia } from './useMedia';

export type ImportJob =
  | { type: 'file'; source: ImportSource; seriesHint?: string }
  | { type: 'images'; set: ImageSetJob }
  | { type: 'media'; source: ImportSource & { name: string }; kind: MediaKind };

export interface ImportReport {
  imported: Comic[];
  media: MediaItem[];
  duplicates: string[];
  failed: { name: string; message: string }[];
  /** File di backup .comicvault ricevuti: si propone il ripristino. */
  vaults: { uri: string; name: string }[];
}

interface ImportState {
  running: boolean;
  total: number;
  done: number;
  currentName: string | null;
  /** Aggiunge file alla coda; la promessa si risolve quando la coda è vuota. */
  enqueue: (sources: ImportSource[]) => Promise<ImportReport>;
  enqueueJobs: (jobs: ImportJob[]) => Promise<ImportReport>;
}

const emptyReport = (): ImportReport => ({ imported: [], media: [], duplicates: [], failed: [], vaults: [] });

let queue: ImportJob[] = [];
let report: ImportReport = emptyReport();
let waiters: ((r: ImportReport) => void)[] = [];

/** Coda di importazione: un file alla volta, così il telefono non si affatica. */
export const useImport = create<ImportState>()((set, get) => ({
  running: false,
  total: 0,
  done: 0,
  currentName: null,

  enqueue: (sources) => get().enqueueJobs(sources.map((source) => ({ type: 'file', source }))),

  enqueueJobs: (jobs) => {
    queue.push(...jobs);
    set((s) => ({ total: s.total + jobs.length }));
    const promise = new Promise<ImportReport>((resolve) => waiters.push(resolve));
    if (!get().running) void run();
    return promise;
  },
}));

function labelOf(job: ImportJob): string {
  if (job.type === 'images') return job.set.title;
  if (job.source.name) return job.source.name;
  const last = job.source.uri.split('/').pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

async function runJob(job: ImportJob): Promise<'keep-source' | void> {
  if (job.type === 'images') {
    const comic = await importImageSet(job.set.label, job.set.files, {
      title: job.set.title,
      series: job.set.series,
      chapter: job.set.chapter,
    });
    report.imported.push(comic);
    useLibrary.getState().add(comic);
    return;
  }
  if (job.type === 'media') {
    const item = await importMedia(job.source, job.kind);
    report.media.push(item);
    useMedia.getState().add(item);
    return;
  }

  const name = await resolveFileName(job.source);
  useImport.setState({ currentName: name });
  const dest = await classify(job.source.uri, name);
  if (dest.kind === 'vault') {
    report.vaults.push({ uri: job.source.uri, name });
    return 'keep-source'; // serve al ripristino
  }
  if (dest.kind === 'media') {
    const item = await importMedia({ uri: job.source.uri, name }, dest.media);
    report.media.push(item);
    useMedia.getState().add(item);
    return;
  }
  const hint = job.seriesHint && !parseSeriesInfo(name).series ? { series: job.seriesHint } : undefined;
  const comic = await importComic({ uri: job.source.uri, name }, { meta: hint });
  report.imported.push(comic);
  useLibrary.getState().add(comic);
}

async function run() {
  useImport.setState({ running: true });
  while (queue.length > 0) {
    const job = queue.shift()!;
    const label = labelOf(job);
    useImport.setState({ currentName: label });
    let keep = false;
    try {
      keep = (await runJob(job)) === 'keep-source';
    } catch (e) {
      if (e instanceof DuplicateError) report.duplicates.push(e.fileName);
      else report.failed.push({ name: useImport.getState().currentName ?? label, message: e instanceof Error ? e.message : String(e) });
    } finally {
      if (job.type !== 'images' && !keep) deleteTempCopy(job.source.uri);
      useImport.setState((s) => ({ done: s.done + 1 }));
    }
  }
  const finished = report;
  const resolvers = waiters;
  report = emptyReport();
  waiters = [];
  useImport.setState({ running: false, total: 0, done: 0, currentName: null });
  resolvers.forEach((r) => r(finished));
}

/** Messaggio riassuntivo in italiano. */
export function describeReport(r: ImportReport): string {
  const parts: string[] = [];
  if (r.imported.length === 1) parts.push(`"${r.imported[0].title}" importato`);
  else if (r.imported.length > 1) parts.push(`${r.imported.length} fumetti importati`);
  if (r.media.length === 1) parts.push('1 media aggiunto');
  else if (r.media.length > 1) parts.push(`${r.media.length} media aggiunti`);
  if (r.duplicates.length) parts.push(`${r.duplicates.length} già presenti`);
  if (r.failed.length) parts.push(`${r.failed.length} non importati`);
  return parts.join(' · ') || (r.vaults.length ? 'Backup ricevuto' : 'Nessun file importato');
}
