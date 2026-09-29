/**
 * "Apri con → ComicVault" da un file manager: Android passa l'indirizzo del file (content://...).
 * Non è una pagina dell'app: lo importiamo e mostriamo la libreria.
 */
import { importFromOtherApp } from '@/hooks/useComicActions';

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  try {
    if (/^(content|file):\/\//i.test(path)) {
      // All'avvio a freddo si lascia il tempo all'app di aprirsi prima di iniziare.
      setTimeout(() => void importFromOtherApp([{ uri: path }]), initial ? 800 : 0);
      return '/';
    }
  } catch {
    return '/';
  }
  return path;
}
