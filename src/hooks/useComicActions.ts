import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { pickFolder, saveComicToFolder, shareComic } from '@/lib/backup';
import { scanFolder } from '@/lib/folders';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { describeReport, useImport, type ImportJob, type ImportReport } from '@/store/useImport';
import { useLibrary } from '@/store/useLibrary';
import { withoutAutoLock } from '@/store/useLock';
import { useUi, type HeroInfo, type SheetOption } from '@/store/useUi';
import type { ComicSummary } from '@/types';

/** Apre il selettore file di Android (anche selezione multipla) e importa. */
export async function pickAndImport(kind: 'comics' | 'media' = 'comics') {
  const res = await withoutAutoLock(() =>
    DocumentPicker.getDocumentAsync({
      // I fumetti spesso non hanno un tipo riconosciuto: si accetta tutto e si controlla il contenuto.
      type: kind === 'media' ? ['image/*', 'video/*'] : '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    }),
  );
  if (res.canceled || !res.assets?.length) return;
  const report = await useImport.getState().enqueue(res.assets.map((a) => ({ uri: a.uri, name: a.name })));
  showImportReport(report);
}

/** Importa una cartella: fumetti, cartelle di immagini (capitoli) e media. */
export async function importFolder() {
  const folder = await withoutAutoLock(() => pickFolder());
  if (!folder) return;
  useUi.getState().showSnackbar({ message: 'Lettura della cartella…', duration: 2500 });
  try {
    const scan = await scanFolder(folder);
    const jobs: ImportJob[] = [
      ...scan.archives.map((a): ImportJob => ({ type: 'file', source: { uri: a.uri, name: a.name }, seriesHint: a.seriesHint })),
      ...scan.imageSets.map((set): ImportJob => ({ type: 'images', set })),
      ...scan.media.map((m): ImportJob => ({ type: 'media', source: { uri: m.uri, name: m.name }, kind: m.kind })),
    ];
    if (jobs.length === 0) {
      Alert.alert(
        'Niente da importare',
        `Nella cartella "${scan.folderName}" non ci sono fumetti, immagini o video.\n\nSuggerimento: scegli la cartella che contiene direttamente i file (o le cartelle dei capitoli).`,
      );
      return;
    }
    showImportReport(await useImport.getState().enqueueJobs(jobs));
  } catch (e) {
    Alert.alert('Cartella non leggibile', e instanceof Error ? e.message : String(e));
  }
}

/** Menu del pulsante "+": file, cartella o media. */
export function openAddMenu() {
  hapticTap();
  useUi.getState().showActionSheet({
    title: 'Aggiungi',
    options: [
      {
        label: 'Fumetti (CBZ, CBR, CB7, PDF…)',
        icon: 'document-outline',
        onPress: () => void pickAndImport('comics').catch(importError),
      },
      {
        label: 'Una cartella (anche di immagini)',
        icon: 'folder-open-outline',
        onPress: () => void importFolder(),
      },
      {
        label: 'GIF, foto e video',
        icon: 'film-outline',
        onPress: () => void pickAndImport('media').catch(importError),
      },
    ],
  });
}

function importError(e: unknown) {
  Alert.alert('Importazione non riuscita', e instanceof Error ? e.message : String(e));
}

/** File ricevuti da un'altra app ("Apri con" o "Condividi"). */
export async function importFromOtherApp(sources: { uri: string; name?: string | null }[]) {
  if (sources.length === 0) return;
  try {
    const report = await useImport.getState().enqueue(sources);
    showImportReport(report);
  } catch (e) {
    importError(e);
  }
}

export function showImportReport(report: ImportReport) {
  const message = describeReport(report);
  if (report.imported.length + report.media.length > 0) hapticSuccess();
  if (report.failed.length > 0) {
    Alert.alert(
      'Importazione completata',
      `${message}\n\n${report.failed.map((f) => `• ${f.name}: ${f.message}`).join('\n')}`,
    );
  } else if (report.imported.length + report.media.length + report.duplicates.length > 0 || report.vaults.length === 0) {
    useUi.getState().showSnackbar({ message });
  }
  // Un backup .comicvault aperto da un'altra app: si propone il ripristino.
  const vault = report.vaults[0];
  if (vault) router.push({ pathname: '/backup', params: { restore: vault.uri, name: vault.name } });
}

/** Apre il lettore; "hero" = copertina da cui parte l'animazione. */
export function openReader(id: string, hero?: Omit<HeroInfo, 'key'> | null) {
  if (hero) useUi.getState().startHero(hero);
  router.push({ pathname: '/reader/[id]', params: { id } });
}

export function openDetails(id: string) {
  router.push({ pathname: '/comic/[id]', params: { id } });
}

export function openSeries(name: string) {
  router.push({ pathname: '/series/[name]', params: { name } });
}

export function toggleFavorite(comic: ComicSummary) {
  const favorite = !comic.favorite;
  if (favorite) hapticSuccess();
  else hapticTap();
  void useLibrary.getState().update(comic.id, { favorite });
  useUi.getState().showSnackbar({ message: favorite ? 'Aggiunto ai preferiti' : 'Tolto dai preferiti', duration: 1800 });
}

export function confirmDelete(comic: ComicSummary, after?: () => void) {
  Alert.alert(`Eliminare "${comic.title}"?`, 'Il fumetto verrà cancellato da questo telefono.', [
    { text: 'Annulla', style: 'cancel' },
    {
      text: 'Elimina',
      style: 'destructive',
      onPress: () => {
        void useLibrary.getState().remove(comic.id);
        useUi.getState().showSnackbar({ message: 'Fumetto eliminato' });
        after?.();
      },
    },
  ]);
}

export async function exportShare(comic: ComicSummary) {
  try {
    await withoutAutoLock(() => shareComic(comic));
  } catch (e) {
    Alert.alert('Esportazione non riuscita', e instanceof Error ? e.message : String(e));
  }
}

export async function exportToFolder(comic: ComicSummary) {
  try {
    const name = await withoutAutoLock(() => saveComicToFolder(comic));
    if (name) useUi.getState().showSnackbar({ message: `Salvato: ${name}` });
  } catch (e) {
    Alert.alert('Salvataggio non riuscito', e instanceof Error ? e.message : String(e));
  }
}

/** Menu della pressione prolungata su una copertina. */
export function openComicMenu(comic: ComicSummary) {
  hapticTap('medium');
  const { update } = useLibrary.getState();
  const options: SheetOption[] = [
    {
      label: comic.currentPage > 0 && !comic.completed ? 'Continua a leggere' : 'Leggi',
      icon: 'book-outline',
      onPress: () => openReader(comic.id),
    },
    { label: 'Dettagli e modifica', icon: 'create-outline', onPress: () => openDetails(comic.id) },
  ];
  if (comic.series.trim()) {
    options.push({ label: `Apri la serie "${comic.series.trim()}"`, icon: 'albums-outline', onPress: () => openSeries(comic.series.trim()) });
  }
  options.push(
    {
      label: comic.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
      icon: comic.favorite ? 'heart-dislike-outline' : 'heart-outline',
      onPress: () => toggleFavorite(comic),
    },
    comic.completed
      ? {
          label: 'Segna come da leggere',
          icon: 'refresh-outline',
          onPress: () => void update(comic.id, { completed: false, currentPage: 0 }),
        }
      : { label: 'Segna come letto', icon: 'checkmark-done-outline', onPress: () => void update(comic.id, { completed: true }) },
    { label: 'Condividi .cbz', icon: 'share-social-outline', onPress: () => void exportShare(comic) },
    { label: 'Salva .cbz in una cartella', icon: 'download-outline', onPress: () => void exportToFolder(comic) },
    { label: 'Elimina', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(comic) },
  );
  useUi.getState().showActionSheet({ title: comic.title, options });
}
