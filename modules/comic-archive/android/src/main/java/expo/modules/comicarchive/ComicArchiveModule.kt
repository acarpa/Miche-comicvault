package expo.modules.comicarchive

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import android.system.Os
import android.system.OsConstants
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import me.zhanghai.android.libarchive.Archive
import me.zhanghai.android.libarchive.ArchiveEntry
import me.zhanghai.android.libarchive.ArchiveException
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.util.zip.Deflater
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * Modulo nativo di ComicVault.
 *
 * - extractImages: apre un fumetto (CBZ/ZIP, CBR/RAR anche RAR5, CB7/7Z, CBT/TAR) e salva
 *   le pagine come file numerati (0001.jpg, 0002.png, ...) in ordine "naturale"
 *   (pagina 2 prima di pagina 10). Restituisce anche le dimensioni di ogni pagina.
 * - writeCbz: ricrea un file .cbz a partire dalle pagine (per esportare o fare backup).
 * - getDisplayName: nome originale di un file ricevuto da un'altra app (content://).
 *
 * Tutte le funzioni sono AsyncFunction: girano su un thread in background, l'interfaccia non si blocca.
 */
class ComicArchiveModule : Module() {

  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_CONTEXT", "Contesto Android non disponibile", null)

  override fun definition() = ModuleDefinition {
    Name("ComicArchive")

    AsyncFunction("extractImages") { source: String, destDir: String ->
      extractImages(source, destDir)
    }

    AsyncFunction("writeCbz") { srcDir: String, fileNames: List<String>, dest: String ->
      writeCbz(srcDir, fileNames, dest)
    }

    AsyncFunction("getDisplayName") { uri: String ->
      getDisplayName(uri)
    }
  }

  // ---------------------------------------------------------------------------
  // Estrazione
  // ---------------------------------------------------------------------------

  private data class Extracted(val originalName: String, val file: File)

  private fun extractImages(source: String, destDir: String): Map<String, Any?> {
    val dest = toFile(destDir)
    if (!dest.exists() && !dest.mkdirs()) {
      throw CodedException("ERR_DEST", "Impossibile creare la cartella di destinazione", null)
    }

    val opened = openSource(source)
    val pfd = opened.first
    val tempCopy = opened.second
    val size = pfd.statSize
    if (size <= 0L) {
      pfd.close()
      tempCopy?.delete()
      throw CodedException("ERR_EMPTY", "Il file è vuoto o non leggibile", null)
    }

    val extracted = ArrayList<Extracted>()
    var formatName = "sconosciuto"
    var address = 0L
    try {
      address = Os.mmap(0, size, OsConstants.PROT_READ, OsConstants.MAP_PRIVATE, pfd.fileDescriptor, 0)
      val archive = Archive.readNew()
      try {
        Archive.setCharset(archive, Charsets.UTF_8.name().toByteArray())
        Archive.readSupportFilterAll(archive)
        Archive.readSupportFormatAll(archive)
        Archive.readOpenMemoryUnsafe(archive, address, size)

        val buffer = ByteBuffer.allocateDirect(256 * 1024)
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
          if (out.length() == 0L) {
            out.delete()
          } else {
            extracted.add(Extracted(name, out))
          }
        }
      } finally {
        Archive.readFree(archive)
      }
    } catch (e: ArchiveException) {
      cleanup(dest, extracted)
      throw CodedException(
        "ERR_ARCHIVE",
        "Archivio danneggiato, non supportato o protetto da password (${e.message ?: "errore sconosciuto"})",
        e
      )
    } catch (e: Exception) {
      cleanup(dest, extracted)
      throw CodedException("ERR_EXTRACT", "Errore durante l'apertura del fumetto: ${e.message}", e)
    } finally {
      if (address != 0L) Os.munmap(address, size)
      pfd.close()
      tempCopy?.delete()
    }

    // Ordine naturale sul percorso originale (cartelle comprese), poi rinomina 0001.ext, 0002.ext...
    extracted.sortWith { a, b -> naturalCompare(a.originalName, b.originalName) }
    val digits = maxOf(4, extracted.size.toString().length)
    var totalBytes = 0L
    val pages = ArrayList<Map<String, Any>>(extracted.size)
    extracted.forEachIndexed { index, item ->
      val ext = item.file.name.substringAfterLast('.')
      val finalName = "%0${digits}d.%s".format(index + 1, ext)
      val finalFile = File(dest, finalName)
      if (finalFile.exists()) finalFile.delete()
      if (!item.file.renameTo(finalFile)) {
        item.file.copyTo(finalFile, overwrite = true)
        item.file.delete()
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

    return mapOf(
      "format" to formatName,
      "pages" to pages,
      "totalBytes" to totalBytes.toDouble()
    )
  }

  /** Apre il file sorgente (file:// o content://) come ParcelFileDescriptor mappabile in memoria. */
  private fun openSource(source: String): Pair<ParcelFileDescriptor, File?> {
    if (source.startsWith("content://")) {
      val uri = Uri.parse(source)
      val direct = try {
        context.contentResolver.openFileDescriptor(uri, "r")
      } catch (e: Exception) {
        null
      }
      if (direct != null && direct.statSize > 0) return direct to null
      direct?.close()
      // Alcune app (es. cloud) non danno un file vero: lo copiamo prima nella cache.
      val temp = File.createTempFile("import_", ".bin", context.cacheDir)
      val input = context.contentResolver.openInputStream(uri)
        ?: throw CodedException("ERR_OPEN", "Impossibile aprire il file condiviso", null)
      input.use { inp -> temp.outputStream().use { out -> inp.copyTo(out, 256 * 1024) } }
      return ParcelFileDescriptor.open(temp, ParcelFileDescriptor.MODE_READ_ONLY) to temp
    }
    val file = toFile(source)
    if (!file.exists()) throw CodedException("ERR_NOT_FOUND", "File non trovato: ${file.name}", null)
    return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY) to null
  }

  // ---------------------------------------------------------------------------
  // Esportazione CBZ
  // ---------------------------------------------------------------------------

  private fun writeCbz(srcDir: String, fileNames: List<String>, dest: String) {
    val dir = toFile(srcDir)
    val output: OutputStream = if (dest.startsWith("content://")) {
      context.contentResolver.openOutputStream(Uri.parse(dest), "w")
        ?: throw CodedException("ERR_WRITE", "Impossibile scrivere nella cartella scelta", null)
    } else {
      val target = toFile(dest)
      target.parentFile?.mkdirs()
      FileOutputStream(target)
    }
    ZipOutputStream(output.buffered(256 * 1024)).use { zip ->
      // Le immagini sono già compresse: nessuna ricompressione, esportazione veloce.
      zip.setLevel(Deflater.NO_COMPRESSION)
      for (name in fileNames) {
        val file = File(dir, name)
        if (!file.isFile) continue
        zip.putNextEntry(ZipEntry(name))
        file.inputStream().use { it.copyTo(zip, 256 * 1024) }
        zip.closeEntry()
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Utilità
  // ---------------------------------------------------------------------------

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

  /** Elimina i file temporanei di un'estrazione fallita (anche quello scritto a metà). */
  private fun cleanup(dest: File, extracted: List<Extracted>) {
    extracted.forEach { it.file.delete() }
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
    private val IMAGE_EXTENSIONS = setOf("jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif")
  }
}
