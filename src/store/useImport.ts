import { create } from 'zustand';

import { DuplicateError, deleteTempCopy, importComic, type ImportSource } from '@/lib/importer';
import type { Comic } from '@/types';
import { useLibrary } from './useLibrary';

export interface ImportReport {
  imported: Comic[];
  duplicates: string[];
  failed: { name: string; message: string }[];
}

interface ImportState {
  running: boolean;
  total: number;
  done: number;
  currentName: string | null;
  /** Aggiunge file alla coda; la promessa si risolve quando la coda è vuota. */
  enqueue: (sources: ImportSource[]) => Promise<ImportReport>;
}

let queue: ImportSource[] = [];
let report: ImportReport = { imported: [], duplicates: [], failed: [] };
let waiters: ((r: ImportReport) => void)[] = [];

/** Coda di importazione: un file alla volta, così il telefono non si affatica. */
export const useImport = create<ImportState>()((set, get) => ({
  running: false,
  total: 0,
  done: 0,
  currentName: null,

  enqueue: (sources) => {
    queue.push(...sources);
    set((s) => ({ total: s.total + sources.length }));
    const promise = new Promise<ImportReport>((resolve) => waiters.push(resolve));
    if (!get().running) void run();
    return promise;
  },
}));

async function run() {
  useImport.setState({ running: true });
  while (queue.length > 0) {
    const source = queue.shift()!;
    const label = source.name ?? decodeURIComponent(source.uri.split('/').pop() ?? '');
    useImport.setState({ currentName: label });
    try {
      const comic = await importComic(source);
      report.imported.push(comic);
      useLibrary.getState().add(comic);
    } catch (e) {
      if (e instanceof DuplicateError) report.duplicates.push(e.fileName);
      else report.failed.push({ name: label, message: e instanceof Error ? e.message : String(e) });
    } finally {
      deleteTempCopy(source.uri);
      useImport.setState((s) => ({ done: s.done + 1 }));
    }
  }
  const finished = report;
  const resolvers = waiters;
  report = { imported: [], duplicates: [], failed: [] };
  waiters = [];
  useImport.setState({ running: false, total: 0, done: 0, currentName: null });
  resolvers.forEach((r) => r(finished));
}

/** Messaggio riassuntivo in italiano. */
export function describeReport(r: ImportReport): string {
  const parts: string[] = [];
  if (r.imported.length === 1) parts.push(`"${r.imported[0].title}" importato`);
  else if (r.imported.length > 1) parts.push(`${r.imported.length} fumetti importati`);
  if (r.duplicates.length) parts.push(`${r.duplicates.length} già presenti`);
  if (r.failed.length) parts.push(`${r.failed.length} non importati`);
  return parts.join(' · ') || 'Nessun fumetto importato';
}
