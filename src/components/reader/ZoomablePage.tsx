import { Image } from 'expo-image';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

interface Props {
  uri: string;
  width: number;
  height: number;
  /** Proporzioni della pagina (larghezza/altezza); 0 se sconosciute. */
  aspect: number;
  /** false quando la pagina non è quella visibile: lo zoom torna a 1. */
  active: boolean;
  onTap: (x: number, y: number) => void;
  onZoomChange: (zoomed: boolean) => void;
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.min(Math.max(v, min), max);
}

/**
 * Pagina con zoom:
 * - pizzico con due dita per ingrandire (fino a 5x)
 * - doppio tocco per ingrandire/tornare normale
 * - trascina per spostarti quando è ingrandita
 * - tocco singolo: gestito dal lettore (girare pagina / mostrare i comandi)
 */
export const ZoomablePage = memo(function ZoomablePage({ uri, width, height, aspect, active, onTap, onZoomChange }: Props) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);
  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);

  // Dimensioni reali dell'immagine sullo schermo (adattata senza tagliare).
  const ratio = aspect > 0 ? aspect : width / height;
  const imgW = Math.min(width, height * ratio);
  const imgH = imgW / ratio;

  useEffect(() => {
    if (!active) {
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
    }
  }, [active, scale, tx, ty]);

  /** Quanto ci si può spostare senza far uscire la pagina dallo schermo. */
  const limits = (s: number) => {
    'worklet';
    return { x: Math.max(0, (imgW * s - width) / 2), y: Math.max(0, (imgH * s - height) / 2) };
  };

  const settle = () => {
    'worklet';
    if (scale.value <= 1.02) {
      scale.value = withTiming(1);
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      runOnJS(onZoomChange)(false);
      return;
    }
    const l = limits(scale.value);
    tx.value = withTiming(clamp(tx.value, -l.x, l.x));
    ty.value = withTiming(clamp(ty.value, -l.y, l.y));
    runOnJS(onZoomChange)(true);
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = scale.value;
      startTx.value = tx.value;
      startTy.value = ty.value;
      focusX.value = e.focalX - width / 2;
      focusY.value = e.focalY - height / 2;
    })
    .onUpdate((e) => {
      const s = clamp(startScale.value * e.scale, 0.8, MAX_SCALE);
      const k = s / startScale.value;
      // Il punto tra le dita resta fermo mentre si ingrandisce.
      tx.value = focusX.value - (focusX.value - startTx.value) * k;
      ty.value = focusY.value - (focusY.value - startTy.value) * k;
      scale.value = s;
    })
    .onEnd(() => settle());

  // Lo spostamento si attiva solo se la pagina è ingrandita: altrimenti lo swipe gira pagina.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, manager) => {
      if (scale.value > 1.02) manager.activate();
      else manager.fail();
    })
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate((e) => {
      const l = limits(scale.value);
      tx.value = clamp(startTx.value + e.translationX, -l.x, l.x);
      ty.value = clamp(startTy.value + e.translationY, -l.y, l.y);
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(220)
    .onEnd((e, success) => {
      if (!success) return;
      if (scale.value > 1.02) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        runOnJS(onZoomChange)(false);
        return;
      }
      const fx = e.x - width / 2;
      const fy = e.y - height / 2;
      const l = limits(DOUBLE_TAP_SCALE);
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      tx.value = withTiming(clamp(-fx * (DOUBLE_TAP_SCALE - 1), -l.x, l.x));
      ty.value = withTiming(clamp(-fy * (DOUBLE_TAP_SCALE - 1), -l.y, l.y));
      runOnJS(onZoomChange)(true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .onEnd((e, success) => {
      if (success) runOnJS(onTap)(e.x, e.y);
    });

  const gesture = Gesture.Simultaneous(pinch, pan, Gesture.Exclusive(doubleTap, singleTap));

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.page, { width, height }]} collapsable={false}>
        <Animated.View style={[styles.fill, animated]}>
          <Image source={{ uri }} style={styles.fill} contentFit="contain" transition={80} recyclingKey={uri} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  page: { overflow: 'hidden', backgroundColor: '#000' },
  fill: { flex: 1 },
});
