package com.egoistshield.tv.runtime

import com.egoistshield.tv.data.AppSettings
import com.egoistshield.tv.data.RouteMode
import com.egoistshield.tv.data.VpnNode
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.NodeProtocol
import org.junit.Assert.assertTrue
import org.junit.Test

class SingBoxConfigBuilderTest {
  @Test
  fun `builds vless config with custom dns`() {
    val node = VpnNode(
      id = "node-1",
      name = "Tokyo",
      protocol = NodeProtocol.VLESS,
      server = "1.1.1.1",
      port = 443,
      uri = "vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=reality#Tokyo",
      metadata = mapOf(
        "id" to "11111111-1111-1111-1111-111111111111",
        "security" to "reality",
        "sni" to "edge.example.com",
        "pbk" to "public-key",
        "sid" to "short-id"
      )
    )
    val settings = AppSettings(
      dnsMode = DnsMode.CUSTOM,
      systemDnsServers = "94.140.14.14, 94.140.15.15",
      routeMode = RouteMode.GLOBAL
    )

    val config = SingBoxConfigBuilder.build(node, emptyList(), emptyList(), settings)

    assertTrue(config.contains("\"type\": \"vless\""))
    assertTrue(config.contains("\"server\": \"1.1.1.1\""))
    assertTrue(config.contains("\"public_key\": \"public-key\""))
    assertTrue(config.contains("\"server\": \"94.140.14.14\""))
  }

  @Test
  fun `builds shadowsocks config with plugin metadata`() {
    val node = VpnNode(
      id = "node-ss",
      name = "Edge SS",
      protocol = NodeProtocol.SHADOWSOCKS,
      server = "198.51.100.10",
      port = 443,
      uri = "ss://example",
      metadata = mapOf(
        "method" to "aes-256-gcm",
        "password" to "secret",
        "plugin" to "v2ray-plugin",
        "plugin_opts" to "mode=websocket;host=cdn.example.com",
        "udp_over_tcp" to "true"
      )
    )

    val config = SingBoxConfigBuilder.build(node, emptyList(), emptyList(), AppSettings())

    assertTrue(config.contains("\"plugin\": \"v2ray-plugin\""))
    assertTrue(config.contains("\"plugin_opts\": \"mode=websocket;host=cdn.example.com\""))
    assertTrue(config.contains("\"udp_over_tcp\": true"))
  }
}
