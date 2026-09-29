import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/useSettings';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
}

const dark: Palette = {
  background: '#0E0E11',
  surface: '#18181D',
  surfaceAlt: '#24242B',
  text: '#F4F4F6',
  textMuted: '#A3A3AE',
  textFaint: '#63636E',
  border: '#2C2C35',
  primary: '#FF7A45',
  primarySoft: '#3A2219',
  onPrimary: '#1A0E08',
  danger: '#FF5C5C',
  success: '#3DD68C',
  warning: '#FFC53D',
  overlay: 'rgba(0,0,0,0.6)',
};

const light: Palette = {
  background: '#F6F5F2',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEBE6',
  text: '#18181B',
  textMuted: '#696972',
  textFaint: '#A1A1AA',
  border: '#E2E1DC',
  primary: '#E2582A',
  primarySoft: '#FCE7DE',
  onPrimary: '#FFFFFF',
  danger: '#E5484D',
  success: '#2F9E6A',
  warning: '#D99A00',
  overlay: 'rgba(10,10,20,0.4)',
};

interface ThemeValue {
  colors: Palette;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeValue>({ colors: dark, isDark: true });

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const mode = useSettings((s) => s.theme);
  const value = useMemo(() => {
    const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';
    return { colors: isDark ? dark : light, isDark };
  }, [mode, system]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
