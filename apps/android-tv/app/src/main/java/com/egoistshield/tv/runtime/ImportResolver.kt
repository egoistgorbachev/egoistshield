package com.egoistshield.tv.runtime

import com.egoistshield.tv.data.SubscriptionUserAgent
import com.egoistshield.tv.data.VpnNode

data class ResolvedSubscription(
  val url: String,
  val name: String?,
  val userInfo: Map<String, Long>?,
  val nodes: List<VpnNode>,
  val issues: List<String>,
  val successful: Boolean
)

data class ImportResolution(
  val directNodes: List<VpnNode>,
  val subscriptions: List<ResolvedSubscription>,
  val issues: List<String>
)

class ImportResolver(private val subscriptionClient: SubscriptionClient) {
  suspend fun resolve(
    payload: String,
    profile: SubscriptionUserAgent
  ): ImportResolution {
    val parsed = parseNodesFromText(payload)
    val subscriptionUrls = extractSubscriptionUrls(payload)
    if (subscriptionUrls.isEmpty()) {
      return ImportResolution(
        directNodes = parsed.nodes,
        subscriptions = emptyList(),
        issues = parsed.issues.filterNot { it.startsWith("Найдена ссылка подписки") }
      )
    }

    val issues = parsed.issues.filterNot { it.startsWith("Найдена ссылка подписки") }.toMutableList()
    val subscriptions = mutableListOf<ResolvedSubscription>()

    for (url in subscriptionUrls) {
      try {
        val evaluated = evaluateSubscriptionFetch(url, profile)
        val prefixedIssues = evaluated.issues.map { "[$url] $it" }
        subscriptions += ResolvedSubscription(
          url = url,
          name = evaluated.name,
          userInfo = evaluated.userInfo,
          nodes = evaluated.nodes,
          issues = prefixedIssues,
          successful = evaluated.nodes.isNotEmpty()
        )
        issues += prefixedIssues
      } catch (error: Throwable) {
        val message = error.message ?: "Unknown error"
        val issue = "[$url] Не удалось загрузить подписку: $message"
        subscriptions += ResolvedSubscription(
          url = url,
          name = null,
          userInfo = null,
          nodes = emptyList(),
          issues = listOf(issue),
          successful = false
        )
        issues += issue
      }
    }

    return ImportResolution(
      directNodes = parsed.nodes,
      subscriptions = subscriptions,
      issues = issues
    )
  }

  private suspend fun evaluateSubscriptionFetch(
    url: String,
    profile: SubscriptionUserAgent
  ): EvaluatedSubscription {
    val attempts = subscriptionClient.readUrlAttempts(url, profile)
    val parsedAttempts = attempts.mapNotNull { attempt ->
      val response = attempt.response ?: return@mapNotNull null
      val parsed = parseNodesFromText(response.text)
      ParsedAttempt(
        profile = attempt.profile,
        response = response,
        parsed = parsed
      )
    }

    val best = parsedAttempts.maxWithOrNull(
      compareBy<ParsedAttempt> { it.parsed.nodes.size }
        .thenByDescending { issueScore(it.parsed.issues) }
    )

    if (best != null) {
      if (best.parsed.nodes.isNotEmpty()) {
        return EvaluatedSubscription(
          name = best.response.name,
          userInfo = best.response.userInfo,
          nodes = best.parsed.nodes,
          issues = best.parsed.issues
        )
      }

      val mergedIssues = linkedSetOf<String>()
      parsedAttempts.forEach { attempt ->
        if (attempt.parsed.issues.isNotEmpty()) {
          attempt.parsed.issues.forEach { mergedIssues += "[UA:${attempt.profile.name}] $it" }
        }
      }
      attempts.filter { it.error != null }.forEach { attempt ->
        mergedIssues += "[UA:${attempt.profile.name}] Не удалось загрузить вариант подписки: ${attempt.error?.message ?: "Unknown error"}"
      }

      return EvaluatedSubscription(
        name = best.response.name,
        userInfo = best.response.userInfo,
        nodes = emptyList(),
        issues = mergedIssues.ifEmpty { linkedSetOf("Сервер вернул подписку без поддерживаемых узлов.") }.toList()
      )
    }

    throw (attempts.lastOrNull { it.error != null }?.error ?: IllegalStateException("Не удалось загрузить подписку."))
  }
}

private data class ParsedAttempt(
  val profile: SubscriptionUserAgent,
  val response: FetchedSubscription,
  val parsed: ParsedNodes
)

private data class EvaluatedSubscription(
  val name: String?,
  val userInfo: Map<String, Long>?,
  val nodes: List<VpnNode>,
  val issues: List<String>
)

private fun issueScore(issues: List<String>): Int {
  var score = 0
  issues.forEach { issue ->
    score += when {
      issue.contains("HWID", ignoreCase = true) -> 10
      issue.contains("заглушк", ignoreCase = true) -> 8
      issue.contains("пуст", ignoreCase = true) -> 6
      issue.contains("не поддерживается", ignoreCase = true) -> 4
      else -> 1
    }
  }
  return score
}
