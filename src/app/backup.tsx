import * as DocumentPicker from 'expo-document-picker';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressModal } from '@/components/ProgressModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Divider, Row, SectionLabel } from '@/components/ui';
import { CanceledError, pickFolder, restoreFromFolder, type Progress } from '@/lib/backup';
import { formatBytes, formatRelative } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { deleteTempCopy } from '@/lib/importer';
import { totalSize } from '@/lib/selectors';
import {
  describeManifest,
  exportVaultToFolder,
  readVaultManifest,
  restoreVault,
  shareVault,
  type RestoreMode,
  type VaultKind,
  type VaultRestoreResult,
} from '@/lib/vault';
import { useLibrary } from '@/store/useLibrary';
import { withoutAutoLock } from '@/store/useLock';
import { useMedia } from '@/store/useMedia';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';
import type { VaultManifest, VaultSettings } from '@/types';

type Job = null | { title: string };

function currentVaultSettings(): VaultSettings {
  const s = useSettings.getState();
  return { defaultMode: s.defaultMode, tapZones: s.tapZones, gridColumns: s.gridColumns, progressStyle: s.progressStyle };
}

function describeRestore(r: VaultRestoreResult, kind: VaultManifest['kind']): string {
  const lines: string[] = [];
  if (kind === 'full') {
    lines.push(`${r.added} fumetti aggiunti`);
    if (r.media) lines.push(`${r.media} media aggiunti`);
  }
  if (r.updated) lines.push(`${r.updated} fumetti aggiornati (progressi, preferiti, tag)`);
  if (r.unchanged) lines.push(`${r.unchanged} già aggiornati`);
  if (r.missing) lines.push(`${r.missing} non presenti su questo telefono (importa prima il backup completo)`);
  if (r.failed.length) {
    lines.push(`${r.failed.length} non riusciti:`, ...r.failed.slice(0, 8).map((f) => `• ${f.name}: ${f.message}`));
    if (r.failed.length > 8) lines.push(`…e altri ${r.failed.length - 8}`);
  }
  return lines.join('\n');
}

/** Backup in un solo file .comicvault (telefono ↔ PC) e ripristino. */
export default function BackupScreen() {
  const params = useLocalSearchParams<{ restore?: string; name?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const comics = useLibrary((s) => s.comics);
  const media = useMedia((s) => s.items);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const [job, setJob] = useState<Job>(null);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, current: '' });
  const [canceling, setCanceling] = useState(false);
  const canceled = useRef(false);
  const handledParam = useRef<string | null>(null);

  const librarySize = totalSize(comics) + media.reduce((n, m) => n + m.sizeBytes, 0);

  const start = (title: string) => {
    canceled.current = false;
    setCanceling(false);
    setProgress({ done: 0, total: 0, current: '' });
    setJob({ title });
    activateKeepAwakeAsync('backup').catch(() => {});
  };

  const stop = () => {
    setJob(null);
    deactivateKeepAwake('backup').catch(() => {});
  };

  const cancel = () => {
    canceled.current = true;
    setCanceling(true);
  };

  // ------------------------------------------------------------------ Esportazione

  const runExport = async (kind: VaultKind, target: 'folder' | 'share') => {
    if (comics.length === 0 && media.length === 0) {
      Alert.alert('Niente da salvare', 'La libreria è vuota.');
      return;
    }
    const title = kind === 'full' ? 'Backup in corso' : 'Salvataggio dei progressi';
    try {
      let result: { comics: number; media: number; name?: string } | null;
      if (target === 'folder') {
        result = await withoutAutoLock(() =>
          exportVaultToFolder(kind, currentVaultSettings(), () => start(title), setProgress, () => canceled.current),
        );
      } else {
        start(title);
        result = await withoutAutoLock(() => shareVault(kind, currentVaultSettings(), setProgress, () => canceled.current));
      }
      stop();
      if (!result) return; // cartella non scelta
      if (kind === 'full') useSettings.getState().set({ lastBackupAt: new Date().toISOString() });
      hapticSuccess();
      if (target === 'folder') {
        Alert.alert(
          kind === 'full' ? 'Backup completato' : 'Progressi salvati',
          `File "${result.name}" con ${result.comics} fumetti${kind === 'full' ? ` e ${result.media} media` : ''}.\n\nPer sicurezza copialo anche su un PC o su una chiavetta.`,
        );
      }
    } catch (e) {
      stop();
      if (e instanceof CanceledError) useUi.getState().showSnackbar({ message: 'Backup annullato' });
      else Alert.alert('Backup non riuscito', e instanceof Error ? e.message : String(e));
    }
  };

  // ------------------------------------------------------------------ Ripristino

  const runRestore = async (uri: string, manifest: VaultManifest, mode: RestoreMode) => {
    start(manifest.kind === 'progress' ? 'Aggiornamento dei progressi' : 'Ripristino in corso');
    try {
      const result = await restoreVault(uri, manifest, mode, {
        onProgress: setProgress,
        isCanceled: () => canceled.current,
        clearAll: async () => {
          await useLibrary.getState().removeAll();
          await useMedia.getState().removeAll();
        },
      });
      if (mode === 'replace' && manifest.settings) useSettings.getState().set(manifest.settings);
      await useLibrary.getState().load();
      await useMedia.getState().load();
      stop();
      hapticSuccess();
      Alert.alert('Ripristino completato', describeRestore(result, manifest.kind));
    } catch (e) {
      await useLibrary.getState().load();
      await useMedia.getState().load();
      stop();
      if (e instanceof CanceledError) {
        useUi.getState().showSnackbar({ message: 'Ripristino interrotto: quello già ripristinato resta in libreria.' });
      } else {
        Alert.alert('Ripristino non riuscito', e instanceof Error ? e.message : String(e));
      }
    } finally {
      deleteTempCopy(uri);
    }
  };

  /** Legge l'indice del backup e chiede come ripristinarlo. */
  const askRestore = async (uri: string) => {
    let manifest: VaultManifest;
    try {
      manifest = await readVaultManifest(uri);
    } catch (e) {
      Alert.alert('File non valido', e instanceof Error ? e.message : String(e));
      return;
    }
    const summary = describeManifest(manifest);
    if (manifest.kind === 'progress') {
      Alert.alert('Aggiornare i progressi?', `${summary}\n\nSi aggiornano pagine lette, preferiti e tag dei fumetti già presenti.`, [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Aggiorna', onPress: () => void runRestore(uri, manifest, 'merge') },
      ]);
      return;
    }
    Alert.alert(
      'Ripristinare il backup?',
      `${summary}\n\n• Unisci: aggiunge ciò che manca e aggiorna i progressi (non cancella niente).\n• Sostituisci: la libreria diventa uguale al backup.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Sostituisci',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Sostituire tutto?',
              `I ${comics.length} fumetti e ${media.length} media di questo telefono verranno cancellati e sostituiti con quelli del backup.`,
              [
                { text: 'Annulla', style: 'cancel' },
                { text: 'Sostituisci tutto', style: 'destructive', onPress: () => void runRestore(uri, manifest, 'replace') },
              ],
            ),
        },
        { text: 'Unisci', onPress: () => void runRestore(uri, manifest, 'merge') },
      ],
    );
  };

  const pickVault = async () => {
    const res = await withoutAutoLock(() =>
      DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: false,
        // Il backup può essere enorme: si legge direttamente dal file originale, senza copiarlo.
        copyToCacheDirectory: false,
      }),
    );
    if (res.canceled || !res.assets?.length) return;
    await askRestore(res.assets[0].uri);
  };

  // Backup aperto da un'altra app ("Apri con" / "Condividi" → ComicVault).
  useEffect(() => {
    const uri = params.restore;
    if (!uri || handledParam.current === uri) return;
    handledParam.current = uri;
    const t = setTimeout(() => void askRestore(uri), 400);
    return () => clearTimeout(t);
  }, [params.restore]);

  const runFolderRestore = async () => {
    try {
      const folder = await withoutAutoLock(() => pickFolder());
      if (!folder) return;
      start('Importazione dalla cartella');
      const result = await restoreFromFolder(
        folder,
        setProgress,
        () => canceled.current,
        (comic) => useLibrary.getState().add(comic),
      );
      stop();
      const lines = [`${result.imported} fumetti importati`];
      if (result.skipped) lines.push(`${result.skipped} erano già in libreria`);
      if (result.failed.length) {
        lines.push(`${result.failed.length} non riusciti:`, ...result.failed.map((f) => `• ${f.name}: ${f.message}`));
      }
      if (result.imported === 0 && result.skipped === 0 && result.failed.length === 0) {
        lines.splice(0, 1, 'Nella cartella scelta non ci sono fumetti.');
      }
      if (result.imported > 0) hapticSuccess();
      Alert.alert('Importazione completata', lines.join('\n'));
    } catch (e) {
      stop();
      if (e instanceof CanceledError) {
        useUi.getState().showSnackbar({ message: 'Importazione interrotta: i fumetti già importati restano in libreria.' });
      } else {
        Alert.alert('Importazione non riuscita', e instanceof Error ? e.message : String(e));
      }
    }
  };

  const busy = !!job;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader back title="Backup e ripristino" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Un solo file, telefono ↔ PC</Text>
          <Text style={[styles.help, { color: colors.text }]}>
            Il backup è un unico file <Text style={styles.bold}>.comicvault</Text> con tutto dentro: fumetti, serie, tag,
            pagine lette, preferiti, GIF e video. Aprilo con ComicVault su un altro telefono o sul PC e ritrovi la libreria
            com'era. Niente cloud, niente account.
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {comics.length} fumetti · {media.length} media · {formatBytes(librarySize)}
            {'\n'}Ultimo backup completo: {formatRelative(lastBackupAt)}
          </Text>
        </Card>

        <SectionLabel icon="archive-outline">Backup completo</SectionLabel>
        <Card>
          <Row
            icon="save-outline"
            title="Salva in una cartella"
            subtitle="Download, scheda SD o chiavetta USB: poi copialo sul PC"
            onPress={() => void runExport('full', 'folder')}
            disabled={busy}
          />
          <Divider />
          <Row
            icon="share-social-outline"
            title="Invia…"
            subtitle="Al PC, a Drive, a Telegram, via Bluetooth o Quick Share"
            onPress={() => void runExport('full', 'share')}
            disabled={busy}
          />
        </Card>

        <SectionLabel icon="bookmark-outline">Solo progressi (file leggero)</SectionLabel>
        <Card>
          <Text style={[styles.help, { color: colors.textMuted }]}>
            Pochi KB con pagine lette, preferiti, serie e tag, senza le immagini. Utile per continuare sul PC dal punto in cui
            eri arrivato sul telefono (e viceversa), quando i fumetti ci sono già.
          </Text>
          <Row icon="save-outline" title="Salva in una cartella" onPress={() => void runExport('progress', 'folder')} disabled={busy} />
          <Divider />
          <Row icon="share-social-outline" title="Invia…" onPress={() => void runExport('progress', 'share')} disabled={busy} />
        </Card>

        <SectionLabel icon="refresh-outline">Ripristina</SectionLabel>
        <Card>
          <Row
            icon="document-outline"
            title="Apri un file .comicvault"
            subtitle="Creato su questo telefono, su un altro o sul PC"
            onPress={() => void pickVault()}
            disabled={busy}
          />
          <Divider />
          <Row
            icon="folder-open-outline"
            title="Da una cartella"
            subtitle="Vecchi backup (una cartella di .cbz) o qualsiasi cartella di fumetti"
            onPress={() => void runFolderRestore()}
            disabled={busy}
          />
        </Card>
      </ScrollView>

      <ProgressModal
        visible={busy}
        title={job?.title ?? ''}
        done={progress.done}
        total={progress.total}
        current={progress.current}
        onCancel={cancel}
        canceling={canceling}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  heroTitle: { fontSize: 17, fontWeight: '800' },
  help: { fontSize: 14, lineHeight: 20 },
  bold: { fontWeight: '800' },
  meta: { fontSize: 13, lineHeight: 19 },
});
