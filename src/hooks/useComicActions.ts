import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import { saveComicToFolder, shareComic } from '@/lib/backup';
import { describeReport, useImport, type ImportReport } from '@/store/useImport';
import { useLibrary } from '@/store/useLibrary';
import { withoutAutoLock } from '@/store/useLock';
import { useUi, type SheetOption } from '@/store/useUi';
import type { ComicSummary } from '@/types';

/** Apre il selettore file di Android (anche selezione multipla) e importa. */
export async function pickAndImport() {
  const res = await withoutAutoLock(() =>
    DocumentPicker.getDocumentAsync({
      // I fumetti spesso non hanno un tipo riconosciuto: si accetta tutto e si controlla il contenuto.
      type: '*/*',
      multiple: true,
      copyToCacheDirectory: true,
    }),
  );
  if (res.canceled || !res.assets?.length) return;
  const report = await useImport.getState().enqueue(res.assets.map((a) => ({ uri: a.uri, name: a.name })));
  showImportReport(report);
}

export function showImportReport(report: ImportReport) {
  const message = describeReport(report);
  if (report.failed.length > 0) {
    Alert.alert(
      'Importazione completata',
      `${message}\n\n${report.failed.map((f) => `• ${f.name}: ${f.message}`).join('\n')}`,
    );
  } else {
    useUi.getState().showSnackbar({ message });
  }
}

export function openReader(id: string) {
  router.push({ pathname: '/reader/[id]', params: { id } });
}

export function openDetails(id: string) {
  router.push({ pathname: '/comic/[id]', params: { id } });
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
  const { update } = useLibrary.getState();
  const options: SheetOption[] = [
    { label: comic.currentPage > 0 && !comic.completed ? 'Continua a leggere' : 'Leggi', icon: 'book-outline', onPress: () => openReader(comic.id) },
    { label: 'Dettagli', icon: 'information-circle-outline', onPress: () => openDetails(comic.id) },
    {
      label: comic.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
      icon: comic.favorite ? 'heart-dislike-outline' : 'heart-outline',
      onPress: () => void update(comic.id, { favorite: !comic.favorite }),
    },
    comic.completed
      ? { label: 'Segna come da leggere', icon: 'refresh-outline', onPress: () => void update(comic.id, { completed: false, currentPage: 0 }) }
      : { label: 'Segna come letto', icon: 'checkmark-done-outline', onPress: () => void update(comic.id, { completed: true }) },
    { label: 'Condividi .cbz', icon: 'share-social-outline', onPress: () => void exportShare(comic) },
    { label: 'Salva .cbz in una cartella', icon: 'download-outline', onPress: () => void exportToFolder(comic) },
    { label: 'Elimina', icon: 'trash-outline', destructive: true, onPress: () => confirmDelete(comic) },
  ];
  useUi.getState().showActionSheet({ title: comic.title, options });
}
