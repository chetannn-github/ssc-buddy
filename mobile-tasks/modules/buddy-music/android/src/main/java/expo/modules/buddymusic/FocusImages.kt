package expo.modules.buddymusic

import android.content.Context
import android.graphics.BitmapFactory
import android.net.Uri
import org.json.JSONArray
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

internal object FocusImagePolicy {
  fun candidates(files: List<String>, previous: String): List<String> =
    files.distinct().let { if (it.size > 1) it.filter { file -> file != previous } else it }
  fun validName(name: String) = name.isNotBlank() && name.length <= 240 && !name.contains('/') && !name.contains('\\') &&
    !name.contains('?') && !name.contains('#') && Regex("(?i).+\\.(jpg|jpeg|png|webp|gif|avif)$").matches(name)
}

/** Uses the web avatar manifest, with a durable offline pool. No React timer required. */
internal object FocusImages {
  private fun prefs(context: Context) = context.getSharedPreferences("buddy-focus-images", Context.MODE_PRIVATE)
  private fun files(raw: String) = JSONArray(raw).let { list -> (0 until list.length()).map { list.getString(it) } }
  fun configure(context: Context, localFiles: String, manifest: String) {
    require(URL(manifest).protocol == "https") { "Avatar source must use HTTPS." }
    val local = files(localFiles).filter { it.startsWith("file:") && File(Uri.parse(it).path.orEmpty()).isFile }
    val edit = prefs(context).edit().putString("manifest", manifest)
    if (local.isNotEmpty()) edit.putString("local", JSONArray(local).toString())
    edit.apply()
  }
  fun current(context: Context): String = prefs(context).getString("current", "").orEmpty()
  private fun read(url: String, limit: Int): ByteArray {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.connectTimeout = 5000; connection.readTimeout = 5000; connection.useCaches = false
    connection.setRequestProperty("Cache-Control", "no-cache, no-store")
    try {
      check(connection.responseCode == 200) { "Image source unavailable" }
      return connection.inputStream.use { input ->
        val output = java.io.ByteArrayOutputStream()
        val buffer = ByteArray(8192)
        var count = input.read(buffer)
        while (count != -1) {
          check(output.size() + count <= limit) { "Image source too large" }
          output.write(buffer, 0, count)
          count = input.read(buffer)
        }
        output.toByteArray()
      }
    } finally { connection.disconnect() }
  }
  private fun cached(folder: File, base: String, name: String): File {
    val hash = MessageDigest.getInstance("SHA-256").digest((base + name).toByteArray()).joinToString("") { "%02x".format(it) }
    return File(folder, "$hash.img")
  }
  fun next(context: Context, previous: String): String? {
    val p = prefs(context)
    val manifest = p.getString("manifest", "").orEmpty()
    val folder = File(context.filesDir, "focus-motivation").apply { mkdirs() }
    val base = manifest.substringBeforeLast('/', "") + "/"
    var remote = runCatching { files(p.getString("remote", "[]") ?: "[]") }.getOrDefault(emptyList())
    var online = false
    if (manifest.startsWith("https://")) runCatching {
      val fresh = files(String(read(manifest + "?v=" + System.currentTimeMillis(), 131072), Charsets.UTF_8))
        .filter(FocusImagePolicy::validName).distinct().take(256)
      p.edit().putString("remote", JSONArray(fresh).toString()).apply()
      remote = fresh; online = true
    }
    val names = remote.shuffled().sortedBy { Uri.fromFile(cached(folder, base, it)).toString() == previous }
    // Try one fresh image per rotation; a failed request falls back without changing the lock.
    if (online && names.isNotEmpty()) runCatching {
      val name = names.first()
      val target = cached(folder, base, name)
      val bytes = read(base + Uri.encode(name) + "?v=" + System.currentTimeMillis(), 8 * 1024 * 1024)
      val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
      BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
      check(bounds.outWidth > 0 && bounds.outHeight > 0 && bounds.outWidth.toLong() * bounds.outHeight <= 32_000_000) { "Invalid image" }
      val temporary = File(folder, "download.tmp")
      temporary.writeBytes(bytes)
      check(temporary.renameTo(target)) { "Could not cache image" }
      target.setLastModified(System.currentTimeMillis())
      folder.listFiles()?.filter { it.extension == "img" }?.sortedByDescending { it.lastModified() }?.drop(16)?.forEach { it.delete() }
      return Uri.fromFile(target).toString().also { p.edit().putString("current", it).apply() }
    }
    val cachedFiles = names.map { Uri.fromFile(cached(folder, base, it)).toString() }.filter { File(Uri.parse(it).path.orEmpty()).isFile }
    val local = runCatching { files(p.getString("local", "[]") ?: "[]") }.getOrDefault(emptyList()).filter { File(Uri.parse(it).path.orEmpty()).isFile }
    val pool = if (online && cachedFiles.isNotEmpty()) cachedFiles else cachedFiles + local
    return FocusImagePolicy.candidates(pool, previous).randomOrNull()?.also { p.edit().putString("current", it).apply() }
  }
}
