import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { comicDirPrefix } from '@/lib/paths';
import { useTheme } from '@/theme';
import type { ComicSummary } from '@/types';

/** Copertina del fumetto (miniatura salvata all'importazione). */
export const ComicCover = memo(function ComicCover({
  comic,
  style,
}: {
  comic: Pick<ComicSummary, 'id' | 'cover'>;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const uri = comic.cover ? `${comicDirPrefix(comic.id)}${comic.cover}` : null;

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceAlt }, style]}>
      <Ionicons name="book" size={28} color={colors.textFaint} style={styles.placeholder} />
      {uri && !failed ? (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={120}
          cachePolicy="memory"
          recyclingKey={uri}
          onError={() => setFailed(true)}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  placeholder: { position: 'absolute' },
});
