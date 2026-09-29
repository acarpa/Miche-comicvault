import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coverUri, measureHero } from '@/components/ComicCard';
import { ComicCover } from '@/components/ComicCover';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TagEditor } from '@/components/TagEditor';
import { Card, Divider, PrimaryButton, Row, SectionLabel, SwitchRow } from '@/components/ui';
import { confirmDelete, exportShare, exportToFolder, openReader, openSeries, toggleFavorite } from '@/hooks/useComicActions';
import { formatBytes, formatChapter, formatRelative, progressPercent } from '@/lib/format';
import { allAuthors, allSeriesNames, allTags, parseSeriesInfo } from '@/lib/series';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';
import type { ReadingMode } from '@/types';

const MODE_ICONS: Record<ReadingMode, IconName> = { ltr: 'arrow-forward', rtl: 'arrow-back', vertical: 'swap-vertical' };

const MODE_NAMES: Record<ReadingMode, string> = {
  ltr: 'Fumetto (da sinistra a destra)',
  rtl: 'Manga (da destra a sinistra)',
  vertical: 'Webtoon (verticale)',
};

/** Scheda di un fumetto: titolo, serie, capitolo, autore e tag modificabili; progressi, esportazione, eliminazione. */
export default function ComicDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const comics = useLibrary((s) => s.comics);
  const comic = comics.find((c) => c.id === id);
  const update = useLibrary((s) => s.update);
  const defaultMode = useSettings((s) => s.defaultMode);
  const coverRef = useRef<View>(null);

  const seriesNames = useMemo(() => allSeriesNames(comics), [comics]);
  const authors = useMemo(() => allAuthors(comics), [comics]);
  const tags = useMemo(() => allTags(comics), [comics]);

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

  const chooseSeries = () =>
    useUi.getState().showActionSheet({
      title: 'Scegli la serie',
      options: [
        {
          label: 'Nessuna serie (fumetto singolo)',
          icon: 'remove-circle-outline',
          selected: !comic.series.trim(),
          onPress: () => void update(comic.id, { series: '' }),
        },
        ...seriesNames.map((s) => ({
          label: `${s.value} (${s.count})`,
          icon: 'albums-outline' as const,
          selected: s.value.toLowerCase() === comic.series.trim().toLowerCase(),
          onPress: () => void update(comic.id, { series: s.value }),
        })),
      ],
    });

  const chooseAuthor = () =>
    useUi.getState().showActionSheet({
      title: 'Autori già usati',
      options: authors.map((a) => ({
        label: a.value,
        icon: 'person-outline' as const,
        selected: a.value.toLowerCase() === comic.author.trim().toLowerCase(),
        onPress: () => void update(comic.id, { author: a.value }),
      })),
    });

  const guess = () => {
    const info = parseSeriesInfo(comic.fileName);
    void update(comic.id, { series: info.series, chapter: info.chapter });
    useUi.getState().showSnackbar({
      message: info.series || info.chapter !== null ? 'Serie e capitolo ricavati dal nome del file' : 'Dal nome del file non si capisce la serie',
    });
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: colors.background }]} behavior="padding">
      <ScreenHeader back title="Dettagli" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View ref={coverRef} collapsable={false} style={[styles.cover, { borderColor: colors.border }]}>
            <ComicCover comic={comic} style={StyleSheet.absoluteFill} />
          </View>
          <View style={styles.heroBody}>
            <EditableText
              value={comic.title}
              onSave={(title) => title && void update(comic.id, { title })}
              style={[styles.title, { color: colors.text }]}
              multiline
            />
            {comic.series ? (
              <Pressable onPress={() => openSeries(comic.series)} hitSlop={6} style={styles.seriesLink}>
                <Ionicons name="albums-outline" size={14} color={colors.primary} />
                <Text numberOfLines={1} style={[styles.seriesText, { color: colors.primary }]}>
                  {comic.series}
                  {comic.chapter !== null ? ` · Cap. ${formatChapter(comic.chapter)}` : ''}
                </Text>
              </Pressable>
            ) : null}
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
          onPress={() => measureHero(coverRef.current, coverUri(comic), (h) => openReader(comic.id, h))}
        />

        <Card>
          <SwitchRow
            icon={comic.favorite ? 'heart' : 'heart-outline'}
            title="Preferito"
            value={comic.favorite}
            onChange={() => toggleFavorite(comic)}
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

        <SectionLabel icon="albums-outline">Serie e informazioni</SectionLabel>
        <Card>
          <Field label="Serie">
            <EditableText
              value={comic.series}
              placeholder="Es. One Piece"
              onSave={(series) => void update(comic.id, { series })}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
              right={
                seriesNames.length > 0 ? (
                  <Pressable onPress={chooseSeries} hitSlop={8} accessibilityLabel="Scegli una serie esistente">
                    <Ionicons name="list" size={20} color={colors.primary} />
                  </Pressable>
                ) : null
              }
            />
          </Field>
          <Field label="Capitolo / episodio / volume">
            <EditableText
              value={formatChapter(comic.chapter)}
              placeholder="Es. 12"
              keyboardType="decimal-pad"
              onSave={(v) => {
                const n = Number.parseFloat(v.replace(',', '.'));
                void update(comic.id, { chapter: v.trim() && Number.isFinite(n) ? n : null });
              }}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
            />
          </Field>
          <Pressable onPress={guess} hitSlop={6} style={styles.guess}>
            <Ionicons name="sparkles-outline" size={15} color={colors.primary} />
            <Text style={[styles.guessText, { color: colors.primary }]}>Ricava serie e capitolo dal nome del file</Text>
          </Pressable>
          <Divider />
          <Field label="Autore">
            <EditableText
              value={comic.author}
              placeholder="Es. Eiichiro Oda"
              onSave={(author) => void update(comic.id, { author })}
              style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
              right={
                authors.length > 0 ? (
                  <Pressable onPress={chooseAuthor} hitSlop={8} accessibilityLabel="Scegli un autore già usato">
                    <Ionicons name="list" size={20} color={colors.primary} />
                  </Pressable>
                ) : null
              }
            />
          </Field>
          <Divider />
          <Field label="Tag">
            <TagEditor tags={comic.tags} suggestions={tags} onChange={(t) => void update(comic.id, { tags: t })} />
          </Field>
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
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

/** Testo modificabile che si salva quando esci dal campo (o premi invio). */
function EditableText({
  value,
  onSave,
  style,
  placeholder,
  multiline,
  keyboardType,
  right,
}: {
  value: string;
  onSave: (v: string) => void;
  style: object;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);

  // Se il valore cambia da fuori (es. scelto da un elenco), si aggiorna il campo.
  useEffect(() => {
    if (!focused) setDraft(value);
  }, [value, focused]);

  const commit = () => {
    setFocused(false);
    const v = draft.trim();
    if (v !== value.trim()) onSave(v);
  };

  return (
    <View style={styles.editRow}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        submitBehavior="blurAndSubmit"
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        multiline={multiline}
        keyboardType={keyboardType ?? 'default'}
        maxLength={150}
        style={[style, styles.flexInput, focused && { borderColor: colors.primary, borderWidth: 1.5 }]}
      />
      {right}
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
  cover: { width: 130, height: 195, borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  heroBody: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 25, borderRadius: radius.sm, paddingHorizontal: 4, marginHorizontal: -4 },
  seriesLink: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seriesText: { fontSize: 13.5, fontWeight: '700', flexShrink: 1 },
  meta: { fontSize: 13.5 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  bar: { height: '100%' },
  field: { gap: 6 },
  fieldLabel: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flexInput: { flex: 1 },
  input: { fontSize: 15.5, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1.5, borderColor: 'transparent' },
  guess: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  guessText: { fontSize: 13.5, fontWeight: '700' },
  info: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
});
