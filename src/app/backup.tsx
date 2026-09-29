import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProgressModal } from '@/components/ProgressModal';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Divider, Row, SectionLabel } from '@/components/ui';
import { CanceledError, exportLibrary, pickFolder, restoreFromFolder, type Progress } from '@/lib/backup';
import { formatBytes, formatRelative } from '@/lib/format';
import { totalSize } from '@/lib/selectors';
import { useLibrary } from '@/store/useLibrary';
import { withoutAutoLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';

type Job = null | 'export' | 'restore';

/** Backup completo in una cartella e ripristino (anche su un telefono nuovo). */
export default function BackupScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const comics = useLibrary((s) => s.comics);
  const lastBackupAt = useSettings((s) => s.lastBackupAt);
  const [job, setJob] = useState<Job>(null);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0, current: '' });
  const [canceling, setCanceling] = useState(false);
  const canceled = useRef(false);

  const start = (kind: Exclude<Job, null>) => {
    canceled.current = false;
    setCanceling(false);
    setProgress({ done: 0, total: 0, current: '' });
    setJob(kind);
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

  const runExport = async () => {
    if (comics.length === 0) {
      Alert.alert('Niente da salvare', 'La libreria è vuota.');
      return;
    }
    // La finestra di avanzamento compare solo dopo aver scelto la cartella (il selettore è dentro exportLibrary).
    let started = false;
    try {
      const result = await withoutAutoLock(() =>
        exportLibrary(
          comics,
          (p) => {
            if (!started) {
              started = true;
              start('export');
            }
            setProgress(p);
          },
          () => canceled.current,
        ),
      );
      stop();
      if (!result) return; // cartella non scelta
      useSettings.getState().set({ lastBackupAt: new Date().toISOString() });
      Alert.alert(
        'Backup completato',
        `${result.count} fumetti salvati nella cartella "${result.folderName}".\n\nPer sicurezza copiala anche su un PC o su una chiavetta.`,
      );
    } catch (e) {
      stop();
      if (e instanceof CanceledError) {
        useUi.getState().showSnackbar({ message: 'Backup annullato: la cartella creata è incompleta, puoi eliminarla.' });
      } else {
        Alert.alert('Backup non riuscito', e instanceof Error ? e.message : String(e));
      }
    }
  };

  const runRestore = async () => {
    try {
      const folder = await withoutAutoLock(() => pickFolder());
      if (!folder) return;
      start('restore');
      const result = await restoreFromFolder(
        folder,
        setProgress,
        () => canceled.current,
        (comic) => useLibrary.getState().add(comic),
      );
      stop();
      const lines = [`${result.imported} fumetti ripristinati`];
      if (result.skipped) lines.push(`${result.skipped} erano già in libreria`);
      if (result.failed.length) {
        lines.push(`${result.failed.length} non riusciti:`, ...result.failed.map((f) => `• ${f.name}: ${f.message}`));
      }
      if (result.imported === 0 && result.skipped === 0 && result.failed.length === 0) {
        lines.splice(0, 1, 'Nella cartella scelta non ci sono fumetti.');
      }
      Alert.alert('Ripristino completato', lines.join('\n'));
    } catch (e) {
      stop();
      if (e instanceof CanceledError) {
        useUi.getState().showSnackbar({ message: 'Ripristino interrotto: i fumetti già importati restano in libreria.' });
      } else {
        Alert.alert('Ripristino non riuscito', e instanceof Error ? e.message : String(e));
      }
    }
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader back title="Backup e ripristino" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <Card style={{ backgroundColor: colors.primarySoft }}>
          <Text style={[styles.heroTitle, { color: colors.text }]}>Come funziona</Text>
          <Text style={[styles.help, { color: colors.text }]}>
            Il backup crea una cartella con un file .cbz per ogni fumetto e un piccolo file con titoli, preferiti e pagine
            lette. Puoi copiarla su un PC, su una chiavetta o su un nuovo telefono. Niente cloud, niente account.
          </Text>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {comics.length} fumetti · {formatBytes(totalSize(comics))} · ultimo backup: {formatRelative(lastBackupAt)}
          </Text>
        </Card>

        <SectionLabel icon="download-outline">Salva</SectionLabel>
        <Card>
          <Row
            icon="save-outline"
            title="Crea un backup"
            subtitle="Scegli dove salvarlo, ad esempio la cartella Download o una scheda SD"
            onPress={() => void runExport()}
            disabled={!!job}
          />
        </Card>

        <SectionLabel icon="refresh-outline">Ripristina</SectionLabel>
        <Card>
          <Row
            icon="folder-open-outline"
            title="Ripristina da una cartella"
            subtitle="Scegli la cartella del backup: i fumetti mancanti vengono reimportati con i loro progressi"
            onPress={() => void runRestore()}
            disabled={!!job}
          />
          <Divider />
          <Text style={[styles.help, { color: colors.textMuted }]}>
            Funziona anche con una cartella qualsiasi piena di .cbz o .cbr: li importa tutti in un colpo.
          </Text>
        </Card>
      </ScrollView>

      <ProgressModal
        visible={!!job}
        title={job === 'export' ? 'Backup in corso' : 'Ripristino in corso'}
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
  meta: { fontSize: 13 },
});
