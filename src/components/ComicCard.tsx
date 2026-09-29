import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { progressPercent } from '@/lib/format';
import { radius, useTheme } from '@/theme';
import type { ComicSummary } from '@/types';
import { ComicCover } from './ComicCover';

interface Props {
  comic: ComicSummary;
  width: number;
  onPress: (c: ComicSummary) => void;
  onLongPress: (c: ComicSummary) => void;
}

/** Copertina in griglia con barra di avanzamento e stato. */
export const ComicCard = memo(function ComicCard({ comic, width, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const pct = progressPercent(comic.currentPage, comic.pageCount, comic.completed);
  const started = comic.currentPage > 0 || comic.completed;
  const status = comic.completed ? 'Letto' : started ? `${comic.currentPage + 1}/${comic.pageCount}` : `${comic.pageCount} pag.`;

  return (
    <Pressable
      onPress={() => onPress(comic)}
      onLongPress={() => onLongPress(comic)}
      delayLongPress={350}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.8 : 1 }]}
    >
      <View style={[styles.coverWrap, { width, height: width * 1.5 }]}>
        <ComicCover comic={comic} style={StyleSheet.absoluteFill} />
        {comic.favorite ? (
          <View style={styles.badge}>
            <Ionicons name="heart" size={14} color="#FF6B8A" />
          </View>
        ) : null}
        {comic.completed ? (
          <View style={[styles.done, { backgroundColor: colors.success }]}>
            <Ionicons name="checkmark" size={13} color="#fff" />
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
      <Text style={[styles.meta, { color: comic.completed ? colors.success : colors.textMuted }]}>{status}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  coverWrap: { borderRadius: radius.sm + 2, overflow: 'hidden' },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    padding: 4,
  },
  done: { position: 'absolute', top: 6, right: 6, borderRadius: 11, padding: 3 },
  progressTrack: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4, backgroundColor: 'rgba(0,0,0,0.45)' },
  progressBar: { height: '100%' },
  title: { fontSize: 13.5, fontWeight: '600', marginTop: 6, lineHeight: 17 },
  meta: { fontSize: 12, marginTop: 1, fontWeight: '500' },
});
