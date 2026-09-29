package expo.modules.comicarchive

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import me.zhanghai.android.libarchive.Archive
import me.zhanghai.android.libarchive.ArchiveEntry
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.charset.Charset
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

/**
 * Modulo nativo di ComicVault.
 *
 * Fumetti
 * - extractImages: apre CBZ/ZIP, CBR/RAR (anche RAR5), CB7/7Z, CBT/TAR e PDF e salva le pagine
 *   come file numerati (0001.jpg, 0002.png, ...) in ordine "naturale" (pagina 2 prima di pagina 10).
 *   Il tipo di file si riconosce dal contenuto, non dall'estensione. Per gli ZIP, se libarchive
 *   fallisce si riprova con il lettore ZIP di Java.
 * - detectType: dice che tipo di file è (zip, rar, rar5, 7z, tar, pdf, gif, image, video, unknown).
 * - writeCbz: ricrea un .cbz a partire dalle pagine.
 *
 * Media
 * - mediaInfo: dimensioni, durata (video) e miniatura di GIF, immagini e video.
 *
 * Backup (.comicvault = file ZIP)
 * - zipOpen / zipAddText / zipAddFiles / zipClose: scrittura a pezzi (per mostrare l'avanzamento).
 * - zipReadText: legge un solo file dal backup (es. l'indice) senza estrarre il resto.
 * - zipExtract: estrae tutto il backup in una cartella.
 *
 * - importImages: crea un fumetto da una cartella di immagini (una pagina per immagine).
 *
 * Utilità: getDisplayName, moveDirectory, copyFile.
 * Tutte le funzioni sono AsyncFunction: girano in background, l'interfaccia non si blocca.
 * L'evento "onProgress" segnala l'avanzamento delle operazioni lunghe (estrazione del backup).
 */
class ComicArchiveModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_CONTEXT", "Contesto Android non disponibile", null)

  private val zipSessions = HashMap<Int, ZipOutputStream>()
  private var nextZipId = 1

  override fun definition() = ModuleDefinition {
    Name("ComicArchive")

    Events("onProgress")

    AsyncFunction("extractImages") { source: String, destDir: String ->
      extractImages(source, destDir)
    }

    AsyncFunction("detectType") { source: String ->
      detectType(source)
    }

    AsyncFunction("importImages") { sources: List<String>, names: List<String>, destDir: String ->
      importImages(sources, names, destDir)
    }

    AsyncFunction("writeCbz") { srcDir: String, fileNames: List<String>, dest: String ->
      writeCbz(srcDir, fileNames, dest)
    }

    AsyncFunction("getDisplayName") { uri: String ->
      getDisplayName(uri)
    }

    AsyncFunction("mediaInfo") { path: String, kind: String, thumbPath: String ->
      mediaInfo(path, kind, thumbPath)
    }

    AsyncFunction("zipOpen") { dest: String ->
      zipOpen(dest)
    }

    AsyncFunction("zipAddText") { id: Int, name: String, content: String ->
      zipAddText(id, name, content)
    }

    AsyncFunction("zipAddFiles") { id: Int, paths: List<String>, names: List<String> ->
      zipAddFiles(id, paths, names)
    }

    AsyncFunction("zipClose") { id: Int ->
      zipClose(id)
    }

    AsyncFunction("zipReadText") { source: String, name: String ->
      zipReadText(source, name)
    }

    AsyncFunction("zipExtract") { source: String, destDir: String ->
      zipExtract(source, destDir)
    }

    AsyncFunction("moveDirectory") { src: String, dest: String ->
      moveDirectory(src, dest)
    }

    AsyncFunction("copyFile") { src: String, dest: String ->
      copyFile(src, dest)
    }
  }

  // ---------------------------------------------------------------------------
  // Estrazione delle pagine
  // ---------------------------------------------------------------------------

  private data class Extracted(val originalName: String, val file: File)

  private fun extractImages(source: String, destDir: String): Map<String, Any?> {
    val dest = toFile(destDir)
    if (!dest.exists() && !dest.mkdirs()) {
      throw CodedException("ERR_DEST", "Impossibile creare la cartella di destinazione", null)
    }

    val local = localCopy(source)
    val file = local.first
    try {
      if (file.length() <= 0L) {
        throw CodedException("ERR_EMPTY", "Il file è vuoto o non leggibile", null)
      }
      val kind = sniffFile(file)
      when (kind) {
        "pdf" -> return extractPdf(file, dest)
        "gif", "image" -> throw CodedException(
          "ERR_IS_IMAGE",
          "È un'immagine, non un fumetto: aggiungila dalla sezione Media.",
          null
        )
        "video" -> throw CodedException("ERR_IS_VIDEO", "È un video: aggiungilo dalla sezione Media.", null)
      }

      var extracted: List<Extracted> = emptyList()
      var formatName = "sconosciuto"
      var failure: Exception? = null

      try {
        val result = extractWithLibarchive(file, dest)
        extracted = result.first
        formatName = result.second
      } catch (e: Exception) {
        failure = e
        cleanupTemp(dest)
      }

      // ZIP: se libarchive non ce la fa (o non trova immagini) si riprova con il lettore di Java.
      if (kind == "zip" && extracted.isEmpty()) {
        try {
          cleanupTemp(dest)
          extracted = extractWithZipFile(file, dest)
          formatName = "ZIP"
          failure = null
        } catch (e: Exception) {
          cleanupTemp(dest)
          if (failure == null) failure = e
        }
      }

      if (failure != null) {
        throw CodedException("ERR_ARCHIVE", describeFailure(kind, failure), failure)
      }
      if (extracted.isEmpty()) {
        throw CodedException("ERR_NO_IMAGES", "Nel file non ci sono immagini: non sembra un fumetto.", null)
      }
      return finalizePages(dest, extracted, formatName)
    } finally {
      if (local.second) file.delete()
    }
  }

  /** Messaggio chiaro in base al tipo di file riconosciuto. */
  private fun describeFailure(kind: String, e: Exception): String {
    val detail = e.message ?: "errore sconosciuto"
    return when (kind) {
      "rar", "rar5" ->
        "Impossibile aprire questo RAR: potrebbe essere protetto da password, diviso in più parti o danneggiato ($detail)"
      "zip" -> "Lo ZIP/CBZ è danneggiato o incompleto ($detail)"
      "7z" -> "Impossibile aprire questo 7Z/CB7: potrebbe essere protetto da password o danneggiato ($detail)"
      "unknown" -> "Formato non riconosciuto: il file non sembra un fumetto (CBZ, CBR, CB7, CBT o PDF). ($detail)"
      else -> "Archivio danneggiato o non supportato ($detail)"
    }
  }

  /** Lettura con libarchive (tutti i formati), come fa Mihon. */
  private fun extractWithLibarchive(file: File, dest: File): Pair<List<Extracted>, String> {
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val size = pfd.statSize
    val extracted = ArrayList<Extracted>()
    var formatName = "sconosciuto"
    var address = 0L
    try {
      address = Os.mmap(0, size, OsConstants.PROT_READ, OsConstants.MAP_PRIVATE, pfd.fileDescriptor, 0)
      val archive = Archive.readNew()
      try {
        try {
          Archive.setCharset(archive, Charsets.UTF_8.name().toByteArray())
        } catch (e: Exception) {
          // Senza conversione dei nomi si va avanti lo stesso: contano solo le estensioni.
        }
        Archive.readSupportFilterAll(archive)
        Archive.readSupportFormatAll(archive)
        Archive.readOpenMemoryUnsafe(archive, address, size)

        val buffer = ByteBuffer.allocateDirect(BUF)
        var counter = 0
        var first = true
        while (true) {
          val entry = Archive.readNextHeader(archive)
          if (entry == 0L) break
          if (first) {
            formatName = Archive.formatName(archive)?.decodeToString() ?: formatName
            first = false
          }
          if (ArchiveEntry.filetype(entry) != ArchiveEntry.AE_IFREG) continue
          val name = ArchiveEntry.pathnameUtf8(entry)
            ?: ArchiveEntry.pathname(entry)?.decodeToString()
            ?: continue
          if (isJunk(name)) continue
          val ext = imageExtension(name) ?: continue

          val out = File(dest, "tmp_%05d.%s".format(counter++, ext))
          FileOutputStream(out).channel.use { channel ->
            while (true) {
              buffer.clear()
              Archive.readData(archive, buffer)
              buffer.flip()
              if (!buffer.hasRemaining()) break
              while (buffer.hasRemaining()) channel.write(buffer)
            }
          }
          if (out.length() == 0L) out.delete() else extracted.add(Extracted(name, out))
        }
      } finally {
        Archive.readFree(archive)
      }
    } finally {
      if (address != 0L) Os.munmap(address, size)
      pfd.close()
    }
    return extracted to formatName
  }

  /** Lettore ZIP di Java (riserva per CBZ che libarchive non riesce ad aprire). */
  private fun extractWithZipFile(file: File, dest: File): List<Extracted> {
    return try {
      readZipEntries(ZipFile(file), dest)
    } catch (e: Exception) {
      // Nomi dei file non in UTF-8 (ZIP creati con vecchi programmi Windows): si riprova con CP437.
      cleanupTemp(dest)
      readZipEntries(ZipFile(file, Charset.forName("CP437")), dest)
    }
  }

  private fun readZipEntries(zip: ZipFile, dest: File): List<Extracted> {
    val out = ArrayList<Extracted>()
    zip.use { z ->
      var counter = 0
      val entries = z.entries()
      while (entries.hasMoreElements()) {
        val entry = entries.nextElement()
        if (entry.isDirectory) continue
        val name = entry.name
        if (isJunk(name)) continue
        val ext = imageExtension(name) ?: continue
        val target = File(dest, "tmp_%05d.%s".format(counter++, ext))
        z.getInputStream(entry).use { input ->
          FileOutputStream(target).use { output -> input.copyTo(output, BUF) }
        }
        if (target.length() == 0L) target.delete() else out.add(Extracted(name, target))
      }
    }
    return out
  }

  /** PDF: ogni pagina diventa un'immagine JPEG (renderer di sistema di Android). */
  private fun extractPdf(file: File, dest: File): Map<String, Any?> {
    val pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = try {
      PdfRenderer(pfd)
    } catch (e: SecurityException) {
      pfd.close()
      throw CodedException("ERR_PDF_LOCKED", "Il PDF è protetto da password", e)
    } catch (e: Exception) {
      pfd.close()
      throw CodedException("ERR_PDF", "Impossibile aprire il PDF (${e.message})", e)
    }
    val pages = ArrayList<Map<String, Any>>()
    var totalBytes = 0L
    try {
      val count = renderer.pageCount
      val digits = maxOf(4, count.toString().length)
      for (i in 0 until count) {
        val page = renderer.openPage(i)
        try {
          val scale = PDF_WIDTH.toFloat() / maxOf(1, page.width)
          val width = PDF_WIDTH
          val height = maxOf(1, (page.height * scale).toInt())
          val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
          bitmap.eraseColor(Color.WHITE)
          page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
          val name = "%0${digits}d.jpg".format(i + 1)
          val out = File(dest, name)
          FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 88, it) }
          bitmap.recycle()
          val bytes = out.length()
          totalBytes += bytes
          pages.add(mapOf("name" to name, "width" to width, "height" to height, "size" to bytes.toDouble()))
        } finally {
          page.close()
        }
      }
    } finally {
      renderer.close() // chiude anche il file
    }
    if (pages.isEmpty()) throw CodedException("ERR_NO_IMAGES", "Il PDF non ha pagine", null)
    return mapOf("format" to "PDF", "pages" to pages, "totalBytes" to totalBytes.toDouble())
  }

  /** Cartella di immagini → fumetto: copia le immagini (file:// o content://) e le numera in ordine naturale. */
  private fun importImages(sources: List<String>, names: List<String>, destDir: String): Map<String, Any?> {
    val dest = toFile(destDir)
    if (!dest.exists() && !dest.mkdirs()) {
      throw CodedException("ERR_DEST", "Impossibile creare la cartella di destinazione", null)
    }
    val extracted = ArrayList<Extracted>()
    try {
      for (i in sources.indices) {
        val name = if (i < names.size) names[i] else sources[i].substringAfterLast('/')
        if (isJunk(name)) continue
        val ext = imageExtension(name) ?: continue
        val out = File(dest, "tmp_%05d.%s".format(i, ext))
        openInput(sources[i]).use { input -> FileOutputStream(out).use { input.copyTo(it, BUF) } }
        if (out.length() == 0L) out.delete() else extracted.add(Extracted(name, out))
      }
    } catch (e: Exception) {
      cleanupTemp(dest)
      throw CodedException("ERR_COPY", "Impossibile copiare le immagini (${e.message})", e)
    }
    if (extracted.isEmpty()) throw CodedException("ERR_NO_IMAGES", "Nella cartella non ci sono immagini.", null)
    return finalizePages(dest, extracted, "Cartella di immagini")
  }

  /**
   * Ordine naturale sul percorso originale, poi rinomina 0001.ext, 0002.ext... e legge le dimensioni.
   * Le strisce lunghissime (webtoon) vengono tagliate in pezzi: nel lettore verticale non si vede
   * nessuno stacco, ma il telefono non deve caricare immagini enormi (che farebbero chiudere l'app).
   */
  private fun finalizePages(dest: File, list: List<Extracted>, formatName: String): Map<String, Any?> {
    val sorted = list.sortedWith { a, b -> naturalCompare(a.originalName, b.originalName) }
    val files = ArrayList<File>(sorted.size)
    for (item in sorted) files.addAll(splitIfTall(item.file))
    val digits = maxOf(4, files.size.toString().length)
    var totalBytes = 0L
    val pages = ArrayList<Map<String, Any>>(files.size)
    files.forEachIndexed { index, file ->
      val ext = file.name.substringAfterLast('.')
      val finalName = "%0${digits}d.%s".format(index + 1, ext)
      val finalFile = File(dest, finalName)
      if (finalFile.exists()) finalFile.delete()
      if (!file.renameTo(finalFile)) {
        file.copyTo(finalFile, overwrite = true)
        file.delete()
      }
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeFile(finalFile.absolutePath, bounds)
      val bytes = finalFile.length()
      totalBytes += bytes
      pages.add(
        mapOf(
          "name" to finalName,
          "width" to maxOf(0, bounds.outWidth),
          "height" to maxOf(0, bounds.outHeight),
          "size" to bytes.toDouble()
        )
      )
    }
    return mapOf("format" to formatName, "pages" to pages, "totalBytes" to totalBytes.toDouble())
  }

  /** Taglia un'immagine molto alta in pezzi di altezza gestibile (se non si può, la lascia intera). */
  private fun splitIfTall(file: File): List<File> {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    val w = bounds.outWidth
    val h = bounds.outHeight
    if (w <= 0 || h <= TALL_MIN_HEIGHT || h < w * 3) return listOf(file)
    val parts = ArrayList<File>()
    var decoder: BitmapRegionDecoder? = null
    try {
      @Suppress("DEPRECATION")
      val d = BitmapRegionDecoder.newInstance(file.absolutePath, false) ?: return listOf(file)
      decoder = d
      val chunk = (w * 2).coerceIn(TALL_CHUNK_MIN, TALL_CHUNK_MAX)
      var top = 0
      var i = 0
      val base = file.name.substringBeforeLast('.')
      while (top < h) {
        val bottom = minOf(h, top + chunk)
        val bitmap = d.decodeRegion(Rect(0, top, w, bottom), null)
          ?: throw IllegalStateException("regione non leggibile")
        val out = File(file.parentFile, "%s_p%03d.jpg".format(base, i++))
        FileOutputStream(out).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bitmap.recycle()
        parts.add(out)
        top = bottom
      }
    } catch (e: Throwable) {
      parts.forEach { it.delete() }
      return listOf(file)
    } finally {
      decoder?.recycle()
    }
    file.delete()
    return parts
  }

  // ---------------------------------------------------------------------------
  // Riconoscimento del tipo di file (dai primi byte)
  // ---------------------------------------------------------------------------

  private fun detectType(source: String): String {
    val head = ByteArray(HEAD_BYTES)
    val n = openInput(source).use { readFully(it, head) }
    return sniff(head, n)
  }

  private fun sniffFile(file: File): String {
    val head = ByteArray(HEAD_BYTES)
    val n = FileInputStream(file).use { readFully(it, head) }
    return sniff(head, n)
  }

  private fun readFully(input: InputStream, buffer: ByteArray): Int {
    var total = 0
    while (total < buffer.size) {
      val read = input.read(buffer, total, buffer.size - total)
      if (read <= 0) break
      total += read
    }
    return total
  }

  private fun sniff(head: ByteArray, n: Int): String {
    fun at(offset: Int, vararg bytes: Int): Boolean {
      if (n < offset + bytes.size) return false
      for (i in bytes.indices) {
        if ((head[offset + i].toInt() and 0xFF) != bytes[i]) return false
      }
      return true
    }
    return when {
      at(0, 0x50, 0x4B, 0x03, 0x04) || at(0, 0x50, 0x4B, 0x05, 0x06) || at(0, 0x50, 0x4B, 0x07, 0x08) -> "zip"
      at(0, 0x52, 0x61, 0x72, 0x21, 0x1A, 0x07, 0x01, 0x00) -> "rar5"
      at(0, 0x52, 0x61, 0x72, 0x21, 0x1A, 0x07) -> "rar"
      at(0, 0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C) -> "7z"
      at(0, 0x25, 0x50, 0x44, 0x46) -> "pdf"
      at(257, 0x75, 0x73, 0x74, 0x61, 0x72) -> "tar"
      at(0, 0x47, 0x49, 0x46, 0x38) -> "gif"
      at(0, 0xFF, 0xD8, 0xFF) || at(0, 0x89, 0x50, 0x4E, 0x47) -> "image"
      at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50) -> "image"
      at(4, 0x66, 0x74, 0x79, 0x70) ->
        if (at(8, 0x61, 0x76, 0x69, 0x66) || at(8, 0x68, 0x65, 0x69, 0x63) || at(8, 0x6D, 0x69, 0x66, 0x31)) "image" else "video"
      at(0, 0x1A, 0x45, 0xDF, 0xA3) -> "video"
      else -> "unknown"
    }
  }

  // ---------------------------------------------------------------------------
  // Media (GIF, immagini, video)
  // ---------------------------------------------------------------------------

  private fun mediaInfo(path: String, kind: String, thumbPath: String): Map<String, Any?> {
    val file = toFile(path)
    val thumb = toFile(thumbPath)
    thumb.parentFile?.mkdirs()

    if (kind == "video") {
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(file.absolutePath)
        var width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull() ?: 0
        var height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull() ?: 0
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        if (rotation == 90 || rotation == 270) {
          val t = width
          width = height
          height = t
        }
        val durationMs = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
        val atUs = if (durationMs > 2000L) 1_000_000L else 0L
        val frame = retriever.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
        val hasThumb = frame != null && saveThumb(frame, thumb)
        return mapOf("width" to width, "height" to height, "durationMs" to durationMs.toDouble(), "thumb" to hasThumb)
      } catch (e: Exception) {
        return mapOf("width" to 0, "height" to 0, "durationMs" to 0.0, "thumb" to false)
      } finally {
        try {
          retriever.release()
        } catch (e: Exception) {
          // ignora
        }
      }
    }

    // Immagini e GIF: dimensioni + miniatura statica (il primo fotogramma per le GIF).
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file.absolutePath, bounds)
    val width = maxOf(0, bounds.outWidth)
    val height = maxOf(0, bounds.outHeight)
    var sample = 1
    while (width / (sample * 2) >= THUMB_WIDTH) sample *= 2
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    val bitmap = try {
      BitmapFactory.decodeFile(file.absolutePath, options)
    } catch (e: Throwable) {
      null
    }
    val hasThumb = bitmap != null && saveThumb(bitmap, thumb)
    return mapOf("width" to width, "height" to height, "durationMs" to 0.0, "thumb" to hasThumb)
  }

  private fun saveThumb(src: Bitmap, target: File): Boolean {
    return try {
      val scale = THUMB_WIDTH.toFloat() / maxOf(1, src.width)
      val scaled = if (scale < 1f) {
        Bitmap.createScaledBitmap(src, THUMB_WIDTH, maxOf(1, (src.height * scale).toInt()), true)
      } else {
        src
      }
      FileOutputStream(target).use { scaled.compress(Bitmap.CompressFormat.JPEG, 82, it) }
      if (scaled !== src) scaled.recycle()
      src.recycle()
      true
    } catch (e: Exception) {
      false
    }
  }

  // ---------------------------------------------------------------------------
  // Esportazione CBZ
  // ---------------------------------------------------------------------------

  private fun writeCbz(srcDir: String, fileNames: List<String>, dest: String) {
    val dir = toFile(srcDir)
    ZipOutputStream(BufferedOutputStream(openOutput(dest), BUF)).use { zip ->
      // Le immagini sono già compresse: nessuna ricompressione, esportazione veloce.
      zip.setLevel(Deflater.NO_COMPRESSION)
      for (name in fileNames) {
        val file = File(dir, name)
        if (!file.isFile) continue
        zip.putNextEntry(ZipEntry(name))
        FileInputStream(file).use { it.copyTo(zip, BUF) }
        zip.closeEntry()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Backup .comicvault (ZIP)
  // ---------------------------------------------------------------------------

  private fun zipOpen(dest: String): Int {
    val zip = ZipOutputStream(BufferedOutputStream(openOutput(dest), BUF))
    synchronized(zipSessions) {
      val id = nextZipId++
      zipSessions[id] = zip
      return id
    }
  }

  private fun session(id: Int): ZipOutputStream {
    val zip = synchronized(zipSessions) { zipSessions[id] }
    return zip ?: throw CodedException("ERR_ZIP", "Il file di backup non è aperto", null)
  }

  private fun zipAddText(id: Int, name: String, content: String) {
    val zip = session(id)
    zip.setLevel(Deflater.DEFAULT_COMPRESSION)
    zip.putNextEntry(ZipEntry(name))
    zip.write(content.toByteArray(Charsets.UTF_8))
    zip.closeEntry()
  }

  private fun zipAddFiles(id: Int, paths: List<String>, names: List<String>): Int {
    val zip = session(id)
    zip.setLevel(Deflater.NO_COMPRESSION)
    var added = 0
    for (i in paths.indices) {
      val file = toFile(paths[i])
      if (!file.isFile) continue
      val entryName = if (i < names.size) names[i] else file.name
      zip.putNextEntry(ZipEntry(entryName))
      FileInputStream(file).use { it.copyTo(zip, BUF) }
      zip.closeEntry()
      added++
    }
    return added
  }

  private fun zipClose(id: Int) {
    val zip = synchronized(zipSessions) { zipSessions.remove(id) } ?: return
    zip.close()
  }

  private fun zipReadText(source: String, name: String): String? {
    val zip = ZipInputStream(openInput(source).buffered(BUF))
    try {
      var entry = zip.nextEntry
      while (entry != null) {
        if (entry.name == name) return zip.readBytes().toString(Charsets.UTF_8)
        entry = zip.nextEntry
      }
      return null
    } finally {
      zip.close()
    }
  }

  private fun zipExtract(source: String, destDir: String): Int {
    val dest = toFile(destDir)
    dest.mkdirs()
    val root = dest.canonicalPath + File.separator
    var count = 0
    var lastEvent = 0L
    val zip = ZipInputStream(openInput(source).buffered(BUF))
    try {
      var entry = zip.nextEntry
      while (entry != null) {
        val target = File(dest, entry.name)
        // Sicurezza: nessun file può finire fuori dalla cartella di destinazione.
        if (!target.canonicalPath.startsWith(root)) {
          throw CodedException("ERR_ZIP", "Il backup contiene percorsi non validi", null)
        }
        if (entry.isDirectory) {
          target.mkdirs()
        } else {
          target.parentFile?.mkdirs()
          FileOutputStream(target).use { zip.copyTo(it, BUF) }
          count++
          val now = System.currentTimeMillis()
          if (now - lastEvent > 150L) {
            lastEvent = now
            sendEvent("onProgress", Bundle().apply {
              putString("op", "extract")
              putInt("done", count)
            })
          }
        }
        entry = zip.nextEntry
      }
    } finally {
      zip.close()
    }
    return count
  }

  // ---------------------------------------------------------------------------
  // Utilità
  // ---------------------------------------------------------------------------

  private fun moveDirectory(src: String, dest: String): Boolean {
    val from = toFile(src)
    val to = toFile(dest)
    if (!from.exists()) return false
    if (to.exists()) to.deleteRecursively()
    to.parentFile?.mkdirs()
    if (from.renameTo(to)) return true
    val ok = from.copyRecursively(to, overwrite = true)
    from.deleteRecursively()
    return ok
  }

  private fun copyFile(src: String, dest: String): Double {
    val target = toFile(dest)
    target.parentFile?.mkdirs()
    openInput(src).use { input -> FileOutputStream(target).use { input.copyTo(it, BUF) } }
    return target.length().toDouble()
  }

  /** Copia locale del file sorgente (i content:// di altre app non sono sempre file veri). */
  private fun localCopy(source: String): Pair<File, Boolean> {
    if (source.startsWith("content://")) {
      val temp = File.createTempFile("import_", ".bin", context.cacheDir)
      openInput(source).use { input -> FileOutputStream(temp).use { input.copyTo(it, BUF) } }
      return temp to true
    }
    val file = toFile(source)
    if (!file.exists()) throw CodedException("ERR_NOT_FOUND", "File non trovato: ${file.name}", null)
    return file to false
  }

  private fun openInput(source: String): InputStream {
    if (source.startsWith("content://")) {
      return context.contentResolver.openInputStream(Uri.parse(source))
        ?: throw CodedException("ERR_OPEN", "Impossibile aprire il file", null)
    }
    val file = toFile(source)
    if (!file.exists()) throw CodedException("ERR_NOT_FOUND", "File non trovato: ${file.name}", null)
    return FileInputStream(file)
  }

  private fun openOutput(dest: String): OutputStream {
    if (dest.startsWith("content://")) {
      return context.contentResolver.openOutputStream(Uri.parse(dest), "w")
        ?: throw CodedException("ERR_WRITE", "Impossibile scrivere nella cartella scelta", null)
    }
    val target = toFile(dest)
    target.parentFile?.mkdirs()
    return FileOutputStream(target)
  }

  private fun getDisplayName(uri: String): String? {
    if (!uri.startsWith("content://")) {
      return Uri.parse(uri).lastPathSegment ?: File(uri).name
    }
    return try {
      context.contentResolver.query(Uri.parse(uri), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor ->
          if (cursor.moveToFirst()) {
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0) cursor.getString(index) else null
          } else {
            null
          }
        }
    } catch (e: Exception) {
      null
    }
  }

  /** Elimina i file temporanei di un'estrazione non riuscita. */
  private fun cleanupTemp(dest: File) {
    dest.listFiles { f -> f.name.startsWith("tmp_") }?.forEach { it.delete() }
  }

  private fun toFile(pathOrUri: String): File {
    return if (pathOrUri.startsWith("file://")) {
      File(Uri.parse(pathOrUri).path ?: pathOrUri.removePrefix("file://"))
    } else {
      File(pathOrUri)
    }
  }

  private fun isJunk(path: String): Boolean {
    if (path.contains("__MACOSX/")) return true
    val base = path.substringAfterLast('/')
    return base.startsWith(".") || base.equals("thumbs.db", ignoreCase = true)
  }

  private fun imageExtension(path: String): String? {
    val ext = path.substringAfterLast('.', "").lowercase()
    return if (ext in IMAGE_EXTENSIONS) (if (ext == "jpeg") "jpg" else ext) else null
  }

  /** Confronto "naturale": "pag2" < "pag10", senza distinguere maiuscole/minuscole. */
  private fun naturalCompare(a: String, b: String): Int {
    val x = a.lowercase()
    val y = b.lowercase()
    var i = 0
    var j = 0
    while (i < x.length && j < y.length) {
      val ci = x[i]
      val cj = y[j]
      if (ci.isDigit() && cj.isDigit()) {
        var ei = i
        while (ei < x.length && x[ei].isDigit()) ei++
        var ej = j
        while (ej < y.length && y[ej].isDigit()) ej++
        val ni = x.substring(i, ei).trimStart('0')
        val nj = y.substring(j, ej).trimStart('0')
        if (ni.length != nj.length) return ni.length - nj.length
        val cmp = ni.compareTo(nj)
        if (cmp != 0) return cmp
        i = ei
        j = ej
      } else {
        if (ci != cj) return ci.compareTo(cj)
        i++
        j++
      }
    }
    val rest = (x.length - i) - (y.length - j)
    return if (rest != 0) rest else a.compareTo(b)
  }

  companion object {
    private const val BUF = 256 * 1024
    private const val HEAD_BYTES = 300
    private const val PDF_WIDTH = 1600
    private const val THUMB_WIDTH = 480
    private const val TALL_MIN_HEIGHT = 5000
    private const val TALL_CHUNK_MIN = 2400
    private const val TALL_CHUNK_MAX = 4096
    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif")
  }
}
