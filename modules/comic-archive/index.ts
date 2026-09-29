import { requireNativeModule } from 'expo';

/** Una pagina estratta dal fumetto. */
export interface ExtractedPage {
  /** Nome del file salvato (es. "0001.jpg"). */
  name: string;
  width: number;
  height: number;
  size: number;
}

export interface ExtractResult {
  /** Formato riconosciuto (es. "ZIP 2.0 (deflation)", "RAR5"). */
  format: string;
  pages: ExtractedPage[];
  totalBytes: number;
}

interface ComicArchiveNativeModule {
  /**
   * Estrae le immagini di un archivio (file:// o content://) nella cartella indicata,
   * rinominandole 0001.ext, 0002.ext... in ordine naturale.
   */
  extractImages(source: string, destDir: string): Promise<ExtractResult>;
  /** Crea un .cbz (file:// o content://) con le pagine indicate, nell'ordine dato. */
  writeCbz(srcDir: string, fileNames: string[], dest: string): Promise<void>;
  /** Nome originale di un file ricevuto da un'altra app. */
  getDisplayName(uri: string): Promise<string | null>;
}

export default requireNativeModule<ComicArchiveNativeModule>('ComicArchive');
