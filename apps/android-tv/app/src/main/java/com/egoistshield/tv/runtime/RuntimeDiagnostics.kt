package com.egoistshield.tv.runtime

import android.content.Context
import com.egoistshield.tv.model.RuntimeDiagnosticEntry
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.ArrayDeque
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

private data class DiagnosticSnapshot(
  val epochMillis: Long,
  val level: String,
  val source: String,
  val message: String
)

object RuntimeDiagnostics {
  private const val MAX_ENTRIES = 40
  private val formatter = DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault())
  private val buffer = ArrayDeque<DiagnosticSnapshot>(MAX_ENTRIES)
  private val _entries = MutableStateFlow<List<RuntimeDiagnosticEntry>>(emptyList())

  @Volatile
  private var diagnosticsFile: File? = null

  val entries: StateFlow<List<RuntimeDiagnosticEntry>> = _entries.asStateFlow()

  fun initialize(context: Context) {
    val file = File(context.filesDir, "runtime/diagnostics.log").also { logFile ->
      logFile.parentFile?.mkdirs()
      if (!logFile.exists()) {
        logFile.createNewFile()
      }
    }

    diagnosticsFile = file
    if (buffer.isEmpty()) {
      loadExistingEntries(file)
    }
  }

  fun record(
    source: String,
    message: String,
    level: String = "INFO",
    context: Context? = null
  ) {
    if (diagnosticsFile == null && context != null) {
      initialize(context.applicationContext)
    }

    val snapshot = DiagnosticSnapshot(
      epochMillis = System.currentTimeMillis(),
      level = level.uppercase(),
      source = source,
      message = message
    )

    synchronized(buffer) {
      if (buffer.size >= MAX_ENTRIES) {
        buffer.removeFirst()
      }
      buffer.addLast(snapshot)
      _entries.value = buffer
        .toList()
        .asReversed()
        .map(::toUiEntry)
    }

    diagnosticsFile?.appendText(serialize(snapshot) + "\n")
  }

  fun logPath(): String? = diagnosticsFile?.absolutePath

  private fun loadExistingEntries(file: File) {
    val existing = runCatching {
      file.readLines()
        .takeLast(MAX_ENTRIES)
        .mapNotNull(::deserialize)
    }.getOrDefault(emptyList())

    synchronized(buffer) {
      buffer.clear()
      existing.forEach(buffer::addLast)
      _entries.value = buffer
        .toList()
        .asReversed()
        .map(::toUiEntry)
    }
  }

  private fun serialize(snapshot: DiagnosticSnapshot): String {
    return listOf(
      snapshot.epochMillis.toString(),
      snapshot.level,
      snapshot.source,
      snapshot.message.replace('\n', ' ')
    ).joinToString("|")
  }

  private fun deserialize(raw: String): DiagnosticSnapshot? {
    val parts = raw.split("|", limit = 4)
    if (parts.size != 4) return null
    return DiagnosticSnapshot(
      epochMillis = parts[0].toLongOrNull() ?: return null,
      level = parts[1],
      source = parts[2],
      message = parts[3]
    )
  }

  private fun toUiEntry(snapshot: DiagnosticSnapshot): RuntimeDiagnosticEntry {
    return RuntimeDiagnosticEntry(
      timeLabel = formatter.format(Instant.ofEpochMilli(snapshot.epochMillis)),
      levelLabel = snapshot.level,
      sourceLabel = displaySource(snapshot.source),
      message = snapshot.message
    )
  }

  private fun displaySource(source: String): String = when (source.lowercase()) {
    "runtime" -> "ядро"
    "service" -> "сервис"
    "boot" -> "автозапуск"
    "startup" -> "старт"
    "connect" -> "подключение"
    "import" -> "импорт"
    "settings" -> "система"
    "ui" -> "интерфейс"
    else -> source
  }
}
