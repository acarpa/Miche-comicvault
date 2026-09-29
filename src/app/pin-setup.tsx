import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PinPad } from '@/components/PinPad';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PrimaryButton } from '@/components/ui';
import { clearPin, isValidPin, savePin, verifyPin } from '@/lib/security';
import { useSettings } from '@/store/useSettings';
import { useUi } from '@/store/useUi';
import { spacing, useTheme } from '@/theme';

type Mode = 'set' | 'change' | 'disable';
type Step = 'verify' | 'new' | 'confirm';

const TITLES: Record<Mode, string> = { set: 'Imposta il PIN', change: 'Cambia PIN', disable: 'Disattiva il PIN' };

/** Impostare, cambiare o togliere il PIN (4-8 cifre). */
export default function PinSetupScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === 'change' || params.mode === 'disable' ? params.mode : 'set';
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const pinLength = useSettings((s) => s.pinLength);
  const setSettings = useSettings((s) => s.set);

  const [step, setStep] = useState<Step>(mode === 'set' ? 'new' : 'verify');
  const [value, setValue] = useState('');
  const [first, setFirst] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (msg: string) => {
    setValue('');
    setMessage(msg);
    setErrorKey((k) => k + 1);
  };

  const finish = (text: string) => {
    useUi.getState().showSnackbar({ message: text });
    router.back();
  };

  const onChange = async (v: string) => {
    if (busy) return;
    setValue(v);
    setMessage(null);

    // Verifica del PIN attuale: si controlla appena raggiunge la lunghezza nota.
    if (step === 'verify' && v.length === pinLength) {
      setBusy(true);
      const ok = await verifyPin(v);
      setBusy(false);
      if (!ok) return fail('PIN errato, riprova');
      setValue('');
      if (mode === 'disable') {
        await clearPin();
        setSettings({ pinEnabled: false });
        finish('PIN disattivato');
      } else {
        setStep('new');
      }
      return;
    }

    // Conferma del nuovo PIN.
    if (step === 'confirm' && v.length === first.length) {
      if (v !== first) {
        setStep('new');
        setFirst('');
        return fail('I due PIN non coincidono, ricomincia');
      }
      setBusy(true);
      try {
        await savePin(v);
        setSettings({ pinEnabled: true, pinLength: v.length });
        finish(mode === 'change' ? 'PIN cambiato' : 'PIN attivato');
      } catch (e) {
        fail(`Impossibile salvare il PIN: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    }
  };

  const confirmNew = () => {
    if (!isValidPin(value)) return fail('Il PIN deve avere da 4 a 8 cifre');
    setFirst(value);
    setValue('');
    setStep('confirm');
  };

  const heading =
    step === 'verify' ? 'Inserisci il PIN attuale' : step === 'new' ? 'Scegli un nuovo PIN (4-8 cifre)' : 'Ripeti il nuovo PIN';

  return (
    <View style={[styles.flex, { backgroundColor: colors.background, paddingBottom: insets.bottom + spacing.lg }]}>
      <ScreenHeader back title={TITLES[mode]} />
      <View style={styles.body}>
        <Text style={[styles.heading, { color: colors.text }]}>{heading}</Text>
        <Text style={[styles.message, { color: message ? colors.danger : colors.textMuted }]}>
          {message ??
            (step === 'new'
              ? 'Se lo dimentichi dovrai reinstallare l\'app e i fumetti andranno persi: fai un backup ogni tanto.'
              : ' ')}
        </Text>
        <PinPad
          value={value}
          onChange={(v) => void onChange(v)}
          length={step === 'verify' ? pinLength : step === 'confirm' ? first.length : 4}
          maxLength={step === 'verify' ? pinLength : step === 'confirm' ? first.length : 8}
          errorKey={errorKey}
          disabled={busy}
        />
      </View>
      {step === 'new' ? (
        <View style={styles.footer}>
          <PrimaryButton label="Continua" icon="arrow-forward" onPress={confirmNew} disabled={value.length < 4} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xl },
  heading: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center', minHeight: 40, lineHeight: 20 },
  footer: { paddingHorizontal: spacing.xl },
});
