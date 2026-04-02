package com.egoistshield.tv.runtime

import java.net.URI

private val dnsSeparatorRegex = Regex("[\\s,;]+")
private val ipv4Regex = Regex("^(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)(\\.(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)){3}$")

fun isValidIpLiteral(value: String): Boolean = isValidIpv4(value) || isValidIpv6(value)

fun parseDnsServers(rawInput: String): List<String> {
  val tokens = rawInput
    .split(dnsSeparatorRegex)
    .map { it.trim() }
    .filter { it.isNotEmpty() }

  require(tokens.isNotEmpty()) { "Укажите хотя бы один DNS-сервер." }

  val uniqueServers = linkedSetOf<String>()
  for (token in tokens) {
    val normalized = extractHostCandidate(token)
    require(isValidIpLiteral(normalized)) {
      "Некорректный DNS-адрес: $token. Используйте IP, host:port или URL с IP-хостом."
    }
    uniqueServers += normalized
  }

  return uniqueServers.toList()
}

private fun isValidIpv4(value: String): Boolean = ipv4Regex.matches(value)

private fun isValidIpv6(value: String): Boolean {
  if (!value.contains(":")) {
    return false
  }

  return try {
    val parsed = URI("http://[$value]")
    parsed.host == "[$value]"
  } catch (_: Throwable) {
    false
  }
}

private fun stripWrappingQuotes(value: String): String {
  return if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value.substring(1, value.length - 1).trim()
  } else {
    value
  }
}

private fun unwrapBracketedHost(value: String): String {
  if (!value.startsWith("[")) {
    return value
  }

  val closingIndex = value.indexOf(']')
  return if (closingIndex == -1) value else value.substring(1, closingIndex)
}

private fun extractHostCandidate(rawToken: String): String {
  val token = stripWrappingQuotes(rawToken.trim())
  if (token.isEmpty()) {
    return token
  }

  require(!token.startsWith("sdns://", ignoreCase = true)) {
    "DNS Stamp (sdns://) нельзя использовать как системный DNS устройства."
  }

  if (Regex("^[a-z][a-z0-9+.-]*://", RegexOption.IGNORE_CASE).containsMatchIn(token)) {
    return try {
      val parsed = URI(token)
      unwrapBracketedHost(parsed.host ?: "")
    } catch (_: Throwable) {
      throw IllegalArgumentException("Не удалось разобрать DNS-адрес: $token")
    }
  }

  if (token.startsWith("[")) {
    val closingIndex = token.indexOf(']')
    if (closingIndex != -1) {
      return token.substring(1, closingIndex)
    }
  }

  val withoutPath = token.substringBefore('/')
  if (isValidIpLiteral(withoutPath)) {
    return withoutPath
  }

  val hostPortMatch = Regex("^(?<host>[^:]+):(?<port>\\d+)$").matchEntire(withoutPath)
  val host = hostPortMatch?.groups?.get("host")?.value
  if (host != null && isValidIpv4(host)) {
    return host
  }

  return withoutPath
}
