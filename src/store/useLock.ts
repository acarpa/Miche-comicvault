import { create } from 'zustand';

interface LockState {
  /** true = mostra la schermata del PIN sopra a tutto. */
  locked: boolean;
  /** Tentativi sbagliati consecutivi e blocco temporaneo. */
  failedAttempts: number;
  cooldownUntil: number;
  /**
   * true mentre è aperta una schermata di sistema (selettore file, condivisione...):
   * in quei momenti l'app va "in background" ma non va bloccata.
   */
  externalActivity: boolean;
  setExternalActivity: (v: boolean) => void;
  lock: () => void;
  unlock: () => void;
  registerFailure: () => void;
}

const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

export const useLock = create<LockState>()((set, get) => ({
  locked: false,
  failedAttempts: 0,
  cooldownUntil: 0,
  externalActivity: false,
  setExternalActivity: (externalActivity) => set({ externalActivity }),
  lock: () => set({ locked: true }),
  unlock: () => set({ locked: false, failedAttempts: 0, cooldownUntil: 0 }),
  registerFailure: () => {
    const attempts = get().failedAttempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      set({ failedAttempts: 0, cooldownUntil: Date.now() + COOLDOWN_MS });
    } else {
      set({ failedAttempts: attempts });
    }
  },
}));

/** Esegue un'azione che apre una schermata di sistema senza far scattare il blocco automatico. */
export async function withoutAutoLock<T>(fn: () => Promise<T>): Promise<T> {
  useLock.getState().setExternalActivity(true);
  try {
    return await fn();
  } finally {
    // piccolo ritardo: l'evento "app di nuovo attiva" arriva dopo la chiusura del selettore
    setTimeout(() => useLock.getState().setExternalActivity(false), 1500);
  }
}
