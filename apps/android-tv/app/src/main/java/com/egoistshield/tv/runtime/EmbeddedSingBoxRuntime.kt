package com.egoistshield.tv.runtime

import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.VpnService
import androidx.core.content.ContextCompat
import com.egoistshield.tv.BuildConfig
import io.nekohasekai.libbox.Libbox
import io.nekohasekai.libbox.SetupOptions
import java.io.File
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

const val embeddedRuntimeBridgeLabel: String = "libbox (встроенный)"

enum class EmbeddedRuntimeStage {
  IDLE,
  STARTING,
  RUNNING,
  STOPPING,
  ERROR
}

data class RuntimeLaunchRequest(
  val nodeId: String,
  val profileName: String,
  val configPath: String
)

data class EmbeddedRuntimeStatus(
  val available: Boolean = false,
  val stage: EmbeddedRuntimeStage = EmbeddedRuntimeStage.IDLE,
  val activeNodeId: String? = null,
  val profileName: String? = null,
  val message: String = "Инициализируем встроенный VPN runtime...",
  val bridgeLabel: String = embeddedRuntimeBridgeLabel
)

object EmbeddedSingBoxRuntime {
  private val initialized = AtomicBoolean(false)
  private val _status = MutableStateFlow(EmbeddedRuntimeStatus())
  val status: StateFlow<EmbeddedRuntimeStatus> = _status.asStateFlow()

  fun initialize(application: Application) {
    if (initialized.get()) return

    runCatching {
      val baseDir = File(application.filesDir, "libbox").also { it.mkdirs() }
      val workingDir = (
        application.getExternalFilesDir(null)?.let { File(it, "libbox") }
          ?: File(application.filesDir, "runtime")
        ).also { it.mkdirs() }
      val tempDir = File(application.cacheDir, "libbox").also { it.mkdirs() }

      Libbox.setLocale(Locale.getDefault().toLanguageTag().replace("-", "_"))
      Libbox.setup(
        SetupOptions().apply {
          basePath = baseDir.absolutePath
          workingPath = workingDir.absolutePath
          tempPath = tempDir.absolutePath
          fixAndroidStack = true
          logMaxLines = 3000
          debug = BuildConfig.DEBUG
        }
      )
      Libbox.redirectStderr(File(workingDir, "stderr.log").absolutePath)
      initialized.set(true)
      RuntimeDiagnostics.record("runtime", "libbox успешно инициализирован.", context = application)
      markIdle("Встроенный VPN runtime готов к запуску.")
    }.onFailure { error ->
      RuntimeDiagnostics.record(
        "runtime",
        error.message ?: "Не удалось инициализировать встроенный libbox runtime.",
        level = "ERROR",
        context = application
      )
      _status.value = EmbeddedRuntimeStatus(
        available = false,
        stage = EmbeddedRuntimeStage.ERROR,
        message = error.message ?: "Не удалось инициализировать встроенный libbox runtime."
      )
    }
  }

  fun isAvailable(): Boolean = initialized.get()

  fun prepareVpnPermission(context: Context): Intent? = VpnService.prepare(context)

  fun createLaunchRequest(
    context: Context,
    nodeId: String,
    profileName: String,
    configContent: String
  ): RuntimeLaunchRequest {
    val runtimeDirectory = File(context.filesDir, "runtime").also { it.mkdirs() }
    val configFile = File(runtimeDirectory, "active-profile.json")
    configFile.writeText(configContent)
    return RuntimeLaunchRequest(
      nodeId = nodeId,
      profileName = profileName,
      configPath = configFile.absolutePath
    )
  }

  fun start(context: Context, request: RuntimeLaunchRequest) {
    markStarting(request, "Запускаем встроенный туннель для профиля ${request.profileName}.")
    RuntimeDiagnostics.record(
      "runtime",
      "Передаём профиль ${request.profileName} в foreground VPN service.",
      context = context
    )
    val intent = ShieldVpnService.startIntent(context.applicationContext, request)
    ContextCompat.startForegroundService(context.applicationContext, intent)
  }

  fun stop(context: Context) {
    if (_status.value.stage == EmbeddedRuntimeStage.IDLE) {
      markIdle("Встроенный туннель уже остановлен.")
      return
    }

    val snapshot = _status.value
    _status.value = snapshot.copy(
      available = initialized.get(),
      stage = EmbeddedRuntimeStage.STOPPING,
      message = "Останавливаем встроенный туннель..."
    )
    RuntimeDiagnostics.record("runtime", "Запрошена остановка встроенного runtime.", context = context)
    runCatching {
      context.applicationContext.startService(ShieldVpnService.stopIntent(context.applicationContext))
    }.onFailure {
      RuntimeDiagnostics.record(
        "runtime",
        it.message ?: "Не удалось доставить stop-команду foreground service.",
        level = "ERROR",
        context = context
      )
      markIdle("Туннель остановлен.")
    }
  }

  internal fun markStarting(request: RuntimeLaunchRequest, message: String) {
    _status.value = EmbeddedRuntimeStatus(
      available = initialized.get(),
      stage = EmbeddedRuntimeStage.STARTING,
      activeNodeId = request.nodeId,
      profileName = request.profileName,
      message = message
    )
  }

  internal fun markRunning(request: RuntimeLaunchRequest, message: String) {
    _status.value = EmbeddedRuntimeStatus(
      available = initialized.get(),
      stage = EmbeddedRuntimeStage.RUNNING,
      activeNodeId = request.nodeId,
      profileName = request.profileName,
      message = message
    )
  }

  internal fun markIdle(message: String) {
    _status.value = EmbeddedRuntimeStatus(
      available = initialized.get(),
      stage = EmbeddedRuntimeStage.IDLE,
      message = message
    )
  }

  internal fun markError(
    message: String,
    request: RuntimeLaunchRequest? = null
  ) {
    _status.value = EmbeddedRuntimeStatus(
      available = initialized.get(),
      stage = EmbeddedRuntimeStage.ERROR,
      activeNodeId = request?.nodeId,
      profileName = request?.profileName,
      message = message
    )
  }
}
