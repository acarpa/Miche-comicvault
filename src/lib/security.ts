/**
 * PIN e sblocco biometrico.
 * Il PIN non viene mai salvato in chiaro: si conserva solo un'impronta (SHA-256 con "sale")
 * nel portachiavi cifrato di Android (SecureStore).
 */
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'comicvault.pin';

interface StoredPin {
  salt: string;
  hash: string;
}

async function hashPin(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${pin}`);
}

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function savePin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPin(pin, salt);
  const value: StoredPin = { salt, hash };
  await SecureStore.setItemAsync(PIN_KEY, JSON.stringify(value));
}

export async function verifyPin(pin: string): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(PIN_KEY);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw) as StoredPin;
    return (await hashPin(pin, stored.salt)) === stored.hash;
  } catch {
    return false;
  }
}

export async function hasPin(): Promise<boolean> {
  return !!(await SecureStore.getItemAsync(PIN_KEY));
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}

/** Il telefono ha impronta/volto configurati? */
export async function biometricAvailable(): Promise<boolean> {
  try {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  } catch {
    return false;
  }
}

export async function authenticateBiometric(): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Sblocca ComicVault',
      cancelLabel: 'Usa il PIN',
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}
