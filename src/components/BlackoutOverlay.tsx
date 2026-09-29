import { NavigationBar } from 'expo-navigation-bar';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { BackHandler, Pressable, StyleSheet } from 'react-native';

import { hapticTap } from '@/lib/haptics';
import { useUi } from '@/store/useUi';

/**
 * Pulsante antipanico, modalità "schermo nero": copre tutto con il nero, senza scritte.
 * Si torna tenendo premuto lo schermo per 2 secondi (se c'è un PIN, poi viene chiesto).
 * Il tasto "indietro" chiude l'app.
 */
export function BlackoutOverlay() {
  const blackout = useUi((s) => s.blackout);
  const setBlackout = useUi((s) => s.setBlackout);

  useEffect(() => {
    if (!blackout) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, [blackout]);

  if (!blackout) return null;
  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.black]}
      delayLongPress={2000}
      onLongPress={() => {
        hapticTap();
        setBlackout(false);
      }}
      accessibilityLabel="Schermo nero"
    >
      <StatusBar hidden />
      <NavigationBar hidden />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  black: { backgroundColor: '#000', zIndex: 2000, elevation: 2000 },
});
