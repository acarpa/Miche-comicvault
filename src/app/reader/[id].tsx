import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { NavigationBar } from 'expo-navigation-bar';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList as RNFlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageSlider } from '@/components/reader/PageSlider';
import { ZoomablePage } from '@/components/reader/ZoomablePage';
import { IconButton, PrimaryButton } from '@/components/ui';
import { getComic, type ComicPatch } from '@/lib/db';
import { panic } from '@/lib/panic';
import { comicDirPrefix } from '@/lib/paths';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';
import type { Comic, PageInfo, ReadingMode } from '@/types';

const MODE_LABELS: Record<ReadingMode, string> = {
  ltr: 'Da sinistra a destra',
  rtl: 'Da destra a sinistra (manga)',
  vertical: 'Scorrimento verticale (webtoon)',
};

const MODE_ICONS: Record<ReadingMode, IconName> = { ltr: 'arrow-forward', rtl: 'arrow-back', vertical: 'swap-vertical' };

/** Proporzioni di una pagina; se non note si assume un formato fumetto classico. */
const aspectOf = (p: PageInfo) => (p.w > 0 && p.h > 0 ? p.w / p.h : 0);

/** Lettore a schermo intero: orizzontale (occidentale o manga) oppure verticale (webtoon). */
export default function ReaderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const summary = useLibrary((s) => s.comics.find((c) => c.id === id));
  const update = useLibrary((s) => s.update);
  const defaultMode = useSettings((s) => s.defaultMode);
  const tapZones = useSettings((s) => s.tapZones);
  const keepAwake = useSettings((s) => s.keepAwake);
  const showPageNumber = useSettings((s) => s.showPageNumber);

  const [comic, setComic] = useState<Comic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [controls, setControls] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);

  const mode: ReadingMode = summary?.readingMode ?? comic?.readingMode ?? defaultMode;
  const rtl = mode === 'rtl';
  const count = comic?.pageCount ?? 0;
  const prefix = useMemo(() => (id ? comicDirPrefix(id) : ''), [id]);

  // --- Caricamento: riparte da dove eri rimasto (o dall'inizio se l'avevi finito).
  useEffect(() => {
    if (!id) return;
    let alive = true;
    getComic(id)
      .then((c) => {
        if (!alive) return;
        if (!c || c.pages.length === 0) {
          setLoadError('Questo fumetto non è più disponibile.');
          return;
        }
        const last = c.pages.length - 1;
        const start = c.completed && c.currentPage >= last ? 0 : Math.min(Math.max(c.currentPage, 0), last);
        setPage(start);
        setComic(c);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [id]);

  // --- Salvataggio dei progressi (con un piccolo ritardo per non scrivere a ogni pagina sfogliata).
  useEffect(() => {
    if (!comic) return;
    const t = setTimeout(() => {
      const patch: ComicPatch = { currentPage: page, lastReadAt: new Date().toISOString() };
      if (page >= comic.pageCount - 1) patch.completed = true;
      void update(comic.id, patch).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [page, comic, update]);

  // --- Schermo sempre acceso durante la lettura (se attivo nelle impostazioni).
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('reader').catch(() => {});
    return () => {
      deactivateKeepAwake('reader').catch(() => {});
    };
  }, [keepAwake]);

  // --- Navigazione tra le pagine
  const hRef = useRef<FlatList<PageInfo>>(null);
  const vRef = useRef<RNFlatList<PageInfo>>(null);
  const hData = useMemo(() => (comic ? (rtl ? [...comic.pages].reverse() : comic.pages) : []), [comic, rtl]);
  /** Pagina <-> posizione nella lista orizzontale (in modalità manga l'ordine è invertito). */
  const toIndex = useCallback((p: number) => (rtl ? count - 1 - p : p), [rtl, count]);

  const goTo = useCallback(
    (target: number, animated = true) => {
      if (count === 0) return;
      if (target > count - 1) {
        useUi.getState().showSnackbar({ message: 'Fine del fumetto', actionLabel: 'Libreria', onAction: () => router.back() });
        return;
      }
      if (target < 0) return;
      setZoomed(false);
      setPage(target);
      if (mode === 'vertical') vRef.current?.scrollToIndex({ index: target, animated });
      else hRef.current?.scrollToIndex({ index: toIndex(target), animated });
    },
    [count, mode, toIndex],
  );

  const onTap = useCallback(
    (x: number) => {
      if (controls) return setControls(false);
      if (!tapZones) return setControls(true);
      const third = width / 3;
      if (x < third) goTo(page + (rtl ? 1 : -1));
      else if (x > width - third) goTo(page + (rtl ? -1 : 1));
      else setControls(true);
    },
    [controls, tapZones, width, goTo, page, rtl],
  );

  // --- Modalità verticale: altezza di ogni pagina in base alle proporzioni.
  const [measured, setMeasured] = useState<Record<string, number>>({});
  const vLayout = useMemo(() => {
    const heights = (comic?.pages ?? []).map((p) => width / (measured[p.n] || aspectOf(p) || 0.66));
    const offsets: number[] = [];
    let acc = 0;
    for (const h of heights) {
      offsets.push(acc);
      acc += h;
    }
    return { heights, offsets };
  }, [comic, width, measured]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken<PageInfo>[] }) => {
    const first = viewableItems.find((v) => v.isViewable && v.index !== null);
    if (first?.index != null) setPage(first.index);
  }).current;

  const chooseMode = () =>
    useUi.getState().showActionSheet({
      title: 'Modalità di lettura',
      options: (['ltr', 'rtl', 'vertical'] as ReadingMode[]).map((m) => ({
        label: MODE_LABELS[m],
        icon: MODE_ICONS[m],
        selected: m === mode,
        onPress: () => {
          setZoomed(false);
          if (comic) void update(comic.id, { readingMode: m });
        },
      })),
    });

  // --- Stati di caricamento / errore
  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Text style={[styles.errorText, { color: colors.text }]}>{loadError}</Text>
        <PrimaryButton label="Torna alla libreria" icon="arrow-back" onPress={() => router.back()} />
      </View>
    );
  }
  if (!comic) {
    return (
      <View style={[styles.center, styles.black]}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  const shownPage = (preview ?? page) + 1;

  return (
    <View style={styles.black}>
      <StatusBar hidden={!controls} style="light" />
      <NavigationBar hidden={!controls} />

      {mode === 'vertical' ? (
        <RNFlatList
          key={`v-${width}`}
          ref={vRef}
          data={comic.pages}
          keyExtractor={(p) => p.n}
          initialScrollIndex={page}
          getItemLayout={(_, i) => ({ length: vLayout.heights[i], offset: vLayout.offsets[i], index: i })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ viewAreaCoveragePercentThreshold: 40 }}
          windowSize={5}
          initialNumToRender={2}
          maxToRenderPerBatch={3}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item, index }) => (
            <Pressable onPress={() => setControls((v) => !v)}>
              <Image
                source={{ uri: prefix + item.n }}
                style={{ width, height: vLayout.heights[index] }}
                contentFit="contain"
                recyclingKey={item.n}
                onLoad={(e) => {
                  // Se le proporzioni non erano note, si correggono appena l'immagine è caricata.
                  if (aspectOf(item) === 0 && e.source.width > 0 && e.source.height > 0 && !measured[item.n]) {
                    setMeasured((m) => ({ ...m, [item.n]: e.source.width / e.source.height }));
                  }
                }}
              />
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          key={`h-${mode}-${width}-${height}`}
          ref={hRef}
          data={hData}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          keyExtractor={(p) => p.n}
          extraData={page}
          initialScrollIndex={toIndex(page)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          onScrollToIndexFailed={() => {}}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            setPage(toIndex(Math.min(Math.max(i, 0), count - 1)));
          }}
          renderItem={({ item, index }) => (
            <ZoomablePage
              uri={prefix + item.n}
              width={width}
              height={height}
              aspect={aspectOf(item)}
              active={toIndex(index) === page}
              onTap={onTap}
              onZoomChange={setZoomed}
            />
          )}
        />
      )}

      {/* Numero di pagina discreto quando i comandi sono nascosti */}
      {!controls && showPageNumber ? (
        <View pointerEvents="none" style={[styles.pageBadge, { bottom: insets.bottom + 10 }]}>
          <Text style={styles.pageBadgeText}>
            {page + 1} / {count}
          </Text>
        </View>
      ) : null}

      {controls ? (
        <>
          <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
            <IconButton icon="arrow-back" tone="dark" label="Indietro" onPress={() => router.back()} />
            <View style={styles.titles}>
              <Text style={styles.title} numberOfLines={1}>
                {comic.title}
              </Text>
              <Text style={styles.subtitle}>
                Pagina {shownPage} di {count}
              </Text>
            </View>
            <IconButton icon="book-outline" tone="dark" label="Modalità di lettura" onPress={chooseMode} />
            <IconButton icon="eye-off-outline" tone="dark" label="Pulsante antipanico" onPress={panic} />
          </View>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Text style={styles.sliderLabel}>{rtl ? count : shownPage}</Text>
            <View style={styles.slider}>
              <PageSlider
                value={page}
                count={count}
                inverted={rtl}
                color={colors.primary}
                onPreview={setPreview}
                onSelect={(p) => {
                  setPreview(null);
                  goTo(p, false);
                }}
              />
            </View>
            <Text style={styles.sliderLabel}>{rtl ? shownPage : count}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const BAR_BG = 'rgba(10,10,12,0.82)';

const styles = StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  errorText: { fontSize: 16, textAlign: 'center' },
  pageBadge: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pageBadgeText: { color: '#fff', fontSize: 12.5, fontWeight: '600' },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: BAR_BG,
  },
  titles: { flex: 1 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12.5, marginTop: 1 },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: BAR_BG,
  },
  slider: { flex: 1 },
  sliderLabel: { color: '#fff', fontSize: 13, fontWeight: '700', minWidth: 28, textAlign: 'center' },
});
