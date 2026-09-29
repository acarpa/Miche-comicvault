import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ActionSheet';
import { LockScreen } from '@/components/LockScreen';
import { Snackbar } from '@/components/Snackbar';
import { useAppLock } from '@/hooks/useAppLock';
import { useIncomingShares, useLibraryLoader, useSettingsReady } from '@/hooks/useStartup';
import { useLock } from '@/store/useLock';
import { AppThemeProvider, useTheme } from '@/theme';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <Root />
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root() {
  const { colors, isDark } = useTheme();
  const ready = useSettingsReady();
  const locked = useLock((s) => s.locked);

  useLibraryLoader();
  useAppLock(ready);
  useIncomingShares(ready);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.background).catch(() => {});
  }, [colors.background]);

  const navTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.background,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [isDark, colors]);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="reader/[id]" options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }} />
        <Stack.Screen name="comic/[id]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="backup" />
        <Stack.Screen name="pin-setup" options={{ animation: 'slide_from_bottom' }} />
      </Stack>

      <Snackbar />
      <ActionSheet />

      {/* Il blocco copre tutto; finché le impostazioni non sono lette si mostra solo lo sfondo. */}
      {locked ? <LockScreen /> : null}
      {!ready ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} /> : null}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
