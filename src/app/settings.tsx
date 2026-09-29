import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Card, Divider, Row, SectionLabel, Segmented, SwitchRow } from '@/components/ui';
import { formatBytes, formatRelative } from '@/lib/format';
import { biometricAvailable } from '@/lib/security';
import { totalSize } from '@/lib/selectors';
import { useLibrary } from '@/store/useLibrary';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useSettings();
  const comics = useLibrary((st) => st.comics);
  const size = useMemo(() => totalSize(comics), [comics]);
  const [bioAvailable, setBioAvailable] = useState(false);

  useEffect(() => {
    void biometricAvailable().then(setBioAvailable);
  }, []);

  const confirmDeleteAll = () =>
    Alert.alert(
      'Eliminare tutta la libreria?',
      `Verranno cancellati ${comics.length} fumetti da questo telefono. Se vuoi conservarli, fai prima un backup.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: 'Elimina tutto',
          style: 'destructive',
          onPress: () => {
            void useLibrary.getState().removeAll();
            useUi.getState().showSnackbar({ message: 'Libreria svuotata' });
          },
        },
      ],
    );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <ScreenHeader back title="Impostazioni" />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
        <SectionLabel icon="color-palette-outline">Aspetto</SectionLabel>
        <Card>
          <Text style={[styles.label, { color: colors.text }]}>Tema</Text>
          <Segmented
            value={s.theme}
            onChange={(theme) => s.set({ theme })}
            options={[
              { value: 'system', label: 'Sistema', icon: 'phone-portrait-outline' },
              { value: 'dark', label: 'Scuro', icon: 'moon-outline' },
              { value: 'light', label: 'Chiaro', icon: 'sunny-outline' },
            ]}
          />
          <Text style={[styles.label, { color: colors.text }]}>Copertine per riga</Text>
          <Segmented
            value={s.gridColumns}
            onChange={(gridColumns) => s.set({ gridColumns })}
            options={[
              { value: 2, label: '2 (grandi)' },
              { value: 3, label: '3 (piccole)' },
            ]}
          />
        </Card>

        <SectionLabel icon="book-outline">Lettura</SectionLabel>
        <Card>
          <Text style={[styles.label, { color: colors.text }]}>Modalità predefinita</Text>
          <Segmented
            value={s.defaultMode}
            onChange={(defaultMode) => s.set({ defaultMode })}
            options={[
              { value: 'ltr', label: 'Fumetto', icon: 'arrow-forward' },
              { value: 'rtl', label: 'Manga', icon: 'arrow-back' },
              { value: 'vertical', label: 'Webtoon', icon: 'swap-vertical' },
            ]}
          />
          <Text style={[styles.help, { color: colors.textMuted }]}>
            Puoi cambiarla per un singolo fumetto dal lettore o dalla sua scheda.
          </Text>
          <Divider />
          <SwitchRow
            icon="hand-left-outline"
            title="Tocca i bordi per girare pagina"
            subtitle="Bordo sinistro/destro: pagina precedente/successiva. Centro: comandi."
            value={s.tapZones}
            onChange={(tapZones) => s.set({ tapZones })}
          />
          <Divider />
          <SwitchRow icon="sunny-outline" title="Schermo sempre acceso" value={s.keepAwake} onChange={(keepAwake) => s.set({ keepAwake })} />
          <Divider />
          <SwitchRow
            icon="document-text-outline"
            title="Mostra il numero di pagina"
            value={s.showPageNumber}
            onChange={(showPageNumber) => s.set({ showPageNumber })}
          />
        </Card>

        <SectionLabel icon="lock-closed-outline">Privacy e sicurezza</SectionLabel>
        <Card>
          {s.pinEnabled ? (
            <>
              <Row icon="keypad-outline" title="Cambia PIN" onPress={() => router.push({ pathname: '/pin-setup', params: { mode: 'change' } })} />
              <Divider />
              <SwitchRow
                icon="finger-print"
                title="Sblocco con impronta"
                subtitle={bioAvailable ? undefined : 'Nessuna impronta configurata sul telefono'}
                value={s.biometric && bioAvailable}
                disabled={!bioAvailable}
                onChange={(biometric) => s.set({ biometric })}
              />
              <Divider />
              <Text style={[styles.label, { color: colors.text }]}>Chiedi il PIN quando torni nell'app</Text>
              <Segmented
                value={s.lockAfter}
                onChange={(lockAfter) => s.set({ lockAfter })}
                options={[
                  { value: 0, label: 'Subito' },
                  { value: 60, label: 'Dopo 1 min' },
                  { value: 300, label: 'Dopo 5 min' },
                ]}
              />
              <Divider />
              <Row
                icon="lock-open-outline"
                title="Disattiva il PIN"
                destructive
                onPress={() => router.push({ pathname: '/pin-setup', params: { mode: 'disable' } })}
              />
            </>
          ) : (
            <Row
              icon="keypad-outline"
              title="Proteggi con un PIN"
              subtitle="Chiede il PIN (o l'impronta) ogni volta che apri ComicVault"
              onPress={() => router.push({ pathname: '/pin-setup', params: { mode: 'set' } })}
            />
          )}
          <Divider />
          <SwitchRow
            icon="eye-off-outline"
            title="Schermo protetto"
            subtitle="Nasconde ComicVault nelle app recenti e blocca gli screenshot"
            value={s.secureScreen}
            onChange={(secureScreen) => s.set({ secureScreen })}
          />
          <Divider />
          <Text style={[styles.label, { color: colors.text }]}>Pulsante antipanico (icona con l'occhio)</Text>
          <Segmented
            value={s.panicAction}
            onChange={(panicAction) => s.set({ panicAction })}
            options={[
              { value: 'lock', label: 'Blocca' },
              { value: 'lockAndExit', label: 'Blocca ed esci' },
            ]}
          />
          <Text style={[styles.help, { color: colors.textMuted }]}>
            {s.pinEnabled
              ? s.panicAction === 'lock'
                ? 'Mostra subito la schermata del PIN.'
                : "Mostra la schermata del PIN e chiude l'app."
              : "Senza PIN il pulsante chiude semplicemente l'app."}
          </Text>
        </Card>

        <SectionLabel icon="server-outline">Dati</SectionLabel>
        <Card>
          <Row
            icon="save-outline"
            title="Backup e ripristino"
            subtitle={s.lastBackupAt ? `Ultimo backup: ${formatRelative(s.lastBackupAt)}` : 'Nessun backup ancora'}
            onPress={() => router.push('/backup')}
          />
          <Divider />
          <Row icon="pie-chart-outline" title="Spazio occupato" subtitle={`${comics.length} fumetti · ${formatBytes(size)}`} />
          <Divider />
          <Row icon="trash-outline" title="Elimina tutta la libreria" destructive disabled={comics.length === 0} onPress={confirmDeleteAll} />
        </Card>

        <View style={styles.about}>
          <Text style={[styles.help, { color: colors.textMuted, textAlign: 'center' }]}>
            ComicVault legge CBZ, CBR (anche RAR5), CB7, CBT, ZIP, RAR e 7Z.{'\n'}
            Tutto resta su questo telefono: nessun account, nessun server.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  label: { fontSize: 15, fontWeight: '600' },
  help: { fontSize: 13, lineHeight: 18 },
  about: { paddingVertical: spacing.lg },
});
