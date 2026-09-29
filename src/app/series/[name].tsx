import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { coverUri, measureHero } from '@/components/ComicCard';
import { ComicCover } from '@/components/ComicCover';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { IconButton, PrimaryButton } from '@/components/ui';
import { openComicMenu, openReader } from '@/hooks/useComicActions';
import { formatChapter, progressPercent } from '@/lib/format';
import { hapticSuccess } from '@/lib/haptics';
import { continueTarget, seriesItems } from '@/lib/series';
import { useLibrary } from '@/store/useLibrary';
import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';
import type { ComicSummary } from '@/types';

/** Una serie: capitoli in ordine, "continua a leggere" e azioni su tutta la serie. */
export default function SeriesDetailsScreen() {
  const params = useLocalSearchParams<{ name: string }>();
  const [name, setName] = useState(params.name ?? '');
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const comics = useLibrary((s) => s.comics);
  const update = useLibrary((s) => s.update);
  const [reversed, setReversed] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const coverRef = useRef<View>(null);

  const items = useMemo(() => seriesItems(comics, name), [comics, name]);
  const ordered = useMemo(() => (reversed ? [...items].reverse() : items), [items, reversed]);
  const next = useMemo(() => continueTarget(items), [items]);
  const readCount = items.filter((c) => c.completed).length;
  const author = items.find((c) => c.author.trim())?.author ?? '';

  if (items.length === 0) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background }]}>
        <ScreenHeader back title="Serie" />
        <EmptyState icon="albums-outline" title="Serie vuota" subtitle="I capitoli di questa serie sono stati eliminati o spostati." />
      </View>
    );
  }

  const front = next ?? items[0];

  const markAll = (completed: boolean) => {
    for (const c of items) {
      if (c.completed !== completed) void update(c.id, completed ? { completed } : { completed, currentPage: 0 });
    }
    if (completed) hapticSuccess();
    useUi.getState().showSnackbar({ message: completed ? 'Serie segnata come letta' : 'Serie segnata come da leggere' });
  };

  const saveName = () => {
    const newName = draft.trim();
    setRenaming(false);
    if (!newName || newName === name) return;
    for (const c of items) void update(c.id, { series: newName });
    setName(newName);
    router.setParams({ name: newName });
  };

  const openMenu = () =>
    useUi.getState().showActionSheet({
      title: name,
      options: [
        {
          label: 'Rinomina la serie',
          icon: 'pencil',
          onPress: () => {
            setDraft(name);
            setRenaming(true);
          },
        },
        { label: 'Segna tutta come letta', icon: 'checkmark-done-outline', onPress: () => markAll(true) },
        { label: 'Segna tutta come da leggere', icon: 'refresh-outline', onPress: () => markAll(false) },
        {
          label: 'Separa i capitoli dalla serie',
          icon: 'git-branch-outline',
          destructive: true,
          onPress: () =>
            Alert.alert('Separare i capitoli?', 'I fumetti restano in libreria ma non saranno più raggruppati in questa serie.', [
              { text: 'Annulla', style: 'cancel' },
              {
                text: 'Separa',
                style: 'destructive',
                onPress: () => {
                  for (const c of items) void update(c.id, { series: '' });
                  router.back();
                },
              },
            ]),
        },
      ],
    });

  const header = (
    <View style={styles.headerBox}>
      <View style={styles.hero}>
        <View ref={coverRef} collapsable={false} style={[styles.cover, { borderColor: colors.border }]}>
          <ComicCover comic={front} style={StyleSheet.absoluteFill} />
        </View>
        <View style={styles.heroBody}>
          {renaming ? (
            <View style={[styles.editBox, { backgroundColor: colors.surface, borderColor: colors.primary }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                autoFocus
                maxLength={120}
                onBlur={saveName}
                onSubmitEditing={saveName}
                style={[styles.nameInput, { color: colors.text }]}
              />
            </View>
          ) : (
            <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
          )}
          {author ? <Text style={[styles.meta, { color: colors.textMuted }]}>{author}</Text> : null}
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            {items.length === 1 ? '1 capitolo' : `${items.length} capitoli`} · {readCount} letti
          </Text>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View
              style={[
                styles.bar,
                {
                  width: `${Math.round((readCount / items.length) * 100)}%`,
                  backgroundColor: readCount === items.length ? colors.success : colors.primary,
                },
              ]}
            />
          </View>
        </View>
      </View>
      {next ? (
        <PrimaryButton
          label={`${next.currentPage > 0 ? 'Continua' : 'Leggi'}: ${next.chapter !== null ? `Cap. ${formatChapter(next.chapter)}` : next.title}`}
          icon="play"
          onPress={() => measureHero(coverRef.current, coverUri(next), (h) => openReader(next.id, h))}
        />
      ) : (
        <PrimaryButton label="Rileggi dall'inizio" icon="refresh" tone="secondary" onPress={() => openReader(items[0].id)} />
      )}
      <View style={styles.listHead}>
        <Text style={[styles.listTitle, { color: colors.text }]}>Capitoli</Text>
        <Pressable onPress={() => setReversed((r) => !r)} hitSlop={8} style={styles.sortBtn}>
          <Ionicons name={reversed ? 'arrow-up' : 'arrow-down'} size={16} color={colors.primary} />
          <Text style={[styles.sortText, { color: colors.primary }]}>{reversed ? 'Dal più recente' : 'Dal primo'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader back title={name} right={<IconButton icon="ellipsis-vertical" label="Altre azioni" onPress={openMenu} />} />
      <FlatList
        data={ordered}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => <ChapterRow comic={item} current={item.id === next?.id} />}
      />
    </View>
  );
}

const ChapterRow = memo(function ChapterRow({ comic, current }: { comic: ComicSummary; current: boolean }) {
  const { colors } = useTheme();
  const ref = useRef<View>(null);
  const pct = progressPercent(comic.currentPage, comic.pageCount, comic.completed);
  const started = comic.currentPage > 0 || comic.completed;
  return (
    <Pressable
      onPress={() => measureHero(ref.current, coverUri(comic), (h) => openReader(comic.id, h))}
      onLongPress={() => openComicMenu(comic)}
      delayLongPress={350}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: current ? colors.primarySoft : colors.surface,
          borderColor: current ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <View ref={ref} collapsable={false} style={styles.thumb}>
        <ComicCover comic={comic} style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.chapter, { color: current ? colors.primary : colors.textMuted }]}>
          {comic.chapter !== null ? `Capitolo ${formatChapter(comic.chapter)}` : 'Extra'}
          {current ? ' · da qui' : ''}
        </Text>
        <Text numberOfLines={2} style={[styles.rowTitle, { color: colors.text }]}>
          {comic.title}
        </Text>
        <Text style={[styles.rowMeta, { color: comic.completed ? colors.success : colors.textMuted }]}>
          {comic.completed ? 'Letto' : started ? `Pagina ${comic.currentPage + 1} di ${comic.pageCount}` : `${comic.pageCount} pagine`}
        </Text>
        {started && !comic.completed ? (
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.bar, { width: `${pct}%`, backgroundColor: colors.primary }]} />
          </View>
        ) : null}
      </View>
      {comic.favorite ? <Ionicons name="heart" size={16} color={colors.accent} /> : null}
      {comic.completed ? <Ionicons name="checkmark-circle" size={20} color={colors.success} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, gap: spacing.sm },
  headerBox: { gap: spacing.lg, marginBottom: spacing.sm },
  hero: { flexDirection: 'row', gap: spacing.lg },
  cover: { width: 118, height: 177, borderRadius: radius.md, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  heroBody: { flex: 1, gap: 6, justifyContent: 'center' },
  name: { fontSize: 22, fontWeight: '900', lineHeight: 27 },
  editBox: { borderWidth: 1.5, borderRadius: radius.sm, paddingHorizontal: spacing.sm },
  nameInput: { fontSize: 18, fontWeight: '700', paddingVertical: 6 },
  meta: { fontSize: 13.5 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  bar: { height: '100%' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: 17, fontWeight: '800' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortText: { fontSize: 13.5, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  thumb: { width: 54, height: 80, borderRadius: radius.sm, overflow: 'hidden' },
  rowBody: { flex: 1, gap: 2 },
  chapter: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowMeta: { fontSize: 12.5 },
});
