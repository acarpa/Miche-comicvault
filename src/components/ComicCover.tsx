import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { comicDirPrefix } from '@/lib/paths';
import { useTheme } from '@/theme';
import type { ComicSummary } from '@/types';
import { Skeleton } from './Skeleton';

/** Copertina del fumetto (miniatura salvata all'importazione); scheletro animato finché non è pronta. */
export const ComicCover = memo(function ComicCover({
  comic,
  style,
}: {
  comic: Pick<ComicSummary, 'id' | 'cover'>;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const uri = comic.cover ? `${comicDirPrefix(comic.id)}${comic.cover}` : null;
  const [state, setState] = useState<{ uri: string | null; status: 'loading' | 'ok' | 'error' }>({ uri, status: 'loading' });
  // Se la copertina cambia (es. riciclo della cella), si riparte da "caricamento".
  const status = state.uri === uri ? state.status : 'loading';

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceAlt }, style]}>
      {!uri || status === 'error' ? (
        <Ionicons name="book" size={28} color={colors.textFaint} />
      ) : (
        <>
          {status === 'loading' ? <Skeleton style={StyleSheet.absoluteFill} /> : null}
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={160}
            cachePolicy="memory"
            recyclingKey={uri}
            onLoad={() => setState({ uri, status: 'ok' })}
            onError={() => setState({ uri, status: 'error' })}
          />
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
