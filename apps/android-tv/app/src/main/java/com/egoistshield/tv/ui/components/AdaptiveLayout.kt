package com.egoistshield.tv.ui.components

import android.content.pm.PackageManager
import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext

enum class AppLayoutMode {
  PHONE,
  TABLET,
  TV;

  val isCompact: Boolean
    get() = this == PHONE

  val usesRailNavigation: Boolean
    get() = this != PHONE

  val clientLabel: String
    get() = when (this) {
      PHONE -> "Android клиент"
      TABLET -> "Адаптивный клиент"
      TV -> "Android TV клиент"
    }
}

@Composable
fun rememberAppLayoutMode(): AppLayoutMode {
  val context = LocalContext.current
  val configuration = LocalConfiguration.current
  val isTv = remember(context, configuration.uiMode) {
    val uiModeType = configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
    uiModeType == Configuration.UI_MODE_TYPE_TELEVISION ||
      context.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)
  }

  return when {
    isTv -> AppLayoutMode.TV
    configuration.smallestScreenWidthDp >= 600 -> AppLayoutMode.TABLET
    else -> AppLayoutMode.PHONE
  }
}
