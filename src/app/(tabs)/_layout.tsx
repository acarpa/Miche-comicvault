import { Tabs } from 'expo-router';

import { TabBar, type TabBarProps } from '@/components/TabBar';
import { useTheme } from '@/theme';

/** Le quattro schede in basso: Libreria, Serie, Media, Impostazioni (con passaggio animato). */
export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      tabBar={(props: TabBarProps) => <TabBar {...props} />}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Libreria' }} />
      <Tabs.Screen name="series" options={{ title: 'Serie' }} />
      <Tabs.Screen name="media" options={{ title: 'Media' }} />
      <Tabs.Screen name="settings" options={{ title: 'Impostazioni' }} />
    </Tabs>
  );
}
