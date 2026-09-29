import { NativeModule, requireNativeModule } from 'expo';

/** Una pagina estratta dal fumetto. */
export interface ExtractedPage {
  /** Nome del file salvato (es. "0001.jpg"). */
  name: string;
  width: number;
  height: number;
  size: number;
}

export interface ExtractResult {
  /** Formato riconosciuto (es. "ZIP 2.0 (deflation)", "RAR5", "PDF"). */
  format: string;
  pages: ExtractedPage[];
  totalBytes: number;
}

/** Tipo di file riconosciuto dai primi byte (non dall'estensione). */
export type DetectedType = 'zip' | 'rar' | 'rar5' | '7z' | 'tar' | 'pdf' | 'gif' | 'image' | 'video' | 'unknown';

export interface MediaInfo {
  width: number;
  height: number;
  /** Solo per i video, 0 per immagini e GIF. */
  durationMs: number;
  /** true se la miniatura è stata creata. */
  thumb: boolean;
}

/** Avanzamento delle operazioni lunghe (per ora: estrazione del backup). */
export interface ProgressEvent {
  op: 'extract';
  /** File estratti finora. */
  done: number;
}

type ComicArchiveEvents = {
  onProgress: (event: ProgressEvent) => void;
};

declare class ComicArchiveNativeModule extends NativeModule<ComicArchiveEvents> {
  /**
   * Estrae le pagine di un fumetto (CBZ/ZIP, CBR/RAR, CB7/7Z, CBT/TAR, PDF; file:// o content://)
   * nella cartella indicata, rinominandole 0001.ext, 0002.ext... in ordine naturale.
   */
  extractImages(source: string, destDir: string): Promise<ExtractResult>;
  /** Crea un fumetto da una serie di immagini (file:// o content://), ordinate per nome in modo naturale. */
  importImages(sources: string[], names: string[], destDir: string): Promise<ExtractResult>;
  /** Riconosce il tipo di file dal contenuto. */
  detectType(source: string): Promise<DetectedType>;
  /** Crea un .cbz (file:// o content://) con le pagine indicate, nell'ordine dato. */
  writeCbz(srcDir: string, fileNames: string[], dest: string): Promise<void>;
  /** Nome originale di un file ricevuto da un'altra app. */
  getDisplayName(uri: string): Promise<string | null>;
  /** Dimensioni, durata e miniatura (JPEG) di una GIF, immagine o video. */
  mediaInfo(path: string, kind: 'gif' | 'image' | 'video', thumbPath: string): Promise<MediaInfo>;

  /** Backup: apre un file ZIP in scrittura (file:// o content://) e restituisce un identificativo. */
  zipOpen(dest: string): Promise<number>;
  /** Aggiunge un file di testo (compresso). */
  zipAddText(id: number, name: string, content: string): Promise<void>;
  /** Aggiunge dei file così come sono (senza ricomprimere). Restituisce quanti ne ha aggiunti. */
  zipAddFiles(id: number, paths: string[], names: string[]): Promise<number>;
  zipClose(id: number): Promise<void>;
  /** Legge un solo file di testo da uno ZIP (null se non c'è). */
  zipReadText(source: string, name: string): Promise<string | null>;
  /** Estrae tutto uno ZIP in una cartella. Restituisce il numero di file. */
  zipExtract(source: string, destDir: string): Promise<number>;

  /** Sposta una cartella (sostituendo la destinazione se esiste). */
  moveDirectory(src: string, dest: string): Promise<boolean>;
  /** Copia un file (anche da content://). Restituisce la dimensione in byte. */
  copyFile(src: string, dest: string): Promise<number>;
}

export default requireNativeModule<ComicArchiveNativeModule>('ComicArchive');
