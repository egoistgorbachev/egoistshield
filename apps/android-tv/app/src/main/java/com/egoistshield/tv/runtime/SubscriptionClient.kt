package com.egoistshield.tv.runtime

import android.content.Context
import android.os.Build
import android.provider.Settings
import com.egoistshield.tv.data.SubscriptionUserAgent
import java.net.HttpURLConnection
import java.net.URI
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class FetchedSubscription(
  val text: String,
  val userInfo: Map<String, Long>?,
  val name: String?
)

data class FetchedSubscriptionAttempt(
  val profile: SubscriptionUserAgent,
  val response: FetchedSubscription?,
  val error: Throwable?
)

class SubscriptionClient(private val context: Context) {
  suspend fun readUrlText(
    url: String,
    profile: SubscriptionUserAgent
  ): FetchedSubscription = withContext(Dispatchers.IO) {
    val attempts = readUrlAttemptsInternal(url, profile)
    attempts.firstOrNull { it.response != null }?.response
      ?: throw (attempts.lastOrNull { it.error != null }?.error ?: IllegalStateException("Не удалось загрузить подписку."))
  }

  suspend fun readUrlAttempts(
    url: String,
    profile: SubscriptionUserAgent
  ): List<FetchedSubscriptionAttempt> = withContext(Dispatchers.IO) {
    readUrlAttemptsInternal(url, profile)
  }

  private fun readUrlTextInternal(url: String, profile: SubscriptionUserAgent): FetchedSubscription {
    val connection = (URI(url).toURL().openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 10_000
      readTimeout = 10_000
      requestMethod = "GET"
      setRequestProperty("User-Agent", getUserAgentString(profile))
      setRequestProperty("Accept", getAcceptHeader(profile))
      setRequestProperty("X-HWID", getDeviceHwid())
    }

    connection.connect()
    val code = connection.responseCode
    if (code !in 200..299) {
      throw IllegalStateException("HTTP $code ${connection.responseMessage.orEmpty()}".trim())
    }

    val text = connection.inputStream.bufferedReader(StandardCharsets.UTF_8).use { it.readText() }
    if (text.isBlank()) {
      throw IllegalStateException("Сервер вернул пустой ответ.")
    }

    val userInfo = parseSubscriptionUserInfo(getHeaderIgnoreCase(connection, "subscription-userinfo"))
    val name = extractSubscriptionName(connection)
    return FetchedSubscription(text = text, userInfo = userInfo, name = name)
  }

  private fun readUrlAttemptsInternal(
    url: String,
    profile: SubscriptionUserAgent
  ): List<FetchedSubscriptionAttempt> {
    return getRequestProfiles(profile).map { candidate ->
      try {
        FetchedSubscriptionAttempt(
          profile = candidate,
          response = readUrlTextInternal(url, candidate),
          error = null
        )
      } catch (error: Throwable) {
        FetchedSubscriptionAttempt(
          profile = candidate,
          response = null,
          error = error
        )
      }
    }
  }

  private fun getDeviceHwid(): String {
    val raw = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
      ?: "${Build.MANUFACTURER}-${Build.MODEL}"
    val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(StandardCharsets.UTF_8))
    return digest.joinToString("") { "%02x".format(it) }.take(32)
  }
}

private val userAgentByProfile = mapOf(
  SubscriptionUserAgent.EGOISTSHIELD to "EgoistShieldTV/1.0",
  SubscriptionUserAgent.V2RAYN to "v2rayN/6.0",
  SubscriptionUserAgent.SINGBOX to "sing-box/1.13",
  SubscriptionUserAgent.NEKOBOX to "NekoBox/1.0",
  SubscriptionUserAgent.MIHOMO to "Mihomo/1.19",
  SubscriptionUserAgent.CLASH_VERGE to "clash-verge/2.0",
  SubscriptionUserAgent.CLASH_FOR_WINDOWS to "ClashforWindows/0.20.39",
  SubscriptionUserAgent.SHADOWROCKET to "Shadowrocket/2320",
  SubscriptionUserAgent.LOON to "Loon/3.2.5",
  SubscriptionUserAgent.QUANTUMULTX to "Quantumult X/1.0.32",
  SubscriptionUserAgent.SURGE to "Surge/3029",
  SubscriptionUserAgent.CURL to "curl/8.0"
)

private fun getRequestProfiles(profile: SubscriptionUserAgent): List<SubscriptionUserAgent> {
  return if (profile == SubscriptionUserAgent.AUTO) {
    listOf(
      SubscriptionUserAgent.CLASH_FOR_WINDOWS,
      SubscriptionUserAgent.V2RAYN,
      SubscriptionUserAgent.EGOISTSHIELD
    )
  } else {
    listOf(profile)
  }
}

private fun getAcceptHeader(profile: SubscriptionUserAgent): String {
  return when (profile) {
    SubscriptionUserAgent.MIHOMO,
    SubscriptionUserAgent.CLASH_VERGE,
    SubscriptionUserAgent.CLASH_FOR_WINDOWS,
    SubscriptionUserAgent.SURGE -> "text/yaml,text/plain;q=0.9,*/*;q=0.8"
    else -> "text/plain,*/*;q=0.8"
  }
}

private fun getUserAgentString(profile: SubscriptionUserAgent): String {
  return userAgentByProfile[profile] ?: userAgentByProfile.getValue(SubscriptionUserAgent.EGOISTSHIELD)
}

private fun getHeaderIgnoreCase(connection: HttpURLConnection, name: String): String? {
  return connection.headerFields.entries.firstOrNull { (key, _) ->
    key?.equals(name, ignoreCase = true) == true
  }?.value?.firstOrNull()
}

private fun parseSubscriptionUserInfo(header: String?): Map<String, Long>? {
  if (header.isNullOrBlank()) {
    return null
  }

  val result = linkedMapOf<String, Long>()
  header.split(';').forEach { part ->
    val key = part.substringBefore('=', "").trim().lowercase()
    val value = part.substringAfter('=', "").trim().toLongOrNull()
    if (key.isNotBlank() && value != null) {
      result[key] = value
    }
  }
  return result.ifEmpty { null }
}

private fun extractSubscriptionName(connection: HttpURLConnection): String? {
  val profileTitle = getHeaderIgnoreCase(connection, "profile-title")
  if (!profileTitle.isNullOrBlank()) {
    val base64Value = Regex("^base64:(.+)$", RegexOption.IGNORE_CASE)
      .find(profileTitle)
      ?.groupValues
      ?.getOrNull(1)
    if (!base64Value.isNullOrBlank()) {
      return runCatching {
        String(Base64.getDecoder().decode(base64Value), StandardCharsets.UTF_8).trim()
      }.getOrNull()
    }
    return profileTitle.trim()
  }

  val contentDisposition = getHeaderIgnoreCase(connection, "content-disposition")
  if (!contentDisposition.isNullOrBlank()) {
    Regex("filename\\*=(?:UTF-8''|utf-8'')([^;]+)", RegexOption.IGNORE_CASE)
      .find(contentDisposition)
      ?.groupValues
      ?.getOrNull(1)
      ?.let { encoded ->
        return runCatching {
          java.net.URLDecoder.decode(encoded, StandardCharsets.UTF_8).substringBeforeLast('.')
        }.getOrNull()
      }

    Regex("filename=\"?([^\"\\n;]+)\"?", RegexOption.IGNORE_CASE)
      .find(contentDisposition)
      ?.groupValues
      ?.getOrNull(1)
      ?.let { value ->
        return value.substringBeforeLast('.').trim()
      }
  }

  return getHeaderIgnoreCase(connection, "subscription-name")?.trim()
}
