import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

interface Props {
  /** Pagina attuale (0 = prima). */
  value: number;
  count: number;
  /** Manga: la prima pagina sta a destra. */
  inverted?: boolean;
  color: string;
  /** Mentre si trascina (anteprima del numero di pagina). */
  onPreview: (page: number) => void;
  /** Quando si rilascia: salta alla pagina. */
  onSelect: (page: number) => void;
}

/** Barra per saltare velocemente a una pagina. */
export function PageSlider({ value, count, inverted, color, onPreview, onSelect }: Props) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const max = Math.max(1, count - 1);

  const pageAt = (x: number) => {
    if (width <= 0) return value;
    const f = Math.min(Math.max(x / width, 0), 1);
    const page = Math.round((inverted ? 1 - f : f) * max);
    return Math.min(Math.max(page, 0), count - 1);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => {
      const p = pageAt(e.x);
      setDragging(p);
      onPreview(p);
    })
    .onUpdate((e) => {
      const p = pageAt(e.x);
      setDragging(p);
      onPreview(p);
    })
    .onEnd((e) => onSelect(pageAt(e.x)))
    .onFinalize(() => setDragging(null));

  const shown = dragging ?? value;
  const fraction = count > 1 ? shown / max : 0;
  const pos = (inverted ? 1 - fraction : fraction) * width;

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.hit} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { backgroundColor: color, width: inverted ? width - pos : pos },
              inverted ? { right: 0 } : { left: 0 },
            ]}
          />
        </View>
        <View style={[styles.thumb, { backgroundColor: color, left: pos - THUMB / 2, transform: [{ scale: dragging !== null ? 1.25 : 1 }] }]} />
      </View>
    </GestureDetector>
  );
}

const THUMB = 20;

const styles = StyleSheet.create({
  hit: { height: 36, justifyContent: 'center' },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, bottom: 0 },
  thumb: { position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2, top: 8 },
});
