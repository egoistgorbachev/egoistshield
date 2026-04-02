package com.egoistshield.tv.runtime

import com.egoistshield.tv.data.AppSettings
import com.egoistshield.tv.data.DomainRule
import com.egoistshield.tv.data.ProcessRule
import com.egoistshield.tv.data.RouteMode
import com.egoistshield.tv.data.RuleMode
import com.egoistshield.tv.data.VpnNode
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.NodeProtocol
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object SingBoxConfigBuilder {
  private val prettyJson = Json {
    prettyPrint = true
    explicitNulls = false
  }

  fun build(
    node: VpnNode,
    domainRules: List<DomainRule>,
    processRules: List<ProcessRule>,
    settings: AppSettings
  ): String {
    val config = buildJsonObject {
      put(
        "log",
        buildJsonObject {
          put("level", "info")
          put("timestamp", true)
        }
      )
      put("dns", buildDns(settings.dnsMode, settings.systemDnsServers))
      put("inbounds", buildInbounds(settings))
      put("outbounds", buildOutbounds(node))
      put("route", buildRoute(domainRules, processRules, settings))
    }

    return prettyJson.encodeToString(JsonObject.serializer(), config)
  }

  private fun buildInbounds(settings: AppSettings): JsonArray {
    return buildJsonArray {
      add(
        buildJsonObject {
          put("type", "mixed")
          put("tag", "mixed-in")
          put("listen", "127.0.0.1")
          put("listen_port", 2080)
        }
      )

      if (settings.useTunMode) {
        add(
          buildJsonObject {
            put("type", "tun")
            put("tag", "tun-in")
            put("interface_name", "egoist-tun")
            put("address", buildJsonArray { add(JsonPrimitive("172.19.0.1/30")) })
            put("auto_route", true)
            put("strict_route", true)
            put("stack", "system")
          }
        )
      }
    }
  }

  private fun buildOutbounds(node: VpnNode): JsonArray {
    val proxyOutbound = buildProxyOutbound(node)
    return buildJsonArray {
      add(
        buildJsonObject {
          proxyOutbound.forEach { (key, value) -> put(key, value) }
          put("tag", "proxy")
          put(
            "domain_resolver",
            buildJsonObject {
              put("server", "bootstrap-dns")
              put("strategy", "prefer_ipv4")
            }
          )
        }
      )
      add(
        buildJsonObject {
          put("type", "direct")
          put("tag", "direct")
        }
      )
    }
  }

  private fun buildRoute(
    domainRules: List<DomainRule>,
    processRules: List<ProcessRule>,
    settings: AppSettings
  ): JsonObject {
    return buildJsonObject {
      put(
        "rules",
        buildJsonArray {
          add(buildJsonObject { put("action", "sniff") })
          add(
            buildJsonObject {
              put("protocol", "dns")
              put("action", "hijack-dns")
            }
          )
          buildRules(domainRules, processRules, settings.useTunMode).forEach(::add)
          add(
            buildJsonObject {
              put("ip_is_private", true)
              put("outbound", "direct")
            }
          )
        }
      )
      put("final", if (settings.routeMode == RouteMode.GLOBAL) "proxy" else "direct")
      put("auto_detect_interface", true)
      put(
        "default_domain_resolver",
        buildJsonObject {
          put("server", "bootstrap-dns")
          put("strategy", "prefer_ipv4")
        }
      )
    }
  }

  private fun buildDns(mode: DnsMode, rawServers: String): JsonObject {
    if (mode == DnsMode.SYSTEM) {
      return buildJsonObject {
        put(
          "servers",
          buildJsonArray {
            add(
              buildJsonObject {
                put("tag", "system-dns")
                put("type", "local")
              }
            )
            add(
              buildJsonObject {
                put("tag", "bootstrap-dns")
                put("type", "udp")
                put("server", "1.1.1.1")
              }
            )
          }
        )
      }
    }

    val dnsServers = if (mode == DnsMode.CUSTOM) {
      runCatching { parseDnsServers(rawServers) }.getOrDefault(listOf("1.1.1.1", "1.0.0.1"))
    } else {
      listOf("1.1.1.1", "1.0.0.1")
    }

    return buildJsonObject {
      put(
        "servers",
        buildJsonArray {
          if (mode == DnsMode.CUSTOM) {
            dnsServers.forEachIndexed { index, server ->
              add(
                buildJsonObject {
                  put("tag", "custom-dns-${index + 1}")
                  put("type", "udp")
                  put("server", server)
                  put("detour", "proxy")
                }
              )
            }
          } else {
            add(
              buildJsonObject {
                put("tag", "proxy-dns")
                put("type", "https")
                put("server", "1.1.1.1")
                put("server_port", 443)
                put("detour", "proxy")
              }
            )
          }

          add(
            buildJsonObject {
              put("tag", "direct-dns")
              put("type", "udp")
              put("server", "8.8.8.8")
            }
          )
          add(
            buildJsonObject {
              put("tag", "bootstrap-dns")
              put("type", "udp")
              put("server", dnsServers.first())
            }
          )
        }
      )
      put("final", if (mode == DnsMode.CUSTOM) "custom-dns-1" else "proxy-dns")
      put("strategy", "prefer_ipv4")
    }
  }

  private fun buildRules(
    domainRules: List<DomainRule>,
    processRules: List<ProcessRule>,
    useTunMode: Boolean
  ): List<JsonObject> {
    val result = mutableListOf<JsonObject>()

    if (useTunMode) {
      processRules.forEach { rule ->
        result += if (rule.mode == RuleMode.BLOCK) {
          buildJsonObject {
            put("process_name", buildJsonArray { add(JsonPrimitive(rule.process)) })
            put("action", "reject")
          }
        } else {
          buildJsonObject {
            put("process_name", buildJsonArray { add(JsonPrimitive(rule.process)) })
            put("outbound", if (rule.mode == RuleMode.VPN) "proxy" else "direct")
          }
        }
      }
    }

    domainRules.forEach { rule ->
      result += if (rule.mode == RuleMode.BLOCK) {
        buildJsonObject {
          put("domain_suffix", buildJsonArray { add(JsonPrimitive(rule.domain)) })
          put("action", "reject")
        }
      } else {
        buildJsonObject {
          put("domain_suffix", buildJsonArray { add(JsonPrimitive(rule.domain)) })
          put("outbound", if (rule.mode == RuleMode.VPN) "proxy" else "direct")
        }
      }
    }

    return result
  }

  private fun buildProxyOutbound(node: VpnNode): JsonObject {
    val metadata = node.metadata
    return when (node.protocol) {
      NodeProtocol.VLESS -> buildJsonObject {
        put("type", "vless")
        put("server", node.server)
        put("server_port", node.port)
        put("uuid", metadata["id"].orEmpty())
        metadata["flow"]?.takeIf { it.isNotBlank() }?.let { put("flow", it) }
        buildTls(metadata, node.server)?.let { put("tls", it) }
        buildTransport(metadata, false)?.let { put("transport", it) }
      }

      NodeProtocol.VMESS -> buildJsonObject {
        put("type", "vmess")
        put("server", node.server)
        put("server_port", node.port)
        put("uuid", metadata["id"].orEmpty())
        put("alter_id", metadata["aid"]?.toIntOrNull() ?: 0)
        put("security", metadata["scy"] ?: "auto")
        if (metadata["tls"] == "tls") {
          put(
            "tls",
            buildJsonObject {
              put("enabled", true)
              put("server_name", metadata["sni"] ?: node.server)
              put("insecure", parseBool(metadata["insecure"]))
            }
          )
        }
        buildTransport(metadata, true)?.let { put("transport", it) }
      }

      NodeProtocol.TROJAN -> buildJsonObject {
        put("type", "trojan")
        put("server", node.server)
        put("server_port", node.port)
        put("password", metadata["password"].orEmpty())
        put(
          "tls",
          buildJsonObject {
            put("enabled", true)
            put("server_name", metadata["sni"] ?: node.server)
            put("insecure", parseBool(metadata["insecure"]))
          }
        )
        buildTransport(metadata, false)?.let { put("transport", it) }
      }

      NodeProtocol.SHADOWSOCKS -> buildJsonObject {
        put("type", "shadowsocks")
        put("server", node.server)
        put("server_port", node.port)
        put("method", metadata["method"] ?: "aes-128-gcm")
        put("password", metadata["password"].orEmpty())
        metadata["plugin"]?.takeIf { it.isNotBlank() }?.let { put("plugin", it) }
        metadata["plugin_opts"]?.takeIf { it.isNotBlank() }?.let { put("plugin_opts", it) }
        metadata["network"]?.takeIf { it.isNotBlank() }?.let { put("network", it) }
        if (parseBool(metadata["udp_over_tcp"])) {
          put("udp_over_tcp", true)
        }
      }

      NodeProtocol.SOCKS -> buildJsonObject {
        put("type", "socks")
        put("server", node.server)
        put("server_port", node.port)
        metadata["username"]?.takeIf { it.isNotBlank() }?.let { put("username", it) }
        metadata["password"]?.takeIf { it.isNotBlank() }?.let { put("password", it) }
      }

      NodeProtocol.HTTP -> buildJsonObject {
        put("type", "http")
        put("server", node.server)
        put("server_port", node.port)
        metadata["username"]?.takeIf { it.isNotBlank() }?.let { put("username", it) }
        metadata["password"]?.takeIf { it.isNotBlank() }?.let { put("password", it) }
        metadata["path"]?.takeIf { it.isNotBlank() }?.let { put("path", it) }
        metadata["host"]?.takeIf { it.isNotBlank() }?.let { host ->
          put(
            "headers",
            buildJsonObject {
              put("Host", host)
            }
          )
        }
        if (parseBool(metadata["tls"])) {
          put(
            "tls",
            buildJsonObject {
              put("enabled", true)
              put("server_name", metadata["sni"] ?: node.server)
              put("insecure", parseBool(metadata["insecure"]))
            }
          )
        }
      }

      NodeProtocol.HYSTERIA2 -> buildJsonObject {
        put("type", "hysteria2")
        put("server", node.server)
        put("server_port", node.port)
        put("password", metadata["password"].orEmpty())
        put("up_mbps", metadata["up_mbps"]?.toIntOrNull() ?: metadata["upmbps"]?.toIntOrNull() ?: 100)
        put("down_mbps", metadata["down_mbps"]?.toIntOrNull() ?: metadata["downmbps"]?.toIntOrNull() ?: 100)
        put("hop_interval", metadata["hop_interval"] ?: "30s")
        put("network", metadata["network"] ?: "udp")
        put(
          "tls",
          buildJsonObject {
            put("enabled", true)
            put("server_name", metadata["sni"] ?: node.server)
            put("insecure", parseBool(metadata["insecure"]))
          }
        )
        metadata["obfs"]?.takeIf { it.isNotBlank() }?.let { obfsType ->
          put(
            "obfs",
            buildJsonObject {
              put("type", obfsType)
              put("password", metadata["obfs_password"] ?: metadata["obfs-password"].orEmpty())
            }
          )
        }
      }

      NodeProtocol.TUIC -> buildJsonObject {
        put("type", "tuic")
        put("server", node.server)
        put("server_port", node.port)
        put("uuid", metadata["uuid"].orEmpty())
        put("password", metadata["password"].orEmpty())
        put("congestion_control", metadata["congestion_control"] ?: "bbr")
        put("udp_relay_mode", metadata["udp_relay_mode"] ?: "native")
        put("zero_rtt_handshake", parseBool(metadata["zero_rtt_handshake"]))
        put("heartbeat", metadata["heartbeat"] ?: "10s")
        put("network", metadata["network"] ?: "udp")
        put(
          "tls",
          buildJsonObject {
            put("enabled", true)
            put("server_name", metadata["sni"] ?: node.server)
            put("insecure", parseBool(metadata["insecure"]))
            metadata["alpn"]
              ?.split(',')
              ?.map(String::trim)
              ?.filter(String::isNotEmpty)
              ?.takeIf { it.isNotEmpty() }
              ?.let { values ->
                put("alpn", buildJsonArray { values.forEach { add(JsonPrimitive(it)) } })
              }
          }
        )
      }

      NodeProtocol.WIREGUARD -> buildJsonObject {
        put("type", "wireguard")
        put("server", node.server)
        put("server_port", node.port)
        put("private_key", metadata["private_key"] ?: metadata["privateKey"].orEmpty())
        put("peer_public_key", metadata["peer_public_key"] ?: metadata["public_key"] ?: metadata["publicKey"].orEmpty())
        metadata["pre_shared_key"]?.takeIf { it.isNotBlank() }?.let { put("pre_shared_key", it) }
        val localAddress = (metadata["local_address"] ?: metadata["address"] ?: "10.7.0.2/32")
          .split(',')
          .map(String::trim)
          .filter(String::isNotEmpty)
        put("local_address", buildJsonArray { localAddress.forEach { add(JsonPrimitive(it)) } })
        put("mtu", metadata["mtu"]?.toIntOrNull() ?: 1408)
        put("network", metadata["network"] ?: "udp")
      }
    }
  }

  private fun buildTls(metadata: Map<String, String>, server: String): JsonObject? {
    val alpnValues = metadata["alpn"]
      ?.split(',')
      ?.map(String::trim)
      ?.filter(String::isNotEmpty)
      ?: listOf("h2", "http/1.1")

    return when (metadata["security"]) {
      "reality" -> buildJsonObject {
        put("enabled", true)
        put("server_name", metadata["sni"] ?: server)
        put("alpn", buildJsonArray { alpnValues.forEach { add(JsonPrimitive(it)) } })
        put(
          "utls",
          buildJsonObject {
            put("enabled", true)
            put("fingerprint", metadata["fp"] ?: "chrome")
          }
        )
        put(
          "reality",
          buildJsonObject {
            put("enabled", true)
            put("public_key", metadata["pbk"].orEmpty())
            put("short_id", metadata["sid"].orEmpty())
          }
        )
      }

      "tls" -> buildJsonObject {
        put("enabled", true)
        put("server_name", metadata["sni"] ?: server)
        put("alpn", buildJsonArray { alpnValues.forEach { add(JsonPrimitive(it)) } })
        put("insecure", parseBool(metadata["insecure"]))
        put(
          "utls",
          buildJsonObject {
            put("enabled", true)
            put("fingerprint", metadata["fp"] ?: "chrome")
          }
        )
      }

      else -> null
    }
  }

  private fun buildTransport(metadata: Map<String, String>, isVmess: Boolean): JsonObject? {
    val network = if (isVmess) metadata["net"] ?: "tcp" else metadata["type"] ?: "tcp"
    return when (network) {
      "ws" -> buildJsonObject {
        put("type", "ws")
        put("path", metadata["path"] ?: "/")
        metadata["host"]?.takeIf { it.isNotBlank() }?.let { host ->
          put(
            "headers",
            buildJsonObject {
              put("Host", host)
            }
          )
        }
      }

      "grpc" -> buildJsonObject {
        put("type", "grpc")
        put("service_name", metadata["serviceName"].orEmpty())
      }

      "h2", "http" -> buildJsonObject {
        put("type", "http")
        metadata["host"]?.takeIf { it.isNotBlank() }?.let { host ->
          put("host", buildJsonArray { add(JsonPrimitive(host)) })
        }
        put("path", metadata["path"] ?: "/")
      }

      "httpupgrade" -> buildJsonObject {
        put("type", "httpupgrade")
        metadata["host"]?.takeIf { it.isNotBlank() }?.let { put("host", it) }
        put("path", metadata["path"] ?: "/")
      }

      else -> null
    }
  }

  private fun parseBool(value: String?): Boolean {
    return value?.lowercase() in setOf("1", "true", "yes", "on")
  }
}
