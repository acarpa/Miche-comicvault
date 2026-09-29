import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, spacing, useTheme } from '@/theme';

/** Segnaposto animato (pulsa piano) mentre qualcosa si carica. */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [t]);

  const animated = useAnimatedStyle(() => ({ opacity: 0.45 + t.value * 0.55 }));

  return (
    <Animated.View style={[styles.base, { backgroundColor: colors.skeleton }, style, animated]} />
  );
}

/** Copertina + due righe di testo, come una scheda della griglia. */
export function SkeletonCard({ width }: { width: number }) {
  return (
    <View style={{ width }}>
      <Skeleton style={{ width, height: width * 1.5, borderRadius: radius.sm + 2 }} />
      <Skeleton style={[styles.line, { width: width * 0.85 }]} />
      <Skeleton style={[styles.lineSmall, { width: width * 0.5 }]} />
    </View>
  );
}

/** Griglia di schede finte (caricamento della libreria). */
export function SkeletonGrid({ columns, cardWidth, rows = 3, gap }: { columns: number; cardWidth: number; rows?: number; gap: number }) {
  return (
    <View style={{ gap: spacing.lg }}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={[styles.row, { gap }]}>
          {Array.from({ length: columns }).map((__, c) => (
            <SkeletonCard key={c} width={cardWidth} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Riga di elenco finta (serie, capitoli). */
export function SkeletonRow() {
  return (
    <View style={styles.listRow}>
      <Skeleton style={styles.thumb} />
      <View style={styles.listBody}>
        <Skeleton style={[styles.line, { width: '70%', marginTop: 0 }]} />
        <Skeleton style={[styles.lineSmall, { width: '45%' }]} />
        <Skeleton style={[styles.lineSmall, { width: '90%', height: 6 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderRadius: radius.sm },
  row: { flexDirection: 'row' },
  line: { height: 12, marginTop: 8, borderRadius: 6 },
  lineSmall: { height: 10, marginTop: 6, borderRadius: 5 },
  listRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  thumb: { width: 72, height: 104, borderRadius: radius.sm },
  listBody: { flex: 1, gap: 2 },
});
