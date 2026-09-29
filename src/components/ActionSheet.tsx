import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSelect } from '@/lib/haptics';
import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';

/** Menu che sale dal basso (pressione prolungata, opzioni). */
export function ActionSheet() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sheet = useUi((s) => s.actionSheet);
  const hide = useUi((s) => s.hideActionSheet);
  const last = useRef(sheet);
  if (sheet) last.current = sheet;
  const shown = sheet ?? last.current;

  return (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={hide} statusBarTranslucent navigationBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={hide}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + spacing.md }]}
          onPress={() => {}}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          {shown?.title ? (
            <Text style={[styles.title, { color: colors.textMuted }]} numberOfLines={1}>
              {shown.title}
            </Text>
          ) : null}
          <ScrollView bounces={false} style={{ maxHeight: 460 }}>
            {shown?.options.map((opt) => {
              const color = opt.destructive ? colors.danger : opt.selected ? colors.primary : colors.text;
              return (
                <Pressable
                  key={opt.label}
                  onPress={() => {
                    hapticSelect();
                    hide();
                    setTimeout(opt.onPress, 120);
                  }}
                  style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.surfaceAlt }]}
                >
                  <Ionicons name={opt.icon} size={21} color={color} />
                  <Text style={[styles.optionText, { color }]}>{opt.label}</Text>
                  {opt.selected ? <Ionicons name="checkmark" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg + 4,
    borderTopRightRadius: radius.lg + 4,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginBottom: spacing.sm },
  title: { fontSize: 13.5, fontWeight: '600', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: 15,
    borderRadius: radius.md,
  },
  optionText: { flex: 1, fontSize: 16.5, fontWeight: '500' },
});
