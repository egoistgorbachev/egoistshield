package com.egoistshield.tv.ui

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.Crossfade
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.egoistshield.tv.model.AppDestination
import com.egoistshield.tv.model.ShieldUiState
import com.egoistshield.tv.ui.components.AppBackdrop
import com.egoistshield.tv.ui.components.AppBottomNavigation
import com.egoistshield.tv.ui.components.AppCompactHeader
import com.egoistshield.tv.ui.components.AppLayoutMode
import com.egoistshield.tv.ui.components.AppNavigationRail
import com.egoistshield.tv.ui.components.rememberAppLayoutMode
import com.egoistshield.tv.ui.screens.DashboardScreen
import com.egoistshield.tv.ui.screens.DnsScreen
import com.egoistshield.tv.ui.screens.ServersScreen
import com.egoistshield.tv.ui.screens.SettingsScreen

@Composable
fun EgoistShieldTvApp(viewModel: ShieldViewModel = viewModel()) {
  val state by viewModel.uiState.collectAsStateWithLifecycle()
  val layoutMode = rememberAppLayoutMode()
  val vpnPermissionLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.StartActivityForResult()
  ) { result ->
    viewModel.onVpnPermissionResult(result.resultCode == Activity.RESULT_OK)
  }

  LaunchedEffect(viewModel) {
    viewModel.events.collect { event ->
      when (event) {
        is ShieldUiEvent.RequestVpnPermission -> vpnPermissionLauncher.launch(event.intent)
      }
    }
  }

  Surface(
    modifier = Modifier.fillMaxSize(),
    color = Color.Transparent,
    contentColor = MaterialTheme.colorScheme.onBackground
  ) {
    Box(modifier = Modifier.fillMaxSize()) {
      AppBackdrop()

      if (layoutMode.usesRailNavigation) {
        Row(
          modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .padding(28.dp),
          horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
          AppNavigationRail(
            current = state.destination,
            onSelect = viewModel::selectDestination,
            subtitle = layoutMode.clientLabel
          )

          ScreenHost(
            modifier = Modifier.fillMaxSize(),
            state = state,
            layoutMode = layoutMode,
            viewModel = viewModel
          )
        }
      } else {
        Scaffold(
          modifier = Modifier.fillMaxSize(),
          containerColor = Color.Transparent,
          contentColor = MaterialTheme.colorScheme.onBackground,
          topBar = {
            Column(
              modifier = Modifier
                .statusBarsPadding()
                .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
              AppCompactHeader(subtitle = layoutMode.clientLabel)
            }
          },
          bottomBar = {
            Column(modifier = Modifier.navigationBarsPadding()) {
              AppBottomNavigation(
                current = state.destination,
                onSelect = viewModel::selectDestination
              )
            }
          }
        ) { innerPadding ->
          ScreenHost(
            modifier = Modifier
              .fillMaxSize()
              .padding(innerPadding)
              .padding(horizontal = 14.dp)
              .imePadding(),
            state = state,
            layoutMode = layoutMode,
            viewModel = viewModel
          )
        }
      }
    }
  }
}

@Composable
private fun ScreenHost(
  modifier: Modifier,
  state: ShieldUiState,
  layoutMode: AppLayoutMode,
  viewModel: ShieldViewModel
) {
  Box(modifier = modifier) {
    Crossfade(targetState = state.destination, label = "egoistshield-screen") { destination ->
      when (destination) {
        AppDestination.DASHBOARD -> DashboardScreen(
          state = state,
          isCompact = layoutMode.isCompact,
          onSmartConnect = viewModel::smartConnect,
          onDisconnect = viewModel::disconnect,
          onOpenServers = { viewModel.selectDestination(AppDestination.SERVERS) },
          onOpenSettings = { viewModel.selectDestination(AppDestination.SETTINGS) },
          onLaunchRuntime = viewModel::launchSelectedProfile
        )

        AppDestination.SERVERS -> ServersScreen(
          state = state,
          isCompact = layoutMode.isCompact,
          onSelectNode = viewModel::selectNode,
          onConnectNode = viewModel::connectManually,
          onSmartConnect = viewModel::smartConnect,
          onDisconnect = viewModel::disconnect,
          onToggleFavorite = viewModel::toggleFavorite,
          onFilterChange = viewModel::setServerFilter,
          onSearchQueryChange = viewModel::updateNodeSearchQuery,
          onImportPayload = viewModel::importPayload,
          onRefreshSubscriptions = viewModel::refreshSubscriptions,
          onLaunchRuntime = viewModel::launchSelectedProfile
        )

        AppDestination.DNS -> DnsScreen(
          state = state,
          isCompact = layoutMode.isCompact,
          onSelectDnsMode = viewModel::setDnsMode,
          onCustomDnsChange = viewModel::updateCustomDns,
          onApplyCustomDns = viewModel::applyCustomDns
        )

        AppDestination.SETTINGS -> SettingsScreen(
          state = state,
          isCompact = layoutMode.isCompact,
          onToggleSetting = viewModel::toggleSetting
        )
      }
    }
  }
}
