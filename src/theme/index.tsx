import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { useSettings } from '@/store/useSettings';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  /** Superficie in rilievo (fogli, barra delle schede). */
  elevated: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  /** Secondo accento (preferiti, GIF). */
  accent: string;
  accentSoft: string;
  /** Terzo accento (video, informazioni). */
  info: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
  /** Scheletri di caricamento. */
  skeleton: string;
  skeletonHighlight: string;
}

/** Tema scuro: base #130c1f (viola notte) con accenti viola, rosa e azzurro. */
const dark: Palette = {
  background: '#130C1F',
  surface: '#1C132D',
  surfaceAlt: '#281D3D',
  elevated: '#21172F',
  text: '#F4EFFF',
  textMuted: '#AC9FC6',
  textFaint: '#6F628A',
  border: '#33264B',
  primary: '#A874FF',
  primarySoft: '#2D1F4A',
  onPrimary: '#150A28',
  accent: '#FF5FA2',
  accentSoft: '#3A1830',
  info: '#5CCBFF',
  danger: '#FF5C7A',
  success: '#45D99A',
  warning: '#FFC857',
  overlay: 'rgba(7,3,14,0.72)',
  skeleton: '#241A37',
  skeletonHighlight: '#33264D',
};

const light: Palette = {
  background: '#F7F4FC',
  surface: '#FFFFFF',
  surfaceAlt: '#EDE7F7',
  elevated: '#FFFFFF',
  text: '#1B1228',
  textMuted: '#6B5F80',
  textFaint: '#A79CB9',
  border: '#E3DCEF',
  primary: '#7C3AED',
  primarySoft: '#EFE6FF',
  onPrimary: '#FFFFFF',
  accent: '#E0337E',
  accentSoft: '#FDE4EF',
  info: '#0A8BC7',
  danger: '#E5484D',
  success: '#2F9E6A',
  warning: '#C98A00',
  overlay: 'rgba(20,10,35,0.45)',
  skeleton: '#E9E2F4',
  skeletonHighlight: '#F5F1FA',
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

/** Altezza della barra delle schede (serve per lasciare spazio a liste e pulsanti). */
export const TAB_BAR_HEIGHT = 64;
