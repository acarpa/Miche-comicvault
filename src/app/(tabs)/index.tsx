import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ComicCard, type HeroStart } from '@/components/ComicCard';
import { EmptyState } from '@/components/EmptyState';
import { ImportBanner } from '@/components/ImportBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchBar } from '@/components/SearchBar';
import { SkeletonCard, SkeletonGrid } from '@/components/Skeleton';
import { Chip, Fab, IconButton, PrimaryButton } from '@/components/ui';
import { openAddMenu, openComicMenu, openReader } from '@/hooks/useComicActions';
import { formatBytes } from '@/lib/format';
import { hapticSelect } from '@/lib/haptics';
import { panic } from '@/lib/panic';
import { continueReading, countByFilter, totalSize, visibleComics } from '@/lib/selectors';
import { allAuthors, allTags } from '@/lib/series';
import { useImport } from '@/store/useImport';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';
import type { ComicSummary, LibraryFilter, LibrarySort } from '@/types';

const FILTERS: { value: LibraryFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'reading', label: 'In lettura' },
  { value: 'unread', label: 'Da leggere' },
  { value: 'completed', label: 'Letti' },
  { value: 'favorites', label: 'Preferiti' },
];

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: 'recent', label: 'Letti di recente' },
  { value: 'added', label: 'Aggiunti di recente' },
  { value: 'title', label: 'Titolo (A-Z)' },
  { value: 'series', label: 'Serie e capitolo' },
];

const PAD = spacing.lg;
const GAP = 12;

/** Libreria: ricerca istantanea, "Continua a leggere", filtri (stato, tag, autore) e griglia delle copertine. */
export default function LibraryScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const comics = useLibrary((s) => s.comics);
  const loaded = useLibrary((s) => s.loaded);
  const error = useLibrary((s) => s.error);
  const importing = useImport((s) => s.running);
  const filter = useSettings((s) => s.filter);
  const sort = useSettings((s) => s.sort);
  const gridColumns = useSettings((s) => s.gridColumns);
  const setSettings = useSettings((s) => s.set);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [author, setAuthor] = useState<string | null>(null);

  // Su tablet o in orizzontale ci stanno più copertine per riga.
  const columns = width >= 900 ? gridColumns + 3 : width >= 600 ? gridColumns + 1 : gridColumns;
  const cardWidth = Math.floor((width - PAD * 2 - GAP * (columns - 1)) / columns);

  const visible = useMemo(
    () => visibleComics(comics, { filter, sort, query, tag, author }),
    [comics, filter, sort, query, tag, author],
  );
  const counts = useMemo(() => countByFilter(comics), [comics]);
  const reading = useMemo(() => continueReading(comics), [comics]);
  const size = useMemo(() => totalSize(comics), [comics]);
  const tags = useMemo(() => allTags(comics), [comics]);
  const authors = useMemo(() => allAuthors(comics), [comics]);
  const narrowed = !!query.trim() || !!tag || !!author;
  const showContinue = filter === 'all' && !narrowed && reading.length > 0;

  // Mentre si importa, una copertina "scheletro" in cima alla griglia.
  const data: (ComicSummary | null)[] = useMemo(() => (importing && !narrowed ? [null, ...visible] : visible), [importing, narrowed, visible]);

  const onPress = useCallback((c: ComicSummary, hero: HeroStart) => openReader(c.id, hero), []);
  const onLongPress = useCallback((c: ComicSummary) => openComicMenu(c), []);

  const chooseSort = () =>
    useUi.getState().showActionSheet({
      title: 'Ordina per',
      options: SORTS.map((s) => ({
        label: s.label,
        icon:
          s.value === 'title'
            ? 'text-outline'
            : s.value === 'added'
              ? 'add-circle-outline'
              : s.value === 'series'
                ? 'albums-outline'
                : 'time-outline',
        selected: s.value === sort,
        onPress: () => setSettings({ sort: s.value }),
      })),
    });

  const chooseAuthor = () =>
    useUi.getState().showActionSheet({
      title: 'Filtra per autore',
      options: [
        { label: 'Tutti gli autori', icon: 'people-outline', selected: !author, onPress: () => setAuthor(null) },
        ...authors.map((a) => ({
          label: `${a.value} (${a.count})`,
          icon: 'person-outline' as const,
          selected: author?.toLowerCase() === a.value.toLowerCase(),
          onPress: () => setAuthor(a.value),
        })),
      ],
    });

  const header = (
    <View style={styles.headerContent}>
      <SearchBar value={query} onChange={setQuery} placeholder="Cerca titolo, serie, autore o #tag" />
      <ImportBanner />

      {showContinue ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Continua a leggere</Text>
          <FlatList
            horizontal
            data={reading}
            keyExtractor={(c) => c.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.continueList}
            renderItem={({ item }) => <ComicCard comic={item} width={112} onPress={onPress} onLongPress={onLongPress} />}
          />
        </View>
      ) : null}

      {comics.length > 0 ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {FILTERS.map((f) => (
              <Chip
                key={f.value}
                label={`${f.label} ${counts[f.value]}`}
                selected={filter === f.value}
                onPress={() => {
                  hapticSelect();
                  setSettings({ filter: f.value });
                }}
              />
            ))}
          </ScrollView>

          {tags.length > 0 || authors.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {authors.length > 0 ? (
                <Chip icon="person-outline" label={author ?? 'Autore'} selected={!!author} onPress={chooseAuthor} />
              ) : null}
              {tags.map((t) => {
                const active = tag?.toLowerCase() === t.value.toLowerCase();
                return (
                  <Chip
                    key={t.value}
                    label={`#${t.value}`}
                    selected={active}
                    onPress={() => {
                      hapticSelect();
                      setTag(active ? null : t.value);
                    }}
                  />
                );
              })}
            </ScrollView>
          ) : null}

          <View style={styles.sortRow}>
            <Text style={[styles.count, { color: colors.textMuted }]}>
              {visible.length === 1 ? '1 fumetto' : `${visible.length} fumetti`}
            </Text>
            <Pressable onPress={chooseSort} hitSlop={8} style={styles.sortBtn}>
              <Ionicons name="swap-vertical" size={16} color={colors.primary} />
              <Text style={[styles.sortText, { color: colors.primary }]}>{SORTS.find((s) => s.value === sort)?.label}</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader
        large
        title="Libreria"
        subtitle={comics.length ? `${comics.length} fumetti · ${formatBytes(size)}` : 'La tua libreria privata'}
        right={<IconButton icon="eye-off-outline" label="Pulsante antipanico" onPress={panic} />}
      />

      {!loaded ? (
        <View style={styles.list}>
          <SkeletonGrid columns={columns} cardWidth={cardWidth} gap={GAP} />
        </View>
      ) : (
        <FlatList
          key={`grid-${columns}`}
          data={data}
          numColumns={columns}
          keyExtractor={(c) => c?.id ?? 'importing'}
          ListHeaderComponent={header}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={[styles.list, styles.listBottom]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          renderItem={({ item }) =>
            item ? (
              <ComicCard comic={item} width={cardWidth} onPress={onPress} onLongPress={onLongPress} />
            ) : (
              <SkeletonCard width={cardWidth} />
            )
          }
          ListEmptyComponent={
            error ? (
              <EmptyState icon="alert-circle-outline" title="Libreria non disponibile" subtitle={error} />
            ) : comics.length === 0 ? (
              <EmptyState
                icon="library-outline"
                title="La tua libreria è vuota"
                subtitle="Importa fumetti (CBZ, CBR, CB7, CBT, PDF) o intere cartelle di immagini. Puoi anche aprirli da un'altra app e scegliere ComicVault."
              >
                <View style={styles.emptyBtn}>
                  <PrimaryButton label="Aggiungi fumetti" icon="add" onPress={openAddMenu} />
                </View>
              </EmptyState>
            ) : (
              <EmptyState icon="search-outline" title="Nessun risultato" subtitle="Prova un altro filtro o un'altra ricerca." />
            )
          }
        />
      )}

      <Fab icon="add" label="Aggiungi" onPress={openAddMenu} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerContent: { gap: spacing.md, paddingBottom: spacing.md },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  continueList: { gap: GAP },
  chips: { gap: spacing.sm },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 13.5, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortText: { fontSize: 13.5, fontWeight: '700' },
  list: { paddingHorizontal: PAD, paddingTop: spacing.xs },
  listBottom: { paddingBottom: 110 },
  row: { gap: GAP, marginBottom: spacing.lg },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.md },
});
