package com.egoistshield.tv.runtime

import com.egoistshield.tv.model.NodeProtocol
import java.util.Base64
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NodeParserTest {
  @Test
  fun `parses vless uri`() {
    val payload = "vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=reality&type=tcp#Tokyo"
    val result = parseNodesFromText(payload)

    assertEquals(1, result.nodes.size)
    assertEquals(NodeProtocol.VLESS, result.nodes.first().protocol)
    assertEquals("1.1.1.1", result.nodes.first().server)
    assertEquals("11111111-1111-1111-1111-111111111111", result.nodes.first().metadata["id"])
  }

  @Test
  fun `extracts subscription urls from mixed payload and deep links`() {
    val payload = """
      https://sub.example.com/api/v1/client/subscribe?token=abc
      clash://install-config?url=https%3A%2F%2Fedge.example.com%2Fclash.yaml
      hiddify://install-config?config=https%253A%252F%252Fdouble.example.com%252Fsub%253Ftoken%253Dxyz
      http://user:pass@proxy.example.com:8080
    """.trimIndent()

    val urls = extractSubscriptionUrls(payload)

    assertEquals(
      listOf(
        "https://sub.example.com/api/v1/client/subscribe?token=abc",
        "https://edge.example.com/clash.yaml",
        "https://double.example.com/sub?token=xyz"
      ),
      urls
    )
  }

  @Test
  fun `parses shadowsocks sip002 uri with plugin`() {
    val payload = "ss://YWVzLTI1Ni1nY206c2VjcmV0@198.51.100.10:443/?plugin=v2ray-plugin%3Bmode%3Dwebsocket%3Bhost%3Dcdn.example.com%3Bpath%3D%252Fws#Edge%20SS"
    val result = parseNodesFromText(payload)

    assertEquals(1, result.nodes.size)
    val node = result.nodes.first()
    assertEquals(NodeProtocol.SHADOWSOCKS, node.protocol)
    assertEquals("198.51.100.10", node.server)
    assertEquals(443, node.port)
    assertEquals("aes-256-gcm", node.metadata["method"])
    assertEquals("secret", node.metadata["password"])
    assertEquals("v2ray-plugin", node.metadata["plugin"])
    assertTrue(node.metadata["plugin_opts"].orEmpty().contains("mode=websocket"))
  }

  @Test
  fun `parses clash yaml subscription`() {
    val payload = """
      proxies:
        - name: "Tokyo VLESS"
          type: vless
          server: vless.example.com
          port: 443
          uuid: 11111111-1111-1111-1111-111111111111
          tls: true
          servername: edge.example.com
          network: ws
          ws-opts:
            path: /ws
            headers:
              Host: cdn.example.com
        - name: "Hy2 Prime"
          type: hysteria2
          server: hy2.example.com
          port: 8443
          password: hy2-secret
          sni: hy2.example.com
          up: 50 Mbps
          down: 200 Mbps
    """.trimIndent()

    val result = parseNodesFromText(payload)

    assertEquals(2, result.nodes.size)
    val vless = result.nodes.first { it.protocol == NodeProtocol.VLESS }
    assertEquals("11111111-1111-1111-1111-111111111111", vless.metadata["id"])
    assertEquals("ws", vless.metadata["type"])
    assertEquals("/ws", vless.metadata["path"])
    assertEquals("cdn.example.com", vless.metadata["host"])

    val hy2 = result.nodes.first { it.protocol == NodeProtocol.HYSTERIA2 }
    assertEquals("hy2-secret", hy2.metadata["password"])
    assertEquals("50", hy2.metadata["up_mbps"])
    assertEquals("200", hy2.metadata["down_mbps"])
  }

  @Test
  fun `parses sing box json config`() {
    val payload = """
      {
        "outbounds": [
          {
            "type": "vless",
            "tag": "sg-vless",
            "server": "sg.example.com",
            "server_port": 443,
            "uuid": "22222222-2222-2222-2222-222222222222",
            "flow": "xtls-rprx-vision",
            "tls": {
              "server_name": "cdn.example.com",
              "reality": {
                "public_key": "pub-key",
                "short_id": "abcd"
              }
            },
            "transport": {
              "type": "grpc",
              "service_name": "proxy-grpc"
            }
          },
          {
            "type": "shadowsocks",
            "tag": "edge-ss",
            "server": "ss.example.com",
            "server_port": 443,
            "method": "2022-blake3-aes-128-gcm",
            "password": "ss-pass",
            "plugin": "v2ray-plugin",
            "plugin_opts": "mode=websocket;host=cdn.example.com"
          }
        ]
      }
    """.trimIndent()

    val result = parseNodesFromText(payload)

    assertEquals(2, result.nodes.size)
    val vless = result.nodes.first { it.protocol == NodeProtocol.VLESS }
    assertEquals("sg.example.com", vless.server)
    assertEquals("reality", vless.metadata["security"])
    assertEquals("pub-key", vless.metadata["pbk"])
    assertEquals("proxy-grpc", vless.metadata["serviceName"])

    val ss = result.nodes.first { it.protocol == NodeProtocol.SHADOWSOCKS }
    assertEquals("2022-blake3-aes-128-gcm", ss.metadata["method"])
    assertEquals("v2ray-plugin", ss.metadata["plugin"])
  }

  @Test
  fun `reports empty clash config when proxies list is empty`() {
    val payload = """
      proxy-groups:
        - name: "VPN"
          type: select
          proxies: []
      proxies: []
    """.trimIndent()

    val result = parseNodesFromText(payload)

    assertTrue(result.nodes.isEmpty())
    assertTrue(result.issues.any { it.contains("список proxies пуст", ignoreCase = true) })
  }

  @Test
  fun `parses full base64 subscription payload`() {
    val lines = """
      vless://11111111-1111-1111-1111-111111111111@1.1.1.1:443?security=tls#One
      trojan://secret@2.2.2.2:443#Two
    """.trimIndent()
    val encoded = Base64.getEncoder().encodeToString(lines.toByteArray())
    val result = parseNodesFromText(encoded)

    assertEquals(2, result.nodes.size)
    assertTrue(result.nodes.any { it.protocol == NodeProtocol.VLESS })
    assertTrue(result.nodes.any { it.protocol == NodeProtocol.TROJAN })
  }
}
