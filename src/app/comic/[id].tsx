import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicCover } from '@/components/ComicCover';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Divider, PrimaryButton, Row, SwitchRow } from '@/components/ui';
import { confirmDelete, exportShare, exportToFolder, openReader } from '@/hooks/useComicActions';
import { formatBytes, formatRelative, progressPercent } from '@/lib/format';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';
import type { ReadingMode } from '@/types';

const MODE_ICONS: Record<ReadingMode, IconName> = { ltr: 'arrow-forward', rtl: 'arrow-back', vertical: 'swap-vertical' };

const MODE_NAMES: Record<ReadingMode, string> = {
  ltr: 'Da sinistra a destra',
  rtl: 'Manga (da destra a sinistra)',
  vertical: 'Verticale (webtoon)',
};

/** Scheda di un fumetto: titolo modificabile, progressi, esportazione ed eliminazione. */
export default function ComicDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const comic = useLibrary((s) => s.comics.find((c) => c.id === id));
  const update = useLibrary((s) => s.update);
  const defaultMode = useSettings((s) => s.defaultMode);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (!comic) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ScreenHeader back title="Fumetto" />
        <EmptyState icon="help-circle-outline" title="Fumetto non trovato" subtitle="Forse è stato eliminato." />
      </View>
    );
  }

  const pct = progressPercent(comic.currentPage, comic.pageCount, comic.completed);
  const started = comic.currentPage > 0 || comic.completed;

  const saveTitle = () => {
    const title = draft.trim();
    if (title && title !== comic.title) void update(comic.id, { title });
    setEditing(false);
  };

  const chooseMode = () =>
    useUi.getState().showActionSheet({
      title: 'Modalità di lettura per questo fumetto',
      options: [
        {
          label: `Predefinita (${MODE_NAMES[defaultMode].toLowerCase()})`,
          icon: 'settings-outline',
          selected: comic.readingMode === null,
          onPress: () => void update(comic.id, { readingMode: null }),
        },
        ...(['ltr', 'rtl', 'vertical'] as ReadingMode[]).map((m) => ({
          label: MODE_NAMES[m],
          icon: MODE_ICONS[m],
          selected: comic.readingMode === m,
          onPress: () => void update(comic.id, { readingMode: m }),
        })),
      ],
    });

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader back title="Dettagli" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <ComicCover comic={comic} style={styles.cover} />
          <View style={styles.heroBody}>
            {editing ? (
              <View style={[styles.editBox, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  multiline
                  maxLength={150}
                  onBlur={saveTitle}
                  onSubmitEditing={saveTitle}
                  submitBehavior="blurAndSubmit"
                  style={[styles.titleInput, { color: colors.text }]}
                />
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setDraft(comic.title);
                  setEditing(true);
                }}
                style={styles.titleRow}
              >
                <Text style={[styles.title, { color: colors.text }]}>{comic.title}</Text>
                <Ionicons name="pencil" size={16} color={colors.textMuted} />
              </Pressable>
            )}
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {comic.pageCount} pagine · {formatBytes(comic.sizeBytes)}
            </Text>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.bar, { width: `${pct}%`, backgroundColor: comic.completed ? colors.success : colors.primary }]} />
            </View>
            <Text style={[styles.meta, { color: comic.completed ? colors.success : colors.textMuted }]}>
              {comic.completed ? 'Letto' : started ? `Pagina ${comic.currentPage + 1} di ${comic.pageCount} · ${pct}%` : 'Non ancora iniziato'}
            </Text>
          </View>
        </View>

        <PrimaryButton
          label={comic.completed ? 'Rileggi' : started ? 'Continua a leggere' : 'Inizia a leggere'}
          icon="book-outline"
          onPress={() => openReader(comic.id)}
        />

        <Card>
          <SwitchRow
            icon={comic.favorite ? 'heart' : 'heart-outline'}
            title="Preferito"
            value={comic.favorite}
            onChange={(favorite) => void update(comic.id, { favorite })}
          />
          <Divider />
          <SwitchRow
            icon="checkmark-done-outline"
            title="Letto"
            subtitle={comic.completed ? 'Disattiva per ricominciare da capo' : undefined}
            value={comic.completed}
            onChange={(completed) => void update(comic.id, completed ? { completed } : { completed, currentPage: 0 })}
          />
          <Divider />
          <Row
            icon="book-outline"
            title="Modalità di lettura"
            subtitle={comic.readingMode ? MODE_NAMES[comic.readingMode] : `Predefinita: ${MODE_NAMES[defaultMode]}`}
            onPress={chooseMode}
          />
        </Card>

        <Card>
          <Row icon="share-social-outline" title="Condividi come .cbz" subtitle="Invialo a un'altra app o a un PC" onPress={() => void exportShare(comic)} />
          <Divider />
          <Row icon="download-outline" title="Salva .cbz in una cartella" subtitle="Es. Download o una chiavetta" onPress={() => void exportToFolder(comic)} />
        </Card>

        <Card>
          <Info label="File originale" value={comic.fileName} />
          <Info label="Formato" value={comic.format || 'sconosciuto'} />
          <Info label="Aggiunto" value={formatRelative(comic.addedAt)} />
          <Info label="Ultima lettura" value={formatRelative(comic.lastReadAt)} />
        </Card>

        <PrimaryButton label="Elimina dal telefono" icon="trash-outline" tone="danger" onPress={() => confirmDelete(comic, () => router.back())} />
      </ScrollView>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.info}>
      <Text style={[styles.infoLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  hero: { flexDirection: 'row', gap: spacing.lg },
  cover: { width: 130, height: 195, borderRadius: radius.md },
  heroBody: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flexShrink: 1, fontSize: 21, fontWeight: '800', lineHeight: 26 },
  editBox: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  titleInput: { fontSize: 18, fontWeight: '700', paddingVertical: 6 },
  meta: { fontSize: 13.5 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  bar: { height: '100%' },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
