/** Mattoncini di interfaccia condivisi. */
import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing, useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return <View style={[styles.card, { backgroundColor: colors.surface }, style]}>{children}</View>;
}

export function SectionLabel({ children, icon }: { children: string; icon?: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={styles.labelRow}>
      {icon ? <Ionicons name={icon} size={15} color={colors.textMuted} /> : null}
      <Text style={[styles.label, { color: colors.textMuted }]}>{children}</Text>
    </View>
  );
}

export function IconButton({
  icon,
  onPress,
  onLongPress,
  label,
  active,
  tone = 'surface',
}: {
  icon: IconName;
  onPress: () => void;
  onLongPress?: () => void;
  label: string;
  active?: boolean;
  tone?: 'surface' | 'clear' | 'dark';
}) {
  const { colors } = useTheme();
  const bg =
    tone === 'dark' ? 'rgba(0,0,0,0.45)' : tone === 'clear' ? 'transparent' : active ? colors.primarySoft : colors.surface;
  const fg = tone === 'dark' ? '#FFFFFF' : active ? colors.primary : colors.text;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg, opacity: pressed ? 0.65 : 1 }]}
    >
      <Ionicons name={icon} size={21} color={fg} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? colors.primary : colors.surfaceAlt, opacity: pressed ? 0.75 : 1 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={15} color={selected ? colors.onPrimary : colors.textMuted} /> : null}
      <Text style={[styles.chipText, { color: selected ? colors.onPrimary : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && { backgroundColor: colors.surface }]}
          >
            {o.icon ? <Ionicons name={o.icon} size={15} color={active ? colors.primary : colors.textMuted} /> : null}
            <Text numberOfLines={1} style={[styles.segmentText, { color: active ? colors.text : colors.textMuted }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Riga cliccabile di un elenco impostazioni. */
export function Row({
  icon,
  title,
  subtitle,
  onPress,
  destructive,
  right,
  disabled,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: ReactNode;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructive ? colors.danger : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      style={({ pressed }) => [styles.row, { opacity: disabled ? 0.45 : pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon} size={21} color={destructive ? colors.danger : colors.textMuted} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null)}
    </Pressable>
  );
}

export function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Row
      icon={icon}
      title={title}
      subtitle={subtitle}
      disabled={disabled}
      right={
        <Switch
          value={value}
          onValueChange={onChange}
          disabled={disabled}
          trackColor={{ true: colors.primary, false: colors.surfaceAlt }}
          thumbColor="#fff"
        />
      }
    />
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
  tone = 'primary',
  disabled,
}: {
  label: string;
  icon?: IconName;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const bg = tone === 'primary' ? colors.primary : tone === 'danger' ? colors.danger : colors.surfaceAlt;
  const fg = tone === 'primary' ? colors.onPrimary : tone === 'danger' ? '#fff' : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {icon ? <Ionicons name={icon} size={20} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Pulsante tondo flottante (in basso a destra). */
export function Fab({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.fab,
        { backgroundColor: colors.primary, shadowColor: colors.primary, transform: [{ scale: pressed ? 0.92 : 1 }] },
      ]}
    >
      <Ionicons name={icon} size={30} color={colors.onPrimary} />
    </Pressable>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  label: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: radius.pill },
  chipText: { fontSize: 14, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: radius.md - 3,
  },
  segmentText: { fontSize: 13.5, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 13, lineHeight: 17 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 18,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
});
