import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { authenticateBiometric, biometricAvailable, verifyPin } from '@/lib/security';
import { useLock } from '@/store/useLock';
import { useSettings } from '@/store/useSettings';
import { useTheme } from '@/theme';
import { PinPad } from './PinPad';

/** Schermata di blocco: copre tutta l'app finché non si inserisce il PIN (o l'impronta). */
export function LockScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const unlock = useLock((s) => s.unlock);
  const registerFailure = useLock((s) => s.registerFailure);
  const cooldownUntil = useLock((s) => s.cooldownUntil);
  const biometricEnabled = useSettings((s) => s.biometric);
  const pinLength = useSettings((s) => s.pinLength);
  const [pin, setPin] = useState('');
  const [checking, setChecking] = useState(false);
  const [errorKey, setErrorKey] = useState(0);
  const [canBio, setCanBio] = useState(false);
  const [now, setNow] = useState(Date.now());

  const waiting = cooldownUntil > now;

  const tryBiometric = useCallback(async () => {
    if (await authenticateBiometric()) unlock();
  }, [unlock]);

  // All'apertura propone subito l'impronta, se attiva.
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = biometricEnabled && (await biometricAvailable());
      if (!alive) return;
      setCanBio(ok);
      if (ok) void tryBiometric();
    })();
    return () => {
      alive = false;
    };
  }, [biometricEnabled, tryBiometric]);

  // Conto alla rovescia dopo troppi tentativi.
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [waiting]);

  // Il tasto "indietro" di Android chiude l'app invece di aggirare il blocco.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => sub.remove();
  }, []);

  const onChange = async (value: string) => {
    if (checking) return;
    setPin(value);
    if (value.length < pinLength) return;
    setChecking(true);
    const ok = await verifyPin(value);
    setChecking(false);
    setPin('');
    if (ok) {
      unlock();
    } else {
      registerFailure();
      setErrorKey((k) => k + 1);
      setNow(Date.now());
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: colors.background, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.logo, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name="lock-closed" size={30} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>ComicVault è bloccato</Text>
      <Text style={[styles.subtitle, { color: waiting ? colors.danger : colors.textMuted }]}>
        {waiting ? `Troppi tentativi. Riprova tra ${Math.ceil((cooldownUntil - now) / 1000)} s` : 'Inserisci il PIN'}
      </Text>

      <View style={styles.pad}>
        <PinPad
          value={pin}
          onChange={(v) => void onChange(v)}
          length={pinLength}
          maxLength={pinLength}
          errorKey={errorKey}
          disabled={waiting || checking}
          extraKey={canBio ? { icon: 'finger-print', label: 'Usa impronta', onPress: () => void tryBiometric() } : null}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', zIndex: 1000, elevation: 1000 },
  logo: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 15, marginTop: 6 },
  pad: { flex: 1, justifyContent: 'center' },
});
