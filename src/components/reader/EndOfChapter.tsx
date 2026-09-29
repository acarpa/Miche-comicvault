import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatChapter } from '@/lib/format';
import { spacing } from '@/theme';
import type { ComicSummary } from '@/types';
import { ComicCover } from '../ComicCover';

interface Props {
  width: number;
  height: number;
  comic: ComicSummary;
  next: ComicSummary | null;
  accent: string;
  onNext: () => void;
  onClose: () => void;
}

/** Ultima "pagina" dopo la fine: capitolo successivo della serie o ritorno alla libreria. */
export function EndOfChapter({ width, height, comic, next, accent, onNext, onClose }: Props) {
  const series = comic.series.trim();
  return (
    <View style={[styles.wrap, { width, minHeight: height }]}>
      <Ionicons name="checkmark-circle" size={58} color="#45D99A" />
      <Text style={styles.title}>Fine del capitolo</Text>
      <Text style={styles.subtitle} numberOfLines={2}>
        {comic.title}
      </Text>

      {next ? (
        <Pressable onPress={onNext} style={({ pressed }) => [styles.next, { borderColor: accent, opacity: pressed ? 0.8 : 1 }]}>
          <ComicCover comic={next} style={styles.cover} />
          <View style={styles.nextBody}>
            <Text style={[styles.nextLabel, { color: accent }]}>
              {next.chapter !== null ? `Capitolo ${formatChapter(next.chapter)}` : 'Successivo'}
            </Text>
            <Text style={styles.nextTitle} numberOfLines={2}>
              {next.title}
            </Text>
            <View style={[styles.nextBtn, { backgroundColor: accent }]}>
              <Ionicons name="play" size={15} color="#150A28" />
              <Text style={styles.nextBtnText}>{next.currentPage > 0 && !next.completed ? 'Continua' : 'Leggi ora'}</Text>
            </View>
          </View>
        </Pressable>
      ) : series ? (
        <Text style={styles.done}>Hai letto l'ultimo capitolo di “{series}” che hai in libreria.</Text>
      ) : null}

      <Pressable onPress={onClose} hitSlop={10} style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
        <Ionicons name="library-outline" size={18} color="#fff" />
        <Text style={styles.backText}>Torna alla libreria</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: '#000' },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: 'rgba(255,255,255,0.65)', fontSize: 14.5, textAlign: 'center' },
  next: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignSelf: 'stretch',
    maxWidth: 460,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 18,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  cover: { width: 84, height: 126, borderRadius: 10 },
  nextBody: { flex: 1, justifyContent: 'center', gap: 6 },
  nextLabel: { fontSize: 12.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  nextTitle: { color: '#fff', fontSize: 16.5, fontWeight: '800' },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  nextBtnText: { color: '#150A28', fontSize: 14, fontWeight: '900' },
  done: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center', marginTop: spacing.md, lineHeight: 21 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.xl, padding: spacing.sm },
  backText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
