import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSelect } from '@/lib/haptics';
import { radius, TAB_BAR_HEIGHT, useTheme } from '@/theme';
import type { IconName } from '@/theme/icons';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Libreria', icon: 'library-outline', iconActive: 'library' },
  series: { label: 'Serie', icon: 'albums-outline', iconActive: 'albums' },
  media: { label: 'Media', icon: 'play-circle-outline', iconActive: 'play-circle' },
  settings: { label: 'Impostazioni', icon: 'settings-outline', iconActive: 'settings' },
};

interface Route {
  key: string;
  name: string;
  params?: object;
}

/** Le proprietà che la barra riceve dal navigatore a schede (solo quelle usate qui). */
export interface TabBarProps {
  state: { index: number; routes: Route[] };
  navigation: any;
}

const PAD = 6;

/** Barra delle schede in basso: pillola che scivola sotto la scheda attiva, vibrazione leggera al tocco. */
export function TabBar({ state, navigation }: TabBarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  const count = state.routes.length;
  const tabWidth = width > 0 ? (width - PAD * 2) / count : 0;

  useEffect(() => {
    x.value = withSpring(state.index * tabWidth, { damping: 20, stiffness: 220, mass: 0.8 });
  }, [state.index, tabWidth, x]);

  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.wrap, { paddingBottom: insets.bottom + 8, backgroundColor: colors.background }]}>
      <View
        style={[styles.bar, { backgroundColor: colors.elevated, borderColor: colors.border }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {tabWidth > 0 ? (
          <Animated.View style={[styles.indicator, { width: tabWidth, backgroundColor: colors.primarySoft }, indicator]} />
        ) : null}
        {state.routes.map((route, i) => {
          const focused = state.index === i;
          const tab = TABS[route.name] ?? { label: route.name, icon: 'ellipse-outline', iconActive: 'ellipse' };
          const color = focused ? colors.primary : colors.textMuted;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              hapticSelect();
              navigation.navigate(route.name, route.params);
            }
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={styles.tab}
            >
              <Ionicons name={focused ? tab.iconActive : tab.icon} size={22} color={color} />
              <Text numberOfLines={1} style={[styles.label, { color, fontWeight: focused ? '800' : '600' }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 6 },
  bar: {
    height: TAB_BAR_HEIGHT,
    borderRadius: radius.lg + 4,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  indicator: { position: 'absolute', left: PAD, top: PAD, bottom: PAD, borderRadius: radius.lg },
  tab: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  label: { fontSize: 11.5 },
});
