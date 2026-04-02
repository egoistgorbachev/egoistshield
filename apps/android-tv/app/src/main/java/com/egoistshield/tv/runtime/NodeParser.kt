package com.egoistshield.tv.runtime

import com.egoistshield.tv.data.VpnNode
import com.egoistshield.tv.model.NodeProtocol
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class ParsedNodes(
  val nodes: List<VpnNode>,
  val issues: List<String>
)

private val uriPattern = Regex(
  "(vless|vmess|trojan|ss|socks5?|https?|hy2|hysteria2|tuic|wireguard|wg)://[^\\s<>\"'`]+",
  RegexOption.IGNORE_CASE
)

fun parseNodesFromText(payload: String): ParsedNodes {
  val workingPayload = tryDecodeTextPayload(payload) ?: payload
  val structured = parseStructuredImportPayload(workingPayload)
  if (structured.recognized) {
    return ParsedNodes(dedupeNodes(structured.nodes), structured.issues)
  }

  val lines = workingPayload
    .split(Regex("\\r?\\n"))
    .map { it.trim() }
    .filter { it.isNotEmpty() }

  val nodes = mutableListOf<VpnNode>()
  val issues = mutableListOf<String>()

  val directUris = extractKnownUris(workingPayload)
  val candidates = if (directUris.isNotEmpty()) directUris else lines

  if (directUris.isNotEmpty()) {
    for (line in lines) {
      if (Regex("^(vless|vmess|trojan|ss|socks5?|https?|hy2|hysteria2|tuic|wireguard|wg)://", RegexOption.IGNORE_CASE).containsMatchIn(line)) {
        continue
      }

      val subscriptionUrls = extractSubscriptionUrls(line)
      if (subscriptionUrls.isNotEmpty()) {
        issues += "Найдена ссылка подписки: ${subscriptionUrls.first().take(120)}"
      } else {
        issues += "Пропущена неподдерживаемая строка: ${line.take(120)}"
      }
    }
  }

  for (candidate in candidates) {
    val detailed = parseNodeUriDetailed(candidate)
    if (detailed.node != null) {
      nodes += detailed.node
      continue
    }

    if (detailed.issue != null) {
      issues += detailed.issue
      continue
    }

    val decodedCandidates = tryDecodeSubscriptionBlock(candidate)
    if (decodedCandidates.isNotEmpty()) {
      for (decoded in decodedCandidates) {
        val decodedDetailed = parseNodeUriDetailed(decoded)
        if (decodedDetailed.node != null) {
          nodes += decodedDetailed.node
        } else if (decodedDetailed.issue != null) {
          issues += decodedDetailed.issue
        } else {
          issues += "Ошибка в строке подписки: ${decoded.take(120)}"
        }
      }
      continue
    }

    val subscriptionUrls = extractSubscriptionUrls(candidate)
    if (subscriptionUrls.isNotEmpty()) {
      issues += "Найдена ссылка подписки: ${subscriptionUrls.first().take(120)}"
      continue
    }

    if (lines.size <= 25) {
      issues += "Пропущена неподдерживаемая строка: ${candidate.take(120)}"
    }
  }

  return ParsedNodes(dedupeNodes(nodes), issues)
}

fun extractSubscriptionUrls(payload: String): List<String> {
  return extractSubscriptionUrlsFromPayload(payload)
}

fun uniqueNodes(existing: List<VpnNode>, incoming: List<VpnNode>): List<VpnNode> {
  val seen = existing.mapTo(mutableSetOf(), ::buildNodeFingerprint)
  val result = mutableListOf<VpnNode>()
  for (node in incoming) {
    val fingerprint = buildNodeFingerprint(node)
    if (seen.add(fingerprint)) {
      result += node
    }
  }
  return result
}

private data class ParsedUriResult(
  val node: VpnNode?,
  val issue: String?
)

private fun parseNodeUriDetailed(value: String): ParsedUriResult {
  val raw = sanitizeUrlCandidate(value)
  if (raw.isEmpty()) {
    return ParsedUriResult(null, null)
  }

  return try {
    val node = when {
      raw.startsWith("vless://", ignoreCase = true) -> parseVless(raw)
      raw.startsWith("vmess://", ignoreCase = true) -> parseVmess(raw)
      raw.startsWith("trojan://", ignoreCase = true) -> parseTrojan(raw)
      raw.startsWith("ss://", ignoreCase = true) -> parseShadowsocks(raw)
      raw.startsWith("socks://", ignoreCase = true) || raw.startsWith("socks5://", ignoreCase = true) -> parseSocks(raw)
      raw.startsWith("http://", ignoreCase = true) || raw.startsWith("https://", ignoreCase = true) -> parseHttp(raw)
      raw.startsWith("hy2://", ignoreCase = true) || raw.startsWith("hysteria2://", ignoreCase = true) -> parseHysteria2(raw)
      raw.startsWith("tuic://", ignoreCase = true) -> parseTuic(raw)
      raw.startsWith("wireguard://", ignoreCase = true) || raw.startsWith("wg://", ignoreCase = true) -> parseWireGuard(raw)
      raw.startsWith("ssr://", ignoreCase = true) -> return ParsedUriResult(null, "Получен протокол ShadowsocksR (SSR). Этот формат пока не поддерживается.")
      else -> null
    }

    if (node == null) {
      ParsedUriResult(null, null)
    } else if (isUnsupportedEndpoint(node.name, node.server, node.port)) {
      ParsedUriResult(
        null,
        "Сервис вернул заглушку «${node.name.ifBlank { "App not supported" }}» (${node.server}:${node.port}). Этот профиль не поддерживается провайдером."
      )
    } else {
      ParsedUriResult(node, null)
    }
  } catch (_: Throwable) {
    ParsedUriResult(null, "Ошибка разбора URI: ${raw.take(100)}")
  }
}

private fun parseVless(raw: String): VpnNode? {
  val uri = URI(raw)
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 443
  val metadata = parseQuery(uri.rawQuery).toMutableMap()
  metadata["id"] = decode(uri.rawUserInfo ?: return null)
  return buildNode(NodeProtocol.VLESS, fragmentName(uri), server, port, raw, metadata)
}

private fun parseTrojan(raw: String): VpnNode? {
  val uri = URI(raw)
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 443
  val password = decode(uri.rawUserInfo ?: return null)
  val metadata = parseQuery(uri.rawQuery).toMutableMap()
  metadata["password"] = password
  return buildNode(NodeProtocol.TROJAN, fragmentName(uri), server, port, raw, metadata)
}

private fun parseShadowsocks(raw: String): VpnNode? {
  val payload = raw.removePrefix("ss://").removePrefix("SS://").trim()
  val hashIndex = payload.indexOf('#')
  val fragment = if (hashIndex >= 0) payload.substring(hashIndex + 1) else ""
  val withoutFragment = if (hashIndex >= 0) payload.substring(0, hashIndex) else payload
  val queryIndex = withoutFragment.indexOf('?')
  val authorityPart = if (queryIndex >= 0) withoutFragment.substring(0, queryIndex) else withoutFragment
  val rawQuery = if (queryIndex >= 0) withoutFragment.substring(queryIndex + 1) else ""

  val combined = if ('@' in authorityPart) authorityPart else decodeBase64Safe(authorityPart)
  val authPart = combined.substringBefore('@', "")
  val endpointPart = combined.substringAfter('@', "")
  if (authPart.isBlank() || endpointPart.isBlank()) {
    return null
  }

  val decodedAuth = decodeShadowsocksCredentials(authPart)
  val method = decodedAuth.substringBefore(':', "")
  val password = decodedAuth.substringAfter(':', "")
  val endpoint = parseHostPort(endpointPart.removeSuffix("/")) ?: return null
  if (method.isBlank() || password.isBlank()) {
    return null
  }
  val metadata = parseQuery(rawQuery).toMutableMap()
  metadata["method"] = method
  metadata["password"] = password
  normalizeShadowsocksMetadata(metadata)
  return buildNode(
    NodeProtocol.SHADOWSOCKS,
    decode(fragment),
    endpoint.first,
    endpoint.second,
    raw,
    metadata
  )
}

private fun parseVmess(raw: String): VpnNode? {
  val encoded = raw.removePrefix("vmess://").removePrefix("VMESS://").trim()
  val json = decodeBase64Safe(encoded)
  val obj = Json.parseToJsonElement(json).jsonObject
  val server = obj["add"]?.jsonPrimitive?.content ?: return null
  val port = obj["port"]?.jsonPrimitive?.content?.toIntOrNull() ?: 443
  val metadata = obj.mapValues { (_, value) -> value.jsonPrimitive.content }
  return buildNode(
    NodeProtocol.VMESS,
    obj["ps"]?.jsonPrimitive?.content.orEmpty(),
    server,
    port,
    raw,
    metadata
  )
}

private fun parseSocks(raw: String): VpnNode? {
  val uri = URI(raw)
  if (!setOf("socks", "socks5").contains(uri.scheme?.lowercase())) {
    return null
  }
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 1080
  val metadata = mutableMapOf<String, String>()
  val (username, password) = parseUserInfo(uri.rawUserInfo)
  username?.let { metadata["username"] = it }
  password?.let { metadata["password"] = it }
  return buildNode(NodeProtocol.SOCKS, fragmentName(uri), server, port, raw, metadata)
}

private fun parseHttp(raw: String): VpnNode? {
  val uri = URI(raw)
  val scheme = uri.scheme?.lowercase() ?: return null
  if (scheme != "http" && scheme != "https") {
    return null
  }

  if (!looksLikeHttpProxyUri(uri)) {
    return null
  }

  val server = uri.host ?: return null
  val port = if (uri.port > 0) uri.port else if (scheme == "https") 443 else 80
  val metadata = mutableMapOf("tls" to (scheme == "https").toString())
  val (username, password) = parseUserInfo(uri.rawUserInfo)
  username?.let { metadata["username"] = it }
  password?.let { metadata["password"] = it }
  return buildNode(NodeProtocol.HTTP, fragmentName(uri), server, port, raw, metadata)
}

private fun parseHysteria2(raw: String): VpnNode? {
  val normalized = if (raw.startsWith("hy2://", ignoreCase = true)) {
    raw.replaceFirst(Regex("^hy2://", RegexOption.IGNORE_CASE), "hysteria2://")
  } else {
    raw
  }
  val uri = URI(normalized)
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 443
  val metadata = parseQuery(uri.rawQuery).toMutableMap()
  val password = decode(uri.rawUserInfo ?: metadata["password"] ?: return null)
  metadata["password"] = password
  return buildNode(NodeProtocol.HYSTERIA2, fragmentName(uri), server, port, raw, metadata)
}

private fun parseTuic(raw: String): VpnNode? {
  val uri = URI(raw)
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 443
  val metadata = parseQuery(uri.rawQuery).toMutableMap()
  val (uuid, password) = parseUserInfo(uri.rawUserInfo)
  val resolvedUuid = uuid ?: metadata["uuid"]
  val resolvedPassword = password ?: metadata["password"]
  if (resolvedUuid.isNullOrBlank() || resolvedPassword.isNullOrBlank()) {
    return null
  }
  metadata["uuid"] = resolvedUuid
  metadata["password"] = resolvedPassword
  return buildNode(NodeProtocol.TUIC, fragmentName(uri), server, port, raw, metadata)
}

private fun parseWireGuard(raw: String): VpnNode? {
  val normalized = if (raw.startsWith("wg://", ignoreCase = true)) {
    raw.replaceFirst(Regex("^wg://", RegexOption.IGNORE_CASE), "wireguard://")
  } else {
    raw
  }
  val uri = URI(normalized)
  val server = uri.host ?: return null
  val port = uri.port.takeIf { it > 0 } ?: 51820
  val metadata = parseQuery(uri.rawQuery).toMutableMap()
  val privateKey = decode(uri.rawUserInfo ?: metadata["private_key"] ?: metadata["privateKey"] ?: return null)
  val publicKey = metadata["publickey"] ?: metadata["peer_public_key"] ?: metadata["public_key"] ?: metadata["publicKey"] ?: return null
  metadata["private_key"] = privateKey
  metadata["peer_public_key"] = publicKey
  return buildNode(NodeProtocol.WIREGUARD, fragmentName(uri), server, port, raw, metadata)
}

private fun buildNode(
  protocol: NodeProtocol,
  name: String,
  server: String,
  port: Int,
  uri: String,
  metadata: Map<String, String>,
  subscriptionId: String? = null
): VpnNode {
  return VpnNode(
    id = UUID.randomUUID().toString(),
    name = name.ifBlank { "${protocol.label()}-$server:$port" },
    protocol = protocol,
    server = server,
    port = port,
    uri = uri,
    metadata = metadata,
    subscriptionId = subscriptionId
  )
}

private fun buildNodeFingerprint(node: VpnNode): String {
  val authKey = node.metadata["id"] ?: node.metadata["password"] ?: node.metadata["username"].orEmpty()
  return "${node.protocol.name.lowercase()}|${node.server}|${node.port}|$authKey"
}

private fun dedupeNodes(nodes: List<VpnNode>): List<VpnNode> {
  val seen = mutableSetOf<String>()
  return nodes.filter { seen.add(buildNodeFingerprint(it)) }
}

private fun decodeBase64Safe(value: String): String {
  val normalized = value.replace('-', '+').replace('_', '/')
  val padding = when (normalized.length % 4) {
    2 -> "=="
    3 -> "="
    else -> ""
  }
  return String(Base64.getDecoder().decode(normalized + padding), StandardCharsets.UTF_8)
}

private fun decode(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8)

private fun fragmentName(uri: URI): String = decode(uri.rawFragment.orEmpty())

private fun parseQuery(rawQuery: String?): Map<String, String> {
  if (rawQuery.isNullOrBlank()) {
    return emptyMap()
  }

  return rawQuery
    .split('&')
    .filter { it.isNotBlank() }
    .associate { entry ->
      val key = entry.substringBefore('=')
      val value = entry.substringAfter('=', "")
      decode(key) to decode(value)
    }
}

private fun parseUserInfo(rawUserInfo: String?): Pair<String?, String?> {
  if (rawUserInfo.isNullOrBlank()) {
    return null to null
  }
  val username = rawUserInfo.substringBefore(':', rawUserInfo).takeIf { it.isNotBlank() }?.let(::decode)
  val password = rawUserInfo.substringAfter(':', "").takeIf { it.isNotBlank() }?.let(::decode)
  return username to password
}

private fun extractKnownUris(payload: String): List<String> =
  uriPattern.findAll(payload).map { sanitizeUrlCandidate(it.value) }.distinct().toList()

private fun tryDecodeSubscriptionBlock(raw: String): List<String> {
  if (!isLikelyBase64Block(raw)) {
    return emptyList()
  }

  return try {
    extractKnownUris(decodeBase64Safe(raw.trim()))
  } catch (_: Throwable) {
    emptyList()
  }
}

private fun tryDecodeTextPayload(payload: String): String? {
  val trimmed = payload.trim().replace(Regex("[\\r\\n\\s]+"), "")
  if (trimmed.length < 16 || !isLikelyBase64Block(trimmed)) {
    return null
  }

  return runCatching { decodeBase64Safe(trimmed) }.getOrNull()
}

private fun isLikelyBase64Block(raw: String): Boolean {
  val value = raw.trim()
  return value.length >= 16 && Regex("^[A-Za-z0-9+/=_-]+$").matches(value)
}

private fun sanitizeUrlCandidate(value: String): String {
  return value
    .trim()
    .trim('"', '\'', '`', '<', '>', '(', ')', '[', ']', '{', '}')
    .trimEnd('.', ',', ';')
}

private fun parseHostPort(raw: String): Pair<String, Int>? {
  val value = raw.trim()
  if (value.startsWith("[")) {
    val endIndex = value.indexOf(']')
    if (endIndex <= 0 || endIndex + 2 > value.length || value[endIndex + 1] != ':') {
      return null
    }
    val host = value.substring(1, endIndex)
    val port = value.substring(endIndex + 2).toIntOrNull() ?: return null
    return host to port
  }

  val separatorIndex = value.lastIndexOf(':')
  if (separatorIndex <= 0 || separatorIndex == value.lastIndex) {
    return null
  }
  val host = value.substring(0, separatorIndex)
  val port = value.substring(separatorIndex + 1).toIntOrNull() ?: return null
  return host to port
}

private fun decodeShadowsocksCredentials(raw: String): String {
  val decoded = decode(raw)
  if (decoded.contains(':')) {
    return decoded
  }

  val base64Decoded = decodeBase64Safe(raw)
  return decode(base64Decoded)
}

private fun normalizeShadowsocksMetadata(metadata: MutableMap<String, String>) {
  val plugin = metadata["plugin"]
  if (!plugin.isNullOrBlank()) {
    val parts = plugin.split(';', limit = 2)
    metadata["plugin"] = parts.first()
    if (parts.size > 1 && metadata["plugin_opts"].isNullOrBlank()) {
      metadata["plugin_opts"] = parts[1]
    }
  }

  if (metadata["uot"] in setOf("1", "true", "on", "yes")) {
    metadata["udp_over_tcp"] = "true"
  }
}

private fun looksLikeHttpProxyUri(uri: URI): Boolean {
  val hasAuth = !uri.rawUserInfo.isNullOrBlank()
  val hasExplicitPort = uri.port > 0
  val hasContentPath = uri.rawPath?.let { it.isNotEmpty() && it != "/" } == true
  val hasQueryOrFragment = !uri.rawQuery.isNullOrBlank() || !uri.rawFragment.isNullOrBlank()
  return (hasAuth || hasExplicitPort) && !hasContentPath && !hasQueryOrFragment
}

private fun isUnsupportedEndpoint(name: String, server: String, port: Int): Boolean {
  val lowerName = name.lowercase()
  return (server == "0.0.0.0" && port <= 1) || lowerName.contains("app not supported") || lowerName.contains("not supported")
}

private fun NodeProtocol.label(): String = when (this) {
  NodeProtocol.VLESS -> "vless"
  NodeProtocol.VMESS -> "vmess"
  NodeProtocol.TROJAN -> "trojan"
  NodeProtocol.SHADOWSOCKS -> "shadowsocks"
  NodeProtocol.SOCKS -> "socks"
  NodeProtocol.HTTP -> "http"
  NodeProtocol.HYSTERIA2 -> "hysteria2"
  NodeProtocol.TUIC -> "tuic"
  NodeProtocol.WIREGUARD -> "wireguard"
}
