import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ZoomablePage } from '@/components/reader/ZoomablePage';
import { EmptyState } from '@/components/EmptyState';
import { IconButton } from '@/components/ui';
import { formatBytes, formatDuration } from '@/lib/format';
import { hapticSuccess, hapticTap } from '@/lib/haptics';
import { panic } from '@/lib/panic';
import { mediaThumbUri, mediaUri } from '@/lib/paths';
import { visibleMedia } from '@/lib/selectors';
import { useLock, withoutAutoLock } from '@/store/useLock';
import { useMedia } from '@/store/useMedia';
import { useUi } from '@/store/useUi';
import { spacing } from '@/theme';
import type { MediaFilter, MediaItem } from '@/types';

const FILTERS: MediaFilter[] = ['all', 'gif', 'video', 'image', 'favorites'];

/** Visualizzatore a schermo intero: scorri per passare al successivo, pizzica per ingrandire, video con i comandi. */
export default function MediaViewerScreen() {
  const params = useLocalSearchParams<{ id: string; filter?: string; q?: string }>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const items = useMedia((s) => s.items);
  const blackout = useUi((s) => s.blackout);
  const locked = useLock((s) => s.locked);

  // L'elenco resta quello aperto all'inizio (se elimini un elemento si toglie, ma non si riordina).
  const filter: MediaFilter = FILTERS.includes(params.filter as MediaFilter) ? (params.filter as MediaFilter) : 'all';
  const [ids] = useState(() => {
    const list = visibleMedia(useMedia.getState().items, filter, params.q ?? '');
    return (list.some((m) => m.id === params.id) ? list : visibleMedia(useMedia.getState().items, 'all', '')).map((m) => m.id);
  });
  const list = useMemo(() => {
    const byId = new Map(items.map((m) => [m.id, m]));
    return ids.map((id) => byId.get(id)).filter((m): m is MediaItem => !!m);
  }, [ids, items]);

  const [index, setIndex] = useState(() => Math.max(0, ids.indexOf(params.id ?? '')));
  const [controls, setControls] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const listRef = useRef<FlatList<MediaItem>>(null);
  const current = list[Math.min(index, list.length - 1)];

  useEffect(() => {
    if (index > list.length - 1 && list.length > 0) setIndex(list.length - 1);
  }, [index, list.length]);

  const onTap = useCallback(() => setControls((v) => !v), []);

  if (!current) {
    return (
      <View style={[styles.black, { paddingTop: insets.top }]}>
        <EmptyState icon="film-outline" title="Niente da mostrare" subtitle="Questo elemento è stato eliminato." />
      </View>
    );
  }

  const toggleFavorite = () => {
    if (!current.favorite) hapticSuccess();
    else hapticTap();
    void useMedia.getState().update(current.id, { favorite: !current.favorite });
  };

  const share = () =>
    void withoutAutoLock(() => Sharing.shareAsync(mediaUri(current.fileName), { dialogTitle: current.title })).catch((e) =>
      Alert.alert('Condivisione non riuscita', e instanceof Error ? e.message : String(e)),
    );

  const remove = () =>
    Alert.alert(`Eliminare "${current.title}"?`, 'Verrà cancellato da ComicVault.', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: () => {
          if (list.length <= 1) router.back();
          void useMedia.getState().remove(current.id);
        },
      },
    ]);

  const paused = blackout || locked;

  return (
    <View style={styles.black}>
      <StatusBar hidden={!controls} style="light" />
      <FlatList
        ref={listRef}
        data={list}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(m) => m.id}
        initialScrollIndex={Math.min(index, list.length - 1)}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        windowSize={3}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        onScrollToIndexFailed={() => {}}
        onMomentumScrollEnd={(e) => {
          const i = Math.round(e.nativeEvent.contentOffset.x / width);
          setIndex(Math.min(Math.max(i, 0), list.length - 1));
          setZoomed(false);
        }}
        renderItem={({ item, index: i }) => (
          <MediaPage
            item={item}
            width={width}
            height={height}
            active={i === index}
            paused={paused}
            onTap={onTap}
            onZoomChange={setZoomed}
          />
        )}
      />

      {controls ? (
        <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <IconButton icon="arrow-back" tone="dark" label="Indietro" onPress={() => router.back()} />
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {index + 1} di {list.length} · {current.kind === 'video' ? formatDuration(current.durationMs) : current.kind === 'gif' ? 'GIF' : 'Foto'} ·{' '}
              {formatBytes(current.sizeBytes)}
            </Text>
          </View>
          <Pressable onPress={toggleFavorite} hitSlop={8} style={styles.heartBtn} accessibilityLabel="Preferito">
            <Ionicons name={current.favorite ? 'heart' : 'heart-outline'} size={23} color={current.favorite ? '#FF5FA2' : '#fff'} />
          </Pressable>
          <IconButton icon="share-social-outline" tone="dark" label="Condividi" onPress={share} />
          <IconButton icon="trash-outline" tone="dark" label="Elimina" onPress={remove} />
          <IconButton icon="eye-off-outline" tone="dark" label="Pulsante antipanico" onPress={panic} />
        </Animated.View>
      ) : null}
    </View>
  );
}

interface PageProps {
  item: MediaItem;
  width: number;
  height: number;
  active: boolean;
  paused: boolean;
  onTap: () => void;
  onZoomChange: (z: boolean) => void;
}

const MediaPage = memo(function MediaPage({ item, width, height, active, paused, onTap, onZoomChange }: PageProps) {
  if (item.kind !== 'video') {
    return (
      <ZoomablePage
        uri={mediaUri(item.fileName)}
        width={width}
        height={height}
        aspect={item.width > 0 && item.height > 0 ? item.width / item.height : 0}
        active={active}
        onTap={onTap}
        onZoomChange={onZoomChange}
      />
    );
  }
  return (
    <View style={[styles.page, { width, height }]}>
      {active ? (
        <ActiveVideo uri={mediaUri(item.fileName)} paused={paused} />
      ) : item.thumb ? (
        <Image source={{ uri: mediaThumbUri(item.thumb) }} style={StyleSheet.absoluteFill} contentFit="contain" />
      ) : null}
    </View>
  );
});

/** Il lettore video esiste solo per la pagina visibile (così non ci sono più video che suonano insieme). */
function ActiveVideo({ uri, paused }: { uri: string; paused: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });

  useEffect(() => {
    if (paused) player.pause();
  }, [paused, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      nativeControls
      contentFit="contain"
      fullscreenOptions={{ enable: true }}
      allowsPictureInPicture={false}
    />
  );
}

const BAR_BG = 'rgba(10,5,18,0.82)';

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  page: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: BAR_BG,
  },
  titles: { flex: 1, marginLeft: spacing.xs },
  title: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 1 },
  heartBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
