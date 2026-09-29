import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';

interface Props {
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  /** Numero di pallini da mostrare (se il PIN ha lunghezza fissa nota). */
  length?: number;
  /** Cambia valore per far "tremare" i pallini (PIN errato). */
  errorKey?: number;
  extraKey?: { icon: IconName; label: string; onPress: () => void } | null;
  disabled?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Tastierino numerico grande, comodo con una mano. */
export function PinPad({ value, onChange, maxLength = 8, length, errorKey = 0, extraKey, disabled }: Props) {
  const { colors } = useTheme();
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!errorKey) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Animated.sequence(
      [12, -12, 8, -8, 4, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
    ).start();
  }, [errorKey, shake]);

  const press = (digit: string) => {
    if (disabled || value.length >= maxLength) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(value + digit);
  };

  const dots = Math.max(length ?? 4, value.length);

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.dots, { transform: [{ translateX: shake }] }]}>
        {Array.from({ length: dots }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              { borderColor: colors.textMuted, backgroundColor: i < value.length ? colors.primary : 'transparent' },
            ]}
          />
        ))}
      </Animated.View>

      <View style={styles.grid}>
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}
        {extraKey ? (
          <Key icon={extraKey.icon} accessibilityLabel={extraKey.label} onPress={extraKey.onPress} disabled={disabled} subtle />
        ) : (
          <View style={styles.key} />
        )}
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Key
          icon="backspace-outline"
          accessibilityLabel="Cancella"
          onPress={() => onChange(value.slice(0, -1))}
          disabled={disabled || value.length === 0}
          subtle
        />
      </View>
    </View>
  );
}

function Key({
  label,
  icon,
  onPress,
  disabled,
  subtle,
  accessibilityLabel,
}: {
  label?: string;
  icon?: IconName;
  onPress: () => void;
  disabled?: boolean;
  subtle?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: subtle ? 'transparent' : pressed ? colors.surfaceAlt : colors.surface,
          opacity: disabled ? 0.35 : 1,
        },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={26} color={colors.text} />
      ) : (
        <Text style={[styles.keyText, { color: colors.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const KEY = 76;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 36 },
  dots: { flexDirection: 'row', gap: 16, minHeight: 18 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  grid: { width: KEY * 3 + 24 * 2, flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 16 },
  key: { width: KEY, height: KEY, borderRadius: KEY / 2, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 30, fontWeight: '500' },
});
