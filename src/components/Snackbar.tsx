import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUi } from '@/store/useUi';
import { radius, spacing, useTheme } from '@/theme';

const DURATION = 4000;

/** Messaggio temporaneo in basso, con azione opzionale. */
export function Snackbar() {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const snackbar = useUi((s) => s.snackbar);
  const hide = useUi((s) => s.hideSnackbar);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!snackbar) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
    const current = snackbar.id;
    const t = setTimeout(() => {
      Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => {
        // nasconde solo se nel frattempo non è arrivato un altro messaggio
        if (useUi.getState().snackbar?.id === current) hide();
      });
    }, snackbar.duration ?? DURATION);
    return () => clearTimeout(t);
  }, [snackbar, anim, hide]);

  if (!snackbar) return null;

  const bg = isDark ? '#F2F2F5' : '#1F1F26';
  const fg = isDark ? '#17171C' : '#F2F2F5';

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          bottom: insets.bottom + 90,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        },
      ]}
    >
      <Animated.View style={[styles.bar, { backgroundColor: bg }]}>
        <Text style={[styles.text, { color: fg }]} numberOfLines={3}>
          {snackbar.message}
        </Text>
        {snackbar.actionLabel && snackbar.onAction ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              snackbar.onAction?.();
              hide();
            }}
          >
            <Text style={[styles.action, { color: colors.primary }]}>{snackbar.actionLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.lg, right: spacing.lg },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  text: { flex: 1, fontSize: 14.5, fontWeight: '500' },
  action: { fontSize: 14.5, fontWeight: '800', textTransform: 'uppercase' },
});
