import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { EmptyState } from '@/components/EmptyState';
import { ImportBanner } from '@/components/ImportBanner';
import { MediaTile } from '@/components/media/MediaTile';
import { ScreenHeader } from '@/components/ScreenHeader';
import { SearchBar } from '@/components/SearchBar';
import { Skeleton } from '@/components/Skeleton';
import { Chip, Fab, IconButton, PrimaryButton } from '@/components/ui';
import { pickAndImport } from '@/hooks/useComicActions';
import { formatBytes } from '@/lib/format';
import { hapticSelect, hapticSuccess, hapticTap } from '@/lib/haptics';
import { panic } from '@/lib/panic';
import { countMedia, visibleMedia } from '@/lib/selectors';
import { useMedia } from '@/store/useMedia';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';
import type { MediaFilter, MediaItem } from '@/types';

const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: 'all', label: 'Tutti' },
  { value: 'gif', label: 'GIF' },
  { value: 'video', label: 'Video' },
  { value: 'image', label: 'Foto' },
  { value: 'favorites', label: 'Preferiti' },
];

const GAP = 4;

/** Media personali: GIF, foto e video salvati solo in ComicVault, visibili offline. */
export default function MediaScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const items = useMedia((s) => s.items);
  const loaded = useMedia((s) => s.loaded);
  const filter = useSettings((s) => s.mediaFilter);
  const setSettings = useSettings((s) => s.set);
  const [query, setQuery] = useState('');

  const columns = width >= 900 ? 6 : width >= 600 ? 4 : 3;
  const size = Math.floor((width - spacing.lg * 2 - GAP * (columns - 1)) / columns);
  const visible = useMemo(() => visibleMedia(items, filter, query), [items, filter, query]);
  const counts = useMemo(() => countMedia(items), [items]);
  const totalBytes = useMemo(() => items.reduce((n, m) => n + m.sizeBytes, 0), [items]);

  const add = () => {
    hapticTap();
    pickAndImport('media').catch((e) => Alert.alert('Importazione non riuscita', e instanceof Error ? e.message : String(e)));
  };

  const onPress = useCallback(
    (m: MediaItem) => router.push({ pathname: '/media/[id]', params: { id: m.id, filter, q: query } }),
    [filter, query],
  );

  const onLongPress = useCallback((m: MediaItem) => {
    hapticTap('medium');
    const { update, remove } = useMedia.getState();
    useUi.getState().showActionSheet({
      title: m.title,
      options: [
        {
          label: m.favorite ? 'Togli dai preferiti' : 'Aggiungi ai preferiti',
          icon: m.favorite ? 'heart-dislike-outline' : 'heart-outline',
          onPress: () => {
            if (!m.favorite) hapticSuccess();
            void update(m.id, { favorite: !m.favorite });
          },
        },
        {
          label: 'Elimina',
          icon: 'trash-outline',
          destructive: true,
          onPress: () =>
            Alert.alert(`Eliminare "${m.title}"?`, 'Verrà cancellato da ComicVault.', [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Elimina', style: 'destructive', onPress: () => void remove(m.id) },
            ]),
        },
      ],
    });
  }, []);

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader
        large
        title="Media"
        subtitle={items.length ? `${items.length} elementi · ${formatBytes(totalBytes)}` : 'GIF e video personali, offline'}
        right={<IconButton icon="eye-off-outline" label="Pulsante antipanico" onPress={panic} />}
      />
      {!loaded ? (
        <View style={[styles.list, styles.skeletons]}>
          {Array.from({ length: columns * 4 }).map((_, i) => (
            <Skeleton key={i} style={{ width: size, height: size, borderRadius: 6 }} />
          ))}
        </View>
      ) : (
        <FlatList
          key={`media-${columns}`}
          data={visible}
          numColumns={columns}
          keyExtractor={(m) => m.id}
          columnWrapperStyle={columns > 1 ? { gap: GAP } : undefined}
          contentContainerStyle={[styles.list, { gap: GAP, paddingBottom: 110 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListHeaderComponent={
            items.length > 0 ? (
              <View style={styles.header}>
                <SearchBar value={query} onChange={setQuery} placeholder="Cerca per nome" />
                <ImportBanner />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                  {FILTERS.map((f) => (
                    <Chip
                      key={f.value}
                      label={`${f.label} ${counts[f.value]}`}
                      selected={filter === f.value}
                      onPress={() => {
                        hapticSelect();
                        setSettings({ mediaFilter: f.value });
                      }}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : (
              <ImportBanner />
            )
          }
          renderItem={({ item }) => <MediaTile item={item} size={size} onPress={onPress} onLongPress={onLongPress} />}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState
                icon="film-outline"
                title="Nessun media"
                subtitle="Aggiungi GIF, foto e video: restano solo dentro ComicVault, protetti dal PIN, e si guardano anche offline."
              >
                <View style={styles.emptyBtn}>
                  <PrimaryButton label="Aggiungi GIF e video" icon="add" onPress={add} />
                </View>
              </EmptyState>
            ) : (
              <EmptyState icon="search-outline" title="Nessun risultato" subtitle="Prova un altro filtro o un'altra ricerca." />
            )
          }
        />
      )}
      <Fab icon="add" label="Aggiungi GIF e video" onPress={add} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  skeletons: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  header: { gap: spacing.md, marginBottom: spacing.sm },
  chips: { gap: spacing.sm },
  emptyBtn: { alignSelf: 'stretch', marginTop: spacing.md },
});
