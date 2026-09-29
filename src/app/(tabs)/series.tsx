import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import type { HeroStart } from '@/components/ComicCard';
import { EmptyState } from '@/components/EmptyState';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchBar } from '@/components/SearchBar';
import { SeriesCard } from '@/components/SeriesCard';
import { SkeletonRow } from '@/components/Skeleton';
import { IconButton, Segmented } from '@/components/ui';
import { openReader, openSeries } from '@/hooks/useComicActions';
import { panic } from '@/lib/panic';
import { groupSeries, sortSeries, type SeriesGroup } from '@/lib/series';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { spacing, useTheme } from '@/theme';
import type { ComicSummary } from '@/types';

/** Serie: i fumetti raggruppati per serie, con capitoli letti e "continua dal prossimo capitolo". */
export default function SeriesScreen() {
  const { colors } = useTheme();
  const comics = useLibrary((s) => s.comics);
  const loaded = useLibrary((s) => s.loaded);
  const sort = useSettings((s) => s.seriesSort);
  const setSettings = useSettings((s) => s.set);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => groupSeries(comics), [comics]);
  const visible = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = words.length
      ? groups.filter((g) => {
          const haystack = `${g.name} ${g.author} ${g.items.map((c) => c.tags.join(' ')).join(' ')}`.toLowerCase();
          return words.every((w) => haystack.includes(w));
        })
      : groups;
    return sortSeries(filtered, sort);
  }, [groups, query, sort]);

  const onOpen = useCallback((g: SeriesGroup) => openSeries(g.name), []);
  const onContinue = useCallback((c: ComicSummary, hero: HeroStart) => openReader(c.id, hero), []);

  const singles = comics.length - groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader
        large
        title="Serie"
        subtitle={groups.length ? `${groups.length} serie${singles > 0 ? ` · ${singles} fumetti singoli` : ''}` : 'Capitoli ed episodi in ordine'}
        right={<IconButton icon="eye-off-outline" label="Pulsante antipanico" onPress={panic} />}
      />
      {!loaded ? (
        <View style={styles.list}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(g) => g.key}
          contentContainerStyle={[styles.list, styles.listBottom]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            groups.length > 0 ? (
              <View style={styles.header}>
                <SearchBar value={query} onChange={setQuery} placeholder="Cerca serie, autore o tag" />
                <Segmented
                  value={sort}
                  onChange={(seriesSort) => setSettings({ seriesSort })}
                  options={[
                    { value: 'recent', label: 'Recenti', icon: 'time-outline' },
                    { value: 'title', label: 'A-Z', icon: 'text-outline' },
                    { value: 'added', label: 'Nuove', icon: 'sparkles-outline' },
                  ]}
                />
              </View>
            ) : null
          }
          renderItem={({ item }) => <SeriesCard group={item} onOpen={onOpen} onContinue={onContinue} />}
          ListEmptyComponent={
            groups.length === 0 ? (
              <EmptyState
                icon="albums-outline"
                title="Nessuna serie"
                subtitle={
                  'I fumetti con un numero nel nome (es. "One Piece 1045.cbz", "Naruto Cap. 3") vengono raggruppati da soli.\n\nPuoi anche scegliere la serie e il capitolo dalla scheda di un fumetto (tieni premuto → Dettagli e modifica).'
                }
              />
            ) : (
              <EmptyState icon="search-outline" title="Nessun risultato" subtitle="Prova un'altra ricerca." />
            )
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, gap: spacing.md },
  listBottom: { paddingBottom: 40 },
});
