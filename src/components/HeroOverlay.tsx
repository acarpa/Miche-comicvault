import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useUi } from '@/store/useUi';

const GROW_MS = 340;
const FADE_MS = 240;

/**
 * Animazione "Hero": la copertina toccata si ingrandisce fino a riempire lo schermo mentre si apre
 * il lettore, poi sfuma e lascia il posto alla prima pagina.
 */
export function HeroOverlay() {
  const hero = useUi((s) => s.hero);
  const endHero = useUi((s) => s.endHero);
  const { width: W, height: H } = useWindowDimensions();
  const grow = useSharedValue(0);
  const fade = useSharedValue(1);

  useEffect(() => {
    if (!hero) return;
    grow.value = 0;
    fade.value = 1;
    grow.value = withTiming(1, { duration: GROW_MS, easing: Easing.out(Easing.cubic) });
    fade.value = withDelay(
      GROW_MS + 60,
      withTiming(0, { duration: FADE_MS }, (finished) => {
        if (finished) runOnJS(endHero)();
      }),
    );
  }, [hero, grow, fade, endHero]);

  const box = useAnimatedStyle(() => {
    if (!hero) return { opacity: 0 };
    // Destinazione: a tutta larghezza (o tutta altezza), centrata, con le proporzioni della copertina.
    const ratio = hero.width > 0 && hero.height > 0 ? hero.height / hero.width : 1.5;
    let tw = W;
    let th = W * ratio;
    if (th > H) {
      th = H;
      tw = H / ratio;
    }
    const tx = (W - tw) / 2;
    const ty = (H - th) / 2;
    const g = grow.value;
    return {
      left: hero.x + (tx - hero.x) * g,
      top: hero.y + (ty - hero.y) * g,
      width: hero.width + (tw - hero.width) * g,
      height: hero.height + (th - hero.height) * g,
      borderRadius: 10 * (1 - g),
      opacity: fade.value,
    };
  });

  const backdrop = useAnimatedStyle(() => ({ opacity: grow.value * fade.value }));

  if (!hero) return null;
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.backdrop, backdrop]} />
      <Animated.View pointerEvents="none" style={[styles.box, box]}>
        <Image source={{ uri: hero.uri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000', zIndex: 900, elevation: 900 },
  box: { position: 'absolute', overflow: 'hidden', zIndex: 901, elevation: 901 },
});
