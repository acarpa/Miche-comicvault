import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/lib/format';
import { mediaThumbUri, mediaUri } from '@/lib/paths';
import { useTheme } from '@/theme';
import type { MediaItem } from '@/types';
import { Skeleton } from '../Skeleton';

interface Props {
  item: MediaItem;
  size: number;
  onPress: (m: MediaItem) => void;
  onLongPress: (m: MediaItem) => void;
}

/** Miniatura quadrata di una GIF, foto o video. */
export const MediaTile = memo(function MediaTile({ item, size, onPress, onLongPress }: Props) {
  const { colors } = useTheme();
  const [loaded, setLoaded] = useState(false);
  // Miniatura JPEG leggera; per le foto senza miniatura si usa il file stesso.
  const uri = item.thumb ? mediaThumbUri(item.thumb) : item.kind === 'video' ? null : mediaUri(item.fileName);

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item)}
      delayLongPress={350}
      style={({ pressed }) => [styles.tile, { width: size, height: size, backgroundColor: colors.surfaceAlt, opacity: pressed ? 0.8 : 1 }]}
    >
      {uri ? (
        <>
          {!loaded ? <Skeleton style={StyleSheet.absoluteFill} /> : null}
          <Image
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={140}
            recyclingKey={uri}
            autoplay={false}
            onLoad={() => setLoaded(true)}
          />
        </>
      ) : (
        <Ionicons name="videocam" size={28} color={colors.textFaint} />
      )}
      {item.kind === 'gif' ? (
        <View style={[styles.badge, styles.badgeLeft, { backgroundColor: colors.accent }]}>
          <Text style={styles.badgeText}>GIF</Text>
        </View>
      ) : null}
      {item.kind === 'video' ? (
        <View style={[styles.badge, styles.badgeRight]}>
          <Ionicons name="play" size={10} color="#fff" />
          <Text style={styles.badgeText}>{formatDuration(item.durationMs)}</Text>
        </View>
      ) : null}
      {item.favorite ? (
        <View style={styles.heart}>
          <Ionicons name="heart" size={13} color={colors.accent} />
        </View>
      ) : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  tile: { overflow: 'hidden', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    bottom: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    backgroundColor: 'rgba(12,6,22,0.72)',
  },
  badgeLeft: { left: 5 },
  badgeRight: { right: 5 },
  badgeText: { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  heart: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(12,6,22,0.6)', borderRadius: 10, padding: 3 },
});
