package com.egoistshield.tv

import android.app.Application
import com.egoistshield.tv.runtime.EmbeddedSingBoxRuntime
import com.egoistshield.tv.runtime.RuntimeDiagnostics

class EgoistShieldTvApplication : Application() {
  override fun onCreate() {
    super.onCreate()
    RuntimeDiagnostics.initialize(this)
    RuntimeDiagnostics.record(
      source = "app",
      message = "Приложение запущено и готовит embedded runtime."
    )
    EmbeddedSingBoxRuntime.initialize(this)
  }
}
