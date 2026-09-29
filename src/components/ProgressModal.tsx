import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import { PrimaryButton } from './ui';

interface Props {
  visible: boolean;
  title: string;
  done: number;
  total: number;
  current?: string;
  onCancel?: () => void;
  canceling?: boolean;
}

/** Finestra con barra di avanzamento per le operazioni lunghe (backup, ripristino). */
export function ProgressModal({ visible, title, done, total, current, onCancel, canceling }: Props) {
  const { colors } = useTheme();
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.row}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
            <View style={[styles.bar, { width: `${pct}%`, backgroundColor: colors.primary }]} />
          </View>
          <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={2}>
            {total > 0 ? `${Math.min(done + 1, total)} di ${total}` : 'Preparazione…'}
            {current ? ` · ${current}` : ''}
          </Text>
          <Text style={[styles.hint, { color: colors.textFaint }]}>Tieni l'app aperta finché non ha finito.</Text>
          {onCancel ? (
            <PrimaryButton
              label={canceling ? 'Annullamento…' : 'Annulla'}
              tone="secondary"
              onPress={onCancel}
              disabled={canceling}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: spacing.xl },
  card: { borderRadius: radius.lg, padding: spacing.xl, gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 18, fontWeight: '800', flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: '100%' },
  sub: { fontSize: 14 },
  hint: { fontSize: 12.5 },
});
