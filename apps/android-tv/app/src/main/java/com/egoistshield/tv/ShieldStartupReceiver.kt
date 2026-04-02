package com.egoistshield.tv

import android.app.Application
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.egoistshield.tv.data.ShieldRepository
import com.egoistshield.tv.runtime.EmbeddedSingBoxRuntime
import com.egoistshield.tv.runtime.RuntimeDiagnostics
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

class ShieldStartupReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    val appContext = context.applicationContext
    val pendingResult = goAsync()
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    scope.launch {
      try {
        RuntimeDiagnostics.record(
          source = "boot",
          message = "Получен системный запуск: ${intent?.action.orEmpty()}",
          context = appContext
        )

        if (intent?.action !in setOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED)) {
          return@launch
        }

        (appContext as? Application)?.let(EmbeddedSingBoxRuntime::initialize)
        val repository = ShieldRepository(appContext)
        val snapshot = repository.state.first()

        if (!snapshot.settings.autoStart) {
          RuntimeDiagnostics.record("boot", "Автозапуск отключён, туннель не поднимаем.")
          return@launch
        }

        if (!snapshot.settings.autoConnect) {
          RuntimeDiagnostics.record("boot", "Автоподключение отключено, фонового запуска не будет.")
          return@launch
        }

        val activeNodeId = snapshot.activeNodeId
        if (activeNodeId.isNullOrBlank()) {
          RuntimeDiagnostics.record("boot", "Нет активного профиля для восстановления после запуска системы.")
          return@launch
        }

        if (repository.prepareVpnPermission() != null) {
          RuntimeDiagnostics.record("boot", "VPN-разрешение ещё не выдано. Ожидаем ручной запуск приложения.", level = "WARN")
          return@launch
        }

        val request = repository.prepareRuntimeLaunch(activeNodeId)
        if (request == null) {
          RuntimeDiagnostics.record("boot", "Не удалось собрать runtime-конфиг для автозапуска.", level = "ERROR")
          return@launch
        }

        RuntimeDiagnostics.record("boot", "Автозапуск восстанавливает профиль ${request.profileName}.")
        repository.startRuntime(request)
      } catch (error: Throwable) {
        RuntimeDiagnostics.record(
          source = "boot",
          message = error.message ?: "Ошибка автозапуска после загрузки устройства.",
          level = "ERROR",
          context = appContext
        )
      } finally {
        pendingResult.finish()
        scope.cancel()
      }
    }
  }
}
