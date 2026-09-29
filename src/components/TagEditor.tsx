import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { hapticSelect } from '@/lib/haptics';
import { normalizeTags, type Facet } from '@/lib/series';
import { radius, spacing, useTheme } from '@/theme';

interface Props {
  tags: string[];
  /** Tag già usati in libreria (suggerimenti). */
  suggestions: Facet[];
  onChange: (tags: string[]) => void;
}

/** Tag del fumetto: tocca la × per toglierli, scrivi e premi invio per aggiungerli. */
export function TagEditor({ tags, suggestions, onChange }: Props) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState('');
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  const hints = suggestions
    .filter((s) => !lower.has(s.value.toLowerCase()) && (!draft.trim() || s.value.toLowerCase().includes(draft.trim().toLowerCase())))
    .slice(0, 12);

  const add = (value: string) => {
    const next = normalizeTags([...tags, value]);
    if (next.length !== tags.length) {
      hapticSelect();
      onChange(next);
    }
    setDraft('');
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.tags}>
        {tags.map((t) => (
          <Pressable
            key={t}
            onPress={() => onChange(tags.filter((x) => x !== t))}
            accessibilityLabel={`Togli il tag ${t}`}
            style={({ pressed }) => [styles.tag, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.tagText, { color: colors.primary }]}>#{t}</Text>
            <Ionicons name="close" size={14} color={colors.primary} />
          </Pressable>
        ))}
        {tags.length === 0 ? <Text style={[styles.empty, { color: colors.textFaint }]}>Nessun tag</Text> : null}
      </View>
      <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt }]}>
        <Ionicons name="pricetag-outline" size={17} color={colors.textMuted} />
        <TextInput
          value={draft}
          onChangeText={(v) => (v.endsWith(',') ? add(v.slice(0, -1)) : setDraft(v))}
          onSubmitEditing={() => add(draft)}
          submitBehavior="submit"
          placeholder="Aggiungi un tag (es. azione, horror)"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, { color: colors.text }]}
          autoCapitalize="none"
          returnKeyType="done"
          maxLength={30}
        />
        {draft.trim() ? (
          <Pressable onPress={() => add(draft)} hitSlop={8} accessibilityLabel="Aggiungi tag">
            <Ionicons name="add-circle" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {hints.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.hints}>
          {hints.map((h) => (
            <Pressable
              key={h.value}
              onPress={() => add(h.value)}
              style={({ pressed }) => [styles.hint, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.hintText, { color: colors.textMuted }]}>+ {h.value}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 11, paddingVertical: 6 },
  tagText: { fontSize: 13.5, fontWeight: '700' },
  empty: { fontSize: 13.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 },
  hints: { gap: spacing.sm },
  hint: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  hintText: { fontSize: 13 },
});
