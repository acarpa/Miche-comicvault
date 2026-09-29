import { Ionicons } from '@expo/vector-icons';
import { memo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatChapter } from '@/lib/format';
import type { SeriesGroup } from '@/lib/series';
import { radius, spacing, useTheme } from '@/theme';
import type { ComicSummary } from '@/types';
import { coverUri, measureHero, type HeroStart } from './ComicCard';
import { ComicCover } from './ComicCover';

interface Props {
  group: SeriesGroup;
  onOpen: (g: SeriesGroup) => void;
  onContinue: (c: ComicSummary, hero: HeroStart) => void;
}

/** Serie: copertine sovrapposte, capitoli letti e pulsante "continua". */
export const SeriesCard = memo(function SeriesCard({ group, onOpen, onContinue }: Props) {
  const { colors } = useTheme();
  const coverRef = useRef<View>(null);
  const covers = group.items.slice(0, 3);
  const pct = Math.round((group.readCount / Math.max(1, group.items.length)) * 100);
  const next = group.next;
  const nextLabel = next
    ? next.chapter !== null
      ? `Cap. ${formatChapter(next.chapter)}`
      : next.title
    : null;

  return (
    <Pressable
      onPress={() => onOpen(group)}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={styles.stack}>
        {covers
          .slice()
          .reverse()
          .map((c, i, arr) => {
            const depth = arr.length - 1 - i; // 0 = davanti
            return (
              <View
                key={c.id}
                ref={depth === 0 ? coverRef : undefined}
                collapsable={false}
                style={[
                  styles.cover,
                  {
                    left: depth * 10,
                    top: depth * 5,
                    opacity: depth === 0 ? 1 : 0.75 - depth * 0.15,
                    transform: [{ scale: 1 - depth * 0.08 }],
                    borderColor: colors.border,
                  },
                ]}
              >
                <ComicCover comic={c} style={StyleSheet.absoluteFill} />
              </View>
            );
          })}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
            {group.name}
          </Text>
          {group.favorite ? <Ionicons name="heart" size={15} color={colors.accent} /> : null}
        </View>
        {group.author ? (
          <Text numberOfLines={1} style={[styles.meta, { color: colors.textMuted }]}>
            {group.author}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {group.items.length === 1 ? '1 capitolo' : `${group.items.length} capitoli`} · {group.readCount} letti
        </Text>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.bar, { width: `${pct}%`, backgroundColor: pct === 100 ? colors.success : colors.primary }]} />
        </View>
        {next ? (
          <Pressable
            onPress={() => measureHero(coverRef.current, coverUri(covers[0]), (h) => onContinue(next, next.id === covers[0].id ? h : null))}
            hitSlop={6}
            style={({ pressed }) => [styles.continue, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.7 : 1 }]}
          >
            <Ionicons name="play" size={14} color={colors.primary} />
            <Text numberOfLines={1} style={[styles.continueText, { color: colors.primary }]}>
              {next.currentPage > 0 ? 'Continua' : 'Leggi'} {nextLabel}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.doneRow}>
            <Ionicons name="checkmark-done" size={15} color={colors.success} />
            <Text style={[styles.meta, { color: colors.success }]}>Serie completata</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
});

const COVER_W = 78;

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stack: { width: COVER_W + 20, height: COVER_W * 1.5 + 10 },
  cover: {
    position: 'absolute',
    width: COVER_W,
    height: COVER_W * 1.5,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { flex: 1, gap: 4, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  title: { flex: 1, fontSize: 16.5, fontWeight: '800', lineHeight: 21 },
  meta: { fontSize: 13 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  bar: { height: '100%' },
  continue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 6,
    maxWidth: '100%',
  },
  continueText: { fontSize: 13.5, fontWeight: '800', flexShrink: 1 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
});
