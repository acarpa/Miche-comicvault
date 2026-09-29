import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useImport } from '@/store/useImport';
import { radius, spacing, useTheme } from '@/theme';

/** Barra "Importazione 2 di 5…" mostrata mentre la coda lavora. */
export function ImportBanner() {
  const { colors } = useTheme();
  const running = useImport((s) => s.running);
  const total = useImport((s) => s.total);
  const done = useImport((s) => s.done);
  const current = useImport((s) => s.currentName);
  if (!running) return null;
  const progress = total > 0 ? done / total : 0;
  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.row}>
        <ActivityIndicator color={colors.primary} />
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>
            Importazione {Math.min(done + 1, total)} di {total}
          </Text>
          {current ? (
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
              {current}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
        <View style={[styles.bar, { width: `${Math.round(progress * 100)}%`, backgroundColor: colors.primary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, padding: spacing.md, gap: 10, borderWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1 },
  title: { fontSize: 14.5, fontWeight: '700' },
  sub: { fontSize: 12.5, marginTop: 1 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: '100%' },
});
