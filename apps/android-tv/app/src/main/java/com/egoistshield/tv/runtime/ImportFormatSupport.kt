package com.egoistshield.tv.runtime

import com.egoistshield.tv.data.VpnNode
import com.egoistshield.tv.model.NodeProtocol
import java.net.URI
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import org.yaml.snakeyaml.Yaml

internal data class StructuredImportParseResult(
  val recognized: Boolean,
  val nodes: List<VpnNode>,
  val issues: List<String>
)

private val deepLinkPattern = Regex("[a-z][a-z0-9+.-]*://[^\\s<>\"'`]+", RegexOption.IGNORE_CASE)
private val httpUrlPattern = Regex("https?://[^\\s<>\"'`]+", RegexOption.IGNORE_CASE)
private val yamlProxyMarker = Regex("(?m)^\\s*proxies\\s*:")
private val nestedSubscriptionParamNames = setOf(
  "url",
  "subscription",
  "subscription_url",
  "subscribe",
  "config",
  "config_url",
  "profile",
  "profile_url",
  "target",
  "remote",
  "remote_url",
  "link",
  "uri"
)
private val ignoredStructuredTypes = setOf(
  "direct",
  "block",
  "selector",
  "urltest",
  "dns",
  "fallback",
  "load-balance",
  "relay",
  "reject",
  "pass",
  "compatibility"
)

internal fun extractSubscriptionUrlsFromPayload(payload: String): List<String> {
  val results = linkedSetOf<String>()
  val normalizedPayload = payload.replace("&amp;", "&")

  httpUrlPattern.findAll(normalizedPayload)
    .map { sanitizeImportUrlCandidate(it.value) }
    .filter(::isSubscriptionHttpUrl)
    .forEach(results::add)

  deepLinkPattern.findAll(normalizedPayload)
    .flatMap { expandPotentialSubscriptionUrls(it.value).asSequence() }
    .filter(::isSubscriptionHttpUrl)
    .forEach(results::add)

  return results.toList()
}

internal fun parseStructuredImportPayload(payload: String): StructuredImportParseResult {
  val jsonResult = parseSingBoxJsonPayload(payload)
  if (jsonResult.recognized) {
    return jsonResult
  }

  val yamlResult = parseClashYamlPayload(payload)
  if (yamlResult.recognized) {
    return yamlResult
  }

  return StructuredImportParseResult(false, emptyList(), emptyList())
}

private fun expandPotentialSubscriptionUrls(raw: String): Set<String> {
  val results = linkedSetOf<String>()
  val queue = ArrayDeque<String>()
  queue += raw
  var depth = 0

  while (queue.isNotEmpty() && depth < 8) {
    val current = sanitizeImportUrlCandidate(queue.removeFirst())
    if (current.isBlank() || current in results) {
      depth++
      continue
    }
    results += current

    httpUrlPattern.findAll(current)
      .map { sanitizeImportUrlCandidate(it.value) }
      .forEach(results::add)

    val query = current.substringAfter('?', "")
    if (query.isNotBlank()) {
      parseImportQuery(query).forEach { (key, value) ->
        if (key.lowercase() !in nestedSubscriptionParamNames) {
          return@forEach
        }
        val candidate = sanitizeImportUrlCandidate(value)
        if (candidate.isNotBlank()) {
          queue += candidate
        }
      }
    }

    val urlDecoded = runCatching { decode(current) }.getOrNull()
    if (!urlDecoded.isNullOrBlank() && urlDecoded != current) {
      queue += urlDecoded
    }

    if (isLikelyBase64Block(current)) {
      val base64Decoded = runCatching { decodeBase64Safe(current) }.getOrNull()
      if (!base64Decoded.isNullOrBlank()) {
        queue += base64Decoded
      }
    }

    depth++
  }

  return results.filter(::isSubscriptionHttpUrl).toCollection(linkedSetOf())
}

private fun parseSingBoxJsonPayload(payload: String): StructuredImportParseResult {
  val trimmed = payload.trim()
  if (!trimmed.startsWith("{") || !trimmed.contains("\"outbounds\"")) {
    return StructuredImportParseResult(false, emptyList(), emptyList())
  }

  return try {
    val root = Json.parseToJsonElement(trimmed).jsonObject
    val outbounds = root["outbounds"] as? JsonArray
      ?: return StructuredImportParseResult(true, emptyList(), listOf("В sing-box конфиге отсутствует массив outbounds."))

    val nodes = mutableListOf<VpnNode>()
    val issues = mutableListOf<String>()
    outbounds.forEach { element ->
      val outbound = element as? JsonObject ?: return@forEach
      when (val parsed = parseSingBoxOutbound(outbound)) {
        is ParsedImportNode -> nodes += parsed.node
        is ParsedImportIssue -> parsed.issue?.let(issues::add)
      }
    }

    if (nodes.isEmpty() && issues.isEmpty()) {
      issues += "В sing-box конфиге не найдено поддерживаемых outbound-профилей."
    }

    StructuredImportParseResult(true, nodes, issues)
  } catch (_: Throwable) {
    StructuredImportParseResult(true, emptyList(), listOf("Не удалось разобрать sing-box JSON-подписку."))
  }
}

private sealed interface ParsedImportResult
private data class ParsedImportNode(val node: VpnNode) : ParsedImportResult
private data class ParsedImportIssue(val issue: String?) : ParsedImportResult

private fun parseSingBoxOutbound(outbound: JsonObject): ParsedImportResult {
  val type = outbound.string("type")?.lowercase() ?: return ParsedImportIssue("В sing-box outbound отсутствует поле type.")
  if (type in ignoredStructuredTypes) {
    return ParsedImportIssue(null)
  }

  val name = outbound.string("tag").orEmpty()
  return when (type) {
    "vless" -> buildSingBoxNode(outbound, NodeProtocol.VLESS, type, name) { metadata, server ->
      metadata["id"] = string("uuid") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box VLESS outbound пропущен: отсутствует uuid.")
      string("flow")?.let { metadata["flow"] = it }
      string("packet_encoding")?.let { metadata["packet_encoding"] = it }
      copyTlsMetadataFromJson(metadata, objectValue("tls"), server, securityKey = "security")
      copyTransportMetadataFromJson(metadata, objectValue("transport"), networkKey = "type")
      null
    }

    "vmess" -> buildSingBoxNode(outbound, NodeProtocol.VMESS, type, name) { metadata, server ->
      metadata["id"] = string("uuid") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box VMess outbound пропущен: отсутствует uuid.")
      string("alter_id")?.let { metadata["aid"] = it }
      string("security")?.let { metadata["scy"] = it }
      string("packet_encoding")?.let { metadata["packet_encoding"] = it }
      if (objectValue("tls") != null) {
        metadata["tls"] = "tls"
        copyTlsMetadataFromJson(metadata, objectValue("tls"), server)
      }
      copyTransportMetadataFromJson(metadata, objectValue("transport"), networkKey = "net")
      null
    }

    "trojan" -> buildSingBoxNode(outbound, NodeProtocol.TROJAN, type, name) { metadata, server ->
      metadata["password"] = string("password") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box Trojan outbound пропущен: отсутствует password.")
      copyTlsMetadataFromJson(metadata, objectValue("tls"), server)
      copyTransportMetadataFromJson(metadata, objectValue("transport"), networkKey = "type")
      null
    }

    "shadowsocks" -> buildSingBoxNode(outbound, NodeProtocol.SHADOWSOCKS, type, name) { metadata, _ ->
      metadata["method"] = string("method") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box Shadowsocks outbound пропущен: отсутствует method.")
      metadata["password"] = string("password") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box Shadowsocks outbound пропущен: отсутствует password.")
      string("plugin")?.let { metadata["plugin"] = it }
      string("plugin_opts")?.let { metadata["plugin_opts"] = it }
      string("network")?.let { metadata["network"] = it }
      boolString("udp_over_tcp")?.let { metadata["udp_over_tcp"] = it }
      null
    }

    "socks" -> buildSingBoxNode(outbound, NodeProtocol.SOCKS, type, name) { metadata, _ ->
      string("username")?.let { metadata["username"] = it }
      string("password")?.let { metadata["password"] = it }
      null
    }

    "http" -> buildSingBoxNode(outbound, NodeProtocol.HTTP, type, name) { metadata, server ->
      string("username")?.let { metadata["username"] = it }
      string("password")?.let { metadata["password"] = it }
      string("path")?.takeIf { it.isNotBlank() }?.let { metadata["path"] = it }
      objectValue("headers")?.string("Host", "host")?.let { metadata["host"] = it }
      if (objectValue("tls") != null) {
        metadata["tls"] = "true"
        copyTlsMetadataFromJson(metadata, objectValue("tls"), server)
      }
      null
    }

    "hysteria2" -> buildSingBoxNode(outbound, NodeProtocol.HYSTERIA2, type, name) { metadata, server ->
      metadata["password"] = string("password") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box Hysteria2 outbound пропущен: отсутствует password.")
      string("up_mbps")?.let { metadata["up_mbps"] = it }
      string("down_mbps")?.let { metadata["down_mbps"] = it }
      string("hop_interval")?.let { metadata["hop_interval"] = it }
      string("network")?.let { metadata["network"] = it }
      copyTlsMetadataFromJson(metadata, objectValue("tls"), server)
      objectValue("obfs")?.let { obfs ->
        obfs.string("type")?.let { metadata["obfs"] = it }
        obfs.string("password")?.let { metadata["obfs_password"] = it }
      }
      null
    }

    "tuic" -> buildSingBoxNode(outbound, NodeProtocol.TUIC, type, name) { metadata, server ->
      val uuid = string("uuid")
      val password = string("password")
      if (uuid.isNullOrBlank() || password.isNullOrBlank()) {
        return@buildSingBoxNode ParsedImportIssue("Sing-box TUIC outbound пропущен: поддерживается только конфигурация с uuid/password.")
      }
      metadata["uuid"] = uuid
      metadata["password"] = password
      string("congestion_control")?.let { metadata["congestion_control"] = it }
      string("udp_relay_mode")?.let { metadata["udp_relay_mode"] = it }
      boolString("zero_rtt_handshake")?.let { metadata["zero_rtt_handshake"] = it }
      string("heartbeat")?.let { metadata["heartbeat"] = it }
      string("network")?.let { metadata["network"] = it }
      copyTlsMetadataFromJson(metadata, objectValue("tls"), server)
      null
    }

    "wireguard" -> buildSingBoxNode(outbound, NodeProtocol.WIREGUARD, type, name, defaultPort = 51820) { metadata, _ ->
      metadata["private_key"] = string("private_key") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box WireGuard outbound пропущен: отсутствует private_key.")
      metadata["peer_public_key"] = string("peer_public_key") ?: return@buildSingBoxNode ParsedImportIssue("Sing-box WireGuard outbound пропущен: отсутствует peer_public_key.")
      string("pre_shared_key")?.let { metadata["pre_shared_key"] = it }
      val localAddresses = stringList("local_address")
      if (localAddresses.isNotEmpty()) {
        metadata["local_address"] = localAddresses.joinToString(", ")
      }
      string("mtu")?.let { metadata["mtu"] = it }
      string("network")?.let { metadata["network"] = it }
      null
    }

    else -> ParsedImportIssue("Sing-box outbound типа `$type` пока не поддерживается.")
  }
}

private inline fun buildSingBoxNode(
  outbound: JsonObject,
  protocol: NodeProtocol,
  type: String,
  name: String,
  defaultPort: Int = 443,
  configure: JsonObject.(metadata: MutableMap<String, String>, server: String) -> ParsedImportIssue?
): ParsedImportResult {
  val server = outbound.string("server") ?: return ParsedImportIssue("Sing-box ${protocol.name} outbound пропущен: отсутствует server.")
  val port = outbound.int("server_port") ?: defaultPort
  val metadata = mutableMapOf<String, String>()
  val issue = outbound.configure(metadata, server)
  if (issue != null) {
    return issue
  }
  return ParsedImportNode(
    buildImportedNode(
      protocol = protocol,
      source = "sing-box",
      type = type,
      name = name,
      server = server,
      port = port,
      metadata = metadata
    )
  )
}

private fun parseClashYamlPayload(payload: String): StructuredImportParseResult {
  if (!yamlProxyMarker.containsMatchIn(payload)) {
    return StructuredImportParseResult(false, emptyList(), emptyList())
  }

  return try {
    val root = Yaml().load<Any?>(payload) as? Map<*, *>
      ?: return StructuredImportParseResult(true, emptyList(), listOf("Clash/Mihomo YAML распознан, но корневая структура не содержит map-объект."))
    val proxies = root["proxies"] as? List<*>
      ?: return StructuredImportParseResult(true, emptyList(), listOf("Clash/Mihomo YAML распознан, но список proxies не найден."))
    val rootMap = root.entries.associate { (key, value) -> key.toString() to value }

    val nodes = mutableListOf<VpnNode>()
    val issues = mutableListOf<String>()
    proxies.forEach { item ->
      val proxy = item.toStringKeyMap() ?: return@forEach
      when (val parsed = parseClashProxy(proxy)) {
        is ParsedImportNode -> nodes += parsed.node
        is ParsedImportIssue -> parsed.issue?.let(issues::add)
      }
    }

    if (nodes.isEmpty()) {
      if (proxies.isEmpty()) {
        val groupsCount = (rootMap["proxy-groups"] as? List<*>)?.size ?: 0
        if (groupsCount > 0) {
          issues += "Сервер вернул Clash/Mihomo конфиг без узлов: список proxies пуст, есть только proxy-groups."
        } else {
          issues += "Сервер вернул Clash/Mihomo конфиг с пустым списком proxies."
        }
      } else if (issues.isEmpty()) {
        issues += "В Clash/Mihomo подписке не найдено поддерживаемых proxy-профилей."
      }
    }

    StructuredImportParseResult(true, nodes, issues)
  } catch (_: Throwable) {
    StructuredImportParseResult(true, emptyList(), listOf("Не удалось разобрать Clash/Mihomo YAML-подписку."))
  }
}

private fun parseClashProxy(proxy: Map<String, Any?>): ParsedImportResult {
  val type = proxy.string("type")?.lowercase() ?: return ParsedImportIssue("Прокси в Clash/Mihomo YAML пропущен: отсутствует type.")
  if (type in ignoredStructuredTypes) {
    return ParsedImportIssue(null)
  }

  val name = proxy.string("name").orEmpty()
  return when (type) {
    "vless" -> buildClashNode(proxy, NodeProtocol.VLESS, type, name) { metadata, server ->
      metadata["id"] = string("uuid") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo VLESS proxy пропущен: отсутствует uuid.")
      string("flow")?.let { metadata["flow"] = it }
      string("packet-encoding", "packet_encoding")?.let { metadata["packet_encoding"] = it }
      val reality = map("reality-opts", "reality_opts")
      if (reality != null) {
        metadata["security"] = "reality"
        reality.string("public-key", "public_key")?.let { metadata["pbk"] = it }
        reality.string("short-id", "short_id")?.let { metadata["sid"] = it }
      } else if (bool("tls")) {
        metadata["security"] = "tls"
      }
      copyTlsMetadataFromMap(metadata, this, server)
      copyTransportMetadataFromMap(metadata, this, networkKey = "type")
      null
    }

    "vmess" -> buildClashNode(proxy, NodeProtocol.VMESS, type, name) { metadata, server ->
      metadata["id"] = string("uuid") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo VMess proxy пропущен: отсутствует uuid.")
      string("alterId", "alter-id", "alter_id")?.let { metadata["aid"] = it }
      string("cipher")?.let { metadata["scy"] = it }
      string("packet-encoding", "packet_encoding")?.let { metadata["packet_encoding"] = it }
      if (bool("tls")) {
        metadata["tls"] = "tls"
      }
      copyTlsMetadataFromMap(metadata, this, server)
      copyTransportMetadataFromMap(metadata, this, networkKey = "net")
      null
    }

    "trojan" -> buildClashNode(proxy, NodeProtocol.TROJAN, type, name) { metadata, server ->
      metadata["password"] = string("password") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo Trojan proxy пропущен: отсутствует password.")
      copyTlsMetadataFromMap(metadata, this, server)
      copyTransportMetadataFromMap(metadata, this, networkKey = "type")
      null
    }

    "ss" -> buildClashNode(proxy, NodeProtocol.SHADOWSOCKS, type, name) { metadata, _ ->
      metadata["method"] = string("cipher") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo Shadowsocks proxy пропущен: отсутствует cipher.")
      metadata["password"] = string("password") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo Shadowsocks proxy пропущен: отсутствует password.")
      string("plugin")?.let { metadata["plugin"] = it }
      map("plugin-opts", "plugin_opts")?.let { options ->
        val flattened = flattenPluginOptions(options)
        if (flattened.isNotBlank()) {
          metadata["plugin_opts"] = flattened
        }
      }
      string("network")?.let { metadata["network"] = it }
      if (bool("udp-over-tcp", "udp_over_tcp", "uot")) {
        metadata["udp_over_tcp"] = "true"
      }
      null
    }

    "socks5", "socks" -> buildClashNode(proxy, NodeProtocol.SOCKS, type, name, defaultPort = 1080) { metadata, _ ->
      string("username", "user")?.let { metadata["username"] = it }
      string("password")?.let { metadata["password"] = it }
      null
    }

    "http" -> buildClashNode(proxy, NodeProtocol.HTTP, type, name, defaultPort = if (proxy.bool("tls")) 443 else 80) { metadata, server ->
      string("username", "user")?.let { metadata["username"] = it }
      string("password")?.let { metadata["password"] = it }
      if (bool("tls")) {
        metadata["tls"] = "true"
        copyTlsMetadataFromMap(metadata, this, server)
      }
      null
    }

    "hy2", "hysteria2" -> buildClashNode(proxy, NodeProtocol.HYSTERIA2, type, name) { metadata, server ->
      metadata["password"] = string("password") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo Hysteria2 proxy пропущен: отсутствует password.")
      string("up")?.let { parseMbpsValue(it)?.let { value -> metadata["up_mbps"] = value } }
      string("down")?.let { parseMbpsValue(it)?.let { value -> metadata["down_mbps"] = value } }
      string("hop-interval", "hop_interval")?.let { metadata["hop_interval"] = normalizeDurationSeconds(it) }
      string("obfs")?.let { metadata["obfs"] = it }
      string("obfs-password", "obfs_password")?.let { metadata["obfs_password"] = it }
      copyTlsMetadataFromMap(metadata, this, server)
      null
    }

    "tuic" -> buildClashNode(proxy, NodeProtocol.TUIC, type, name) { metadata, server ->
      val uuid = string("uuid")
      val password = string("password")
      if (uuid.isNullOrBlank() || password.isNullOrBlank()) {
        return@buildClashNode ParsedImportIssue("Clash/Mihomo TUIC proxy пропущен: поддерживается только конфигурация с uuid/password.")
      }
      metadata["uuid"] = uuid
      metadata["password"] = password
      string("congestion-controller", "congestion_controller")?.let { metadata["congestion_control"] = it }
      string("udp-relay-mode", "udp_relay_mode")?.let { metadata["udp_relay_mode"] = it }
      boolString("reduce-rtt", "reduce_rtt")?.let { metadata["zero_rtt_handshake"] = it }
      string("heartbeat-interval", "heartbeat_interval")?.let { metadata["heartbeat"] = normalizeDurationMillis(it) }
      copyTlsMetadataFromMap(metadata, this, server)
      null
    }

    "wireguard", "wg" -> buildClashNode(proxy, NodeProtocol.WIREGUARD, type, name, defaultPort = 51820) { metadata, _ ->
      metadata["private_key"] = string("private-key", "private_key") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo WireGuard proxy пропущен: отсутствует private-key.")
      metadata["peer_public_key"] = string("public-key", "public_key") ?: return@buildClashNode ParsedImportIssue("Clash/Mihomo WireGuard proxy пропущен: отсутствует public-key.")
      string("pre-shared-key", "pre_shared_key")?.let { metadata["pre_shared_key"] = it }
      string("mtu")?.let { metadata["mtu"] = it }
      val localAddresses = buildWireGuardLocalAddress(this)
      if (localAddresses.isNotEmpty()) {
        metadata["local_address"] = localAddresses.joinToString(", ")
      }
      null
    }

    "ssr" -> ParsedImportIssue("Clash/Mihomo SSR proxy найден, но формат SSR пока не поддерживается.")
    else -> ParsedImportIssue("Clash/Mihomo proxy типа `$type` пока не поддерживается.")
  }
}

private inline fun buildClashNode(
  proxy: Map<String, Any?>,
  protocol: NodeProtocol,
  type: String,
  name: String,
  defaultPort: Int = 443,
  configure: Map<String, Any?>.(metadata: MutableMap<String, String>, server: String) -> ParsedImportIssue?
): ParsedImportResult {
  val server = proxy.string("server") ?: return ParsedImportIssue("Clash/Mihomo ${protocol.name} proxy пропущен: отсутствует server.")
  val port = proxy.int("port") ?: defaultPort
  val metadata = mutableMapOf<String, String>()
  val issue = proxy.configure(metadata, server)
  if (issue != null) {
    return issue
  }
  return ParsedImportNode(
    buildImportedNode(
      protocol = protocol,
      source = "clash",
      type = type,
      name = name,
      server = server,
      port = port,
      metadata = metadata
    )
  )
}

private fun buildImportedNode(
  protocol: NodeProtocol,
  source: String,
  type: String,
  name: String,
  server: String,
  port: Int,
  metadata: Map<String, String>
): VpnNode {
  return VpnNode(
    id = UUID.randomUUID().toString(),
    name = name.ifBlank { "${protocol.name.lowercase()}-$server:$port" },
    protocol = protocol,
    server = server,
    port = port,
    uri = buildImportedUri(source, type, name, server, port),
    metadata = metadata
  )
}

private fun buildImportedUri(source: String, type: String, name: String, server: String, port: Int): String {
  val encodedName = URLEncoder.encode(name.ifBlank { "$type-$server:$port" }, StandardCharsets.UTF_8).replace("+", "%20")
  return "$source://imported/$type/$server:$port#$encodedName"
}

private fun sanitizeImportUrlCandidate(value: String): String {
  return value
    .trim()
    .trim('"', '\'', '`', '<', '>', '(', ')', '[', ']', '{', '}')
    .trimEnd('.', ',', ';')
}

private fun isSubscriptionHttpUrl(value: String): Boolean {
  val candidate = sanitizeImportUrlCandidate(value)
  val uri = runCatching { URI(candidate) }.getOrNull() ?: return false
  val scheme = uri.scheme?.lowercase() ?: return false
  if (scheme != "http" && scheme != "https") {
    return false
  }

  val hasAuth = !uri.rawUserInfo.isNullOrBlank()
  val hasExplicitPort = uri.port > 0
  val hasContentPath = uri.rawPath?.let { it.isNotEmpty() && it != "/" } == true
  val hasQueryOrFragment = !uri.rawQuery.isNullOrBlank() || !uri.rawFragment.isNullOrBlank()
  return !((hasAuth || hasExplicitPort) && !hasContentPath && !hasQueryOrFragment)
}

private fun parseImportQuery(rawQuery: String): Map<String, String> {
  return rawQuery
    .split('&')
    .filter { it.isNotBlank() }
    .associate { entry ->
      val key = entry.substringBefore('=')
      val value = entry.substringAfter('=', "")
      decode(key) to decode(value)
    }
}

private fun copyTlsMetadataFromJson(
  metadata: MutableMap<String, String>,
  tls: JsonObject?,
  server: String,
  securityKey: String? = null
) {
  if (tls == null) {
    return
  }

  tls.string("server_name")?.let { metadata["sni"] = it }
  tls.boolString("insecure")?.let { metadata["insecure"] = it }
  val alpn = tls.stringList("alpn")
  if (alpn.isNotEmpty()) {
    metadata["alpn"] = alpn.joinToString(", ")
  }
  tls.objectValue("utls")?.string("fingerprint")?.let { metadata["fp"] = it }
  tls.objectValue("reality")?.let { reality ->
    securityKey?.let { metadata[it] = "reality" }
    reality.string("public_key")?.let { metadata["pbk"] = it }
    reality.string("short_id")?.let { metadata["sid"] = it }
  } ?: securityKey?.let {
    metadata[it] = "tls"
  }
  if (metadata["sni"].isNullOrBlank()) {
    metadata["sni"] = server
  }
}

private fun copyTransportMetadataFromJson(
  metadata: MutableMap<String, String>,
  transport: JsonObject?,
  networkKey: String
) {
  when (transport?.string("type")?.lowercase()) {
    "ws" -> {
      metadata[networkKey] = "ws"
      metadata["path"] = transport.string("path") ?: "/"
      val host = transport.objectValue("headers")?.string("Host", "host") ?: transport.string("host")
      host?.let { metadata["host"] = it }
    }

    "grpc" -> {
      metadata[networkKey] = "grpc"
      transport.string("service_name")?.let { metadata["serviceName"] = it }
    }

    "http", "h2" -> {
      metadata[networkKey] = "http"
      metadata["path"] = transport.string("path") ?: "/"
      transport.stringList("host").firstOrNull()?.let { metadata["host"] = it }
    }

    "httpupgrade" -> {
      metadata[networkKey] = "httpupgrade"
      transport.string("path")?.let { metadata["path"] = it }
      transport.string("host")?.let { metadata["host"] = it }
    }
  }
}

private fun copyTlsMetadataFromMap(
  metadata: MutableMap<String, String>,
  source: Map<String, Any?>,
  server: String
) {
  source.string("servername", "server-name", "server_name", "sni")
    ?.takeIf { it.isNotBlank() }
    ?.let { metadata["sni"] = it }
  source.boolString("skip-cert-verify", "skip_cert_verify")
    ?.let { metadata["insecure"] = it }
  source.string("client-fingerprint", "client_fingerprint", "fingerprint")
    ?.takeIf { it.isNotBlank() }
    ?.let { metadata["fp"] = it }
  val alpn = source.stringList("alpn")
  if (alpn.isNotEmpty()) {
    metadata["alpn"] = alpn.joinToString(", ")
  }
  if (metadata["sni"].isNullOrBlank()) {
    metadata["sni"] = server
  }
}

private fun copyTransportMetadataFromMap(
  metadata: MutableMap<String, String>,
  source: Map<String, Any?>,
  networkKey: String
) {
  when (source.string("network")?.lowercase()) {
    "ws" -> {
      metadata[networkKey] = "ws"
      val wsOpts = source.map("ws-opts", "ws_opts")
      metadata["path"] = wsOpts?.string("path") ?: source.string("ws-path", "ws_path") ?: "/"
      val host = wsOpts?.map("headers")?.string("Host", "host")
        ?: source.map("ws-headers", "ws_headers")?.string("Host", "host")
      host?.let { metadata["host"] = it }
    }

    "grpc" -> {
      metadata[networkKey] = "grpc"
      val grpcOpts = source.map("grpc-opts", "grpc_opts")
      grpcOpts?.string("grpc-service-name", "serviceName", "service_name")
        ?.let { metadata["serviceName"] = it }
    }

    "http", "h2" -> {
      metadata[networkKey] = "http"
      val httpOpts = source.map("http-opts", "http_opts", "h2-opts", "h2_opts")
      metadata["path"] = httpOpts?.string("path") ?: "/"
      httpOpts?.stringList("host")?.firstOrNull()?.let { metadata["host"] = it }
    }
  }
}

private fun buildWireGuardLocalAddress(source: Map<String, Any?>): List<String> {
  val addresses = mutableListOf<String>()
  source.string("ip")?.takeIf { it.isNotBlank() }?.let { ip ->
    addresses += if ('/' in ip) ip else "$ip/32"
  }
  source.string("ipv6")?.takeIf { it.isNotBlank() }?.let { ipv6 ->
    addresses += if ('/' in ipv6) ipv6 else "$ipv6/128"
  }
  return addresses
}

private fun flattenPluginOptions(options: Map<String, Any?>): String {
  return options.entries
    .mapNotNull { (key, value) ->
      val normalized = scalarToString(value) ?: return@mapNotNull null
      "${key.toString()}=$normalized"
    }
    .joinToString(";")
}

private fun parseMbpsValue(raw: String): String? {
  return Regex("(\\d+)").find(raw)?.groupValues?.getOrNull(1)
}

private fun normalizeDurationSeconds(raw: String): String {
  val trimmed = raw.trim()
  return if (trimmed.all(Char::isDigit)) "$trimmed" + "s" else trimmed
}

private fun normalizeDurationMillis(raw: String): String {
  val trimmed = raw.trim()
  return if (trimmed.all(Char::isDigit)) "$trimmed" + "ms" else trimmed
}

private fun scalarToString(value: Any?): String? = when (value) {
  null -> null
  is String -> value
  is Number -> value.toString()
  is Boolean -> value.toString()
  else -> null
}

private fun Any?.toStringKeyMap(): Map<String, Any?>? {
  val source = this as? Map<*, *> ?: return null
  return source.entries.associate { (key, value) -> key.toString() to value }
}

private fun Map<String, Any?>.string(vararg keys: String): String? {
  for (key in keys) {
    val resolved = scalarToString(this[key])?.trim()
    if (!resolved.isNullOrEmpty()) {
      return resolved
    }
  }
  return null
}

private fun Map<String, Any?>.int(vararg keys: String): Int? = string(*keys)?.toIntOrNull()

private fun Map<String, Any?>.bool(vararg keys: String): Boolean {
  return boolString(*keys)?.lowercase() in setOf("1", "true", "yes", "on")
}

private fun Map<String, Any?>.boolString(vararg keys: String): String? = string(*keys)

private fun Map<String, Any?>.map(vararg keys: String): Map<String, Any?>? {
  for (key in keys) {
    val resolved = this[key].toStringKeyMap()
    if (resolved != null) {
      return resolved
    }
  }
  return null
}

private fun Map<String, Any?>.stringList(vararg keys: String): List<String> {
  for (key in keys) {
    when (val value = this[key]) {
      is List<*> -> {
        val mapped = value.mapNotNull(::scalarToString).map(String::trim).filter(String::isNotEmpty)
        if (mapped.isNotEmpty()) {
          return mapped
        }
      }
      is String -> if (value.isNotBlank()) {
        return listOf(value.trim())
      }
    }
  }
  return emptyList()
}

private fun JsonObject.string(vararg keys: String): String? {
  for (key in keys) {
    val resolved = (this[key] as? JsonPrimitive)?.content?.trim()
    if (!resolved.isNullOrEmpty()) {
      return resolved
    }
  }
  return null
}

private fun JsonObject.int(vararg keys: String): Int? = string(*keys)?.toIntOrNull()

private fun JsonObject.boolString(vararg keys: String): String? = string(*keys)

private fun JsonObject.objectValue(vararg keys: String): JsonObject? {
  for (key in keys) {
    val resolved = this[key] as? JsonObject
    if (resolved != null) {
      return resolved
    }
  }
  return null
}

private fun JsonObject.stringList(vararg keys: String): List<String> {
  for (key in keys) {
    when (val value = this[key]) {
      is JsonArray -> {
        val mapped = value.mapNotNull { (it as? JsonPrimitive)?.content?.trim() }.filter(String::isNotEmpty)
        if (mapped.isNotEmpty()) {
          return mapped
        }
      }
      is JsonPrimitive -> if (value.content.isNotBlank()) {
        return listOf(value.content.trim())
      }
      else -> Unit
    }
  }
  return emptyList()
}

private fun decode(value: String): String = java.net.URLDecoder.decode(value, StandardCharsets.UTF_8)

private fun decodeBase64Safe(value: String): String {
  val normalized = value
    .trim()
    .replace('-', '+')
    .replace('_', '/')
  val padding = when (normalized.length % 4) {
    2 -> "=="
    3 -> "="
    else -> ""
  }
  return String(java.util.Base64.getDecoder().decode(normalized + padding), StandardCharsets.UTF_8)
}

private fun isLikelyBase64Block(raw: String): Boolean {
  val value = raw.trim()
  return value.length >= 16 && Regex("^[A-Za-z0-9+/=_-]+$").matches(value)
}
