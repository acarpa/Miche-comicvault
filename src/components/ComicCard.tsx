import { Ionicons } from '@expo/vector-icons';
import { memo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatChapter, progressPercent } from '@/lib/format';
import { comicDirPrefix } from '@/lib/paths';
import type { HeroInfo } from '@/store/useUi';
import { radius, useTheme } from '@/theme';
import type { ComicSummary } from '@/types';
import { ComicCover } from './ComicCover';

export type HeroStart = Omit<HeroInfo, 'key'> | null;

interface Props {
  comic: ComicSummary;
  width: number;
  /** hero: posizione della copertina sullo schermo, per l'animazione di apertura. */
  onPress: (c: ComicSummary, hero: HeroStart) => void;
  onLongPress: (c: ComicSummary) => void;
}

/** Misura dove si trova la copertina sullo schermo (per farla "volare" nel lettore). */
export function measureHero(node: View | null, uri: string | null, done: (h: HeroStart) => void) {
  if (!node || !uri) return done(null);
  let called = false;
  const timer = setTimeout(() => {
    if (!called) {
      called = true;
      done(null);
    }
  }, 120);
  node.measureInWindow((x: number, y: number, width: number, height: number) => {
    if (called) return;
    called = true;
    clearTimeout(timer);
    done(width > 0 && height > 0 ? { uri, x, y, width, height } : null);
  });
}

export function coverUri(comic: Pick<ComicSummary, 'id' | 'cover'>): string | null {
  return comic.cover ? `${comicDirPrefix(comic.id)}${comic.cover}` : null;
}

/** Copertina in griglia con barra di avanzamento, capitolo e stato. */
export const ComicCard = memo(function ComicCard({ comic, width, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const coverRef = useRef<View>(null);
  const pct = progressPercent(comic.currentPage, comic.pageCount, comic.completed);
  const started = comic.currentPage > 0 || comic.completed;
  const status = comic.completed ? 'Letto' : started ? `${comic.currentPage + 1}/${comic.pageCount}` : `${comic.pageCount} pag.`;
  const chapter = formatChapter(comic.chapter);

  return (
    <Pressable
      onPress={() => measureHero(coverRef.current, coverUri(comic), (h) => onPress(comic, h))}
      onLongPress={() => onLongPress(comic)}
      delayLongPress={350}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View ref={coverRef} collapsable={false} style={[styles.coverWrap, { width, height: width * 1.5, borderColor: colors.border }]}>
        <ComicCover comic={comic} style={StyleSheet.absoluteFill} />
        {comic.favorite ? (
          <View style={styles.badge}>
            <Ionicons name="heart" size={13} color={colors.accent} />
          </View>
        ) : null}
        {chapter ? (
          <View style={[styles.chapter, { backgroundColor: 'rgba(12,6,22,0.72)' }]}>
            <Text style={styles.chapterText}>#{chapter}</Text>
          </View>
        ) : null}
        {comic.completed ? (
          <View style={[styles.done, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={13} color="#0B1A12" />
          </View>
        ) : null}
        {started && !comic.completed ? (
          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${Math.max(pct, 3)}%`, backgroundColor: colors.primary }]} />
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
        {comic.title}
      </Text>
      <Text numberOfLines={1} style={[styles.meta, { color: comic.completed ? colors.success : colors.textMuted }]}>
        {status}
        {comic.author ? ` · ${comic.author}` : ''}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  coverWrap: { borderRadius: radius.sm + 2, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(12,6,22,0.65)',
    borderRadius: 12,
    padding: 4,
  },
  chapter: { position: 'absolute', bottom: 8, left: 6, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  chapterText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  done: { position: 'absolute', top: 6, right: 6, borderRadius: 11, padding: 3 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.45)' },
  progressBar: { height: '100%' },
  title: { fontSize: 13.5, fontWeight: '700', marginTop: 7, lineHeight: 17 },
  meta: { fontSize: 12, marginTop: 2, fontWeight: '500' },
});
