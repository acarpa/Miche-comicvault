import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComicCard } from '@/components/ComicCard';
import { EmptyState } from '@/components/EmptyState';
import { ImportBanner } from '@/components/ImportBanner';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Chip, IconButton, PrimaryButton } from '@/components/ui';
import { openComicMenu, openReader, pickAndImport } from '@/hooks/useComicActions';
import { formatBytes } from '@/lib/format';
import { panic } from '@/lib/panic';
import { continueReading, countByFilter, totalSize, visibleComics } from '@/lib/selectors';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';
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
];

const PAD = spacing.lg;
const GAP = 12;

/** Libreria: "Continua a leggere", filtri, ricerca e griglia delle copertine. */
export default function LibraryScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const comics = useLibrary((s) => s.comics);
  const loaded = useLibrary((s) => s.loaded);
  const error = useLibrary((s) => s.error);
  const filter = useSettings((s) => s.filter);
  const sort = useSettings((s) => s.sort);
  const gridColumns = useSettings((s) => s.gridColumns);
  const setSettings = useSettings((s) => s.set);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<TextInput>(null);

  // Su tablet o in orizzontale ci stanno più copertine per riga.
  const columns = width >= 900 ? gridColumns + 3 : width >= 600 ? gridColumns + 1 : gridColumns;
  const cardWidth = Math.floor((width - PAD * 2 - GAP * (columns - 1)) / columns);

  const visible = useMemo(() => visibleComics(comics, { filter, sort, query }), [comics, filter, sort, query]);
  const counts = useMemo(() => countByFilter(comics), [comics]);
  const reading = useMemo(() => continueReading(comics), [comics]);
  const size = useMemo(() => totalSize(comics), [comics]);
  const showContinue = filter === 'all' && !query.trim() && reading.length > 0;

  const onPress = useCallback((c: ComicSummary) => openReader(c.id), []);
  const onLongPress = useCallback((c: ComicSummary) => openComicMenu(c), []);

  const importFiles = () => {
    pickAndImport().catch((e) => Alert.alert('Importazione non riuscita', e instanceof Error ? e.message : String(e)));
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setQuery('');
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  };

  const chooseSort = () =>
    useUi.getState().showActionSheet({
      title: 'Ordina per',
      options: SORTS.map((s) => ({
        label: s.label,
        icon: s.value === 'title' ? 'text-outline' : s.value === 'added' ? 'add-circle-outline' : 'time-outline',
        selected: s.value === sort,
        onPress: () => setSettings({ sort: s.value }),
      })),
    });

  const header = (
    <View style={styles.headerContent}>
      {searchOpen ? (
        <View style={[styles.search, { backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={18} color={colors.textFaint} />
          <TextInput
            ref={searchRef}
            value={query}
            onChangeText={setQuery}
            placeholder="Cerca per titolo o nome file"
            placeholderTextColor={colors.textFaint}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={colors.textFaint} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

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
            renderItem={({ item }) => (
              <ComicCard comic={item} width={110} onPress={onPress} onLongPress={onLongPress} />
            )}
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
                onPress={() => setSettings({ filter: f.value })}
              />
            ))}
          </ScrollView>
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
        title="ComicVault"
        subtitle={comics.length ? `${comics.length} fumetti · ${formatBytes(size)}` : 'La tua libreria privata'}
        right={
          <>
            <IconButton icon={searchOpen ? 'close' : 'search'} label="Cerca" active={searchOpen} onPress={toggleSearch} />
            <IconButton icon="eye-off-outline" label="Pulsante antipanico" onPress={panic} />
            <IconButton icon="settings-outline" label="Impostazioni" onPress={() => router.push('/settings')} />
          </>
        }
      />

      {!loaded ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          key={`grid-${columns}`}
          data={visible}
          numColumns={columns}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={header}
          columnWrapperStyle={columns > 1 ? styles.row : undefined}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <ComicCard comic={item} width={cardWidth} onPress={onPress} onLongPress={onLongPress} />}
          ListEmptyComponent={
            error ? (
              <EmptyState icon="alert-circle-outline" title="Libreria non disponibile" subtitle={error} />
            ) : comics.length === 0 ? (
              <EmptyState
                icon="library-outline"
                title="La tua libreria è vuota"
                subtitle="Importa file .cbz, .cbr, .cb7 o .zip dalla memoria del telefono. Puoi anche aprirli da un'altra app e scegliere ComicVault."
              >
                <View style={styles.emptyBtn}>
                  <PrimaryButton label="Importa fumetti" icon="add" onPress={importFiles} />
                </View>
              </EmptyState>
            ) : (
              <EmptyState icon="search-outline" title="Nessun risultato" subtitle="Prova un altro filtro o un'altra ricerca." />
            )
          }
        />
      )}

      <Pressable
        onPress={importFiles}
        accessibilityRole="button"
        accessibilityLabel="Importa fumetti"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: colors.primary, bottom: insets.bottom + 24, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="add" size={32} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerContent: { gap: spacing.md, paddingBottom: spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 46,
  },
  searchInput: { flex: 1, fontSize: 15.5 },
  section: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  continueList: { gap: GAP },
  chips: { gap: spacing.sm },
  sortRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  count: { fontSize: 13.5, fontWeight: '600' },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sortText: { fontSize: 13.5, fontWeight: '700' },
  list: { paddingHorizontal: PAD, paddingTop: spacing.xs },
  row: { gap: GAP, marginBottom: spacing.lg },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.md },
  fab: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
});
