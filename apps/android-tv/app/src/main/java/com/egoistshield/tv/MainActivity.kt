package com.egoistshield.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import com.egoistshield.tv.ui.EgoistShieldTvApp
import com.egoistshield.tv.ui.theme.EgoistShieldTvTheme

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    WindowCompat.setDecorFitsSystemWindows(window, false)

    setContent {
      EgoistShieldTvTheme {
        EgoistShieldTvApp()
      }
    }
  }
}

