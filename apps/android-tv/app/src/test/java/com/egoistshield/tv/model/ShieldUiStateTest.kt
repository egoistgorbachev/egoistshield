package com.egoistshield.tv.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShieldUiStateTest {
  @Test
  fun `readiness score reflects runtime, tun and startup flags`() {
    val state = ShieldUiState(
      nodes = listOf(
        ShieldNode(
          id = "node-1",
          name = "Primary",
          protocol = NodeProtocol.VLESS,
          server = "example.com",
          port = 443,
          sourceLabel = "Manual",
          securityLabel = "Reality",
          routeHint = "TCP",
          premium = false,
          recommended = true,
          favorite = false
        )
      ),
      runtimeReady = true,
      settings = SettingsState(
        autoStart = true,
        useTunMode = true
      )
    )

    assertEquals(100, state.readinessScore)
    assertEquals("Пиковая готовность", state.readinessLabel)
  }

  @Test
  fun `busy flag tracks transitional connection states`() {
    assertTrue(ShieldUiState(connectionStatus = ConnectionStatus.CONNECTING).isBusy)
    assertTrue(ShieldUiState(connectionStatus = ConnectionStatus.DISCONNECTING).isBusy)
    assertFalse(ShieldUiState(connectionStatus = ConnectionStatus.CONNECTED).isBusy)
  }

  @Test
  fun `profile prepared requires connected state and active node`() {
    val connected = ShieldUiState(
      connectionStatus = ConnectionStatus.CONNECTED,
      connectedNodeId = "node-1"
    )
    val disconnected = ShieldUiState(connectionStatus = ConnectionStatus.DISCONNECTED)

    assertTrue(connected.profilePrepared)
    assertFalse(disconnected.profilePrepared)
  }
}
