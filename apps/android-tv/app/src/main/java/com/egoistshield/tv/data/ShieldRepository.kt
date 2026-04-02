package com.egoistshield.tv.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.dataStore
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.runtime.EmbeddedSingBoxRuntime
import com.egoistshield.tv.runtime.ImportResolver
import com.egoistshield.tv.runtime.ResolvedSubscription
import com.egoistshield.tv.runtime.RuntimeLaunchRequest
import com.egoistshield.tv.runtime.SingBoxConfigBuilder
import com.egoistshield.tv.runtime.SubscriptionClient
import com.egoistshield.tv.runtime.parseDnsServers
import com.egoistshield.tv.runtime.uniqueNodes
import java.net.URI
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first

private val Context.shieldStore: DataStore<ShieldPersistedState> by dataStore(
  fileName = "shield-state.json",
  serializer = ShieldPersistedStateSerializer
)

data class ImportOutcome(
  val added: Int,
  val subscriptionsAdded: Int,
  val issues: List<String>,
  val firstImportedNodeId: String? = null
)

class ShieldRepository(private val context: Context) {
  private val subscriptionClient = SubscriptionClient(context)
  private val importResolver = ImportResolver(subscriptionClient)

  val state: Flow<ShieldPersistedState> = context.shieldStore.data
  val runtimeStatus = EmbeddedSingBoxRuntime.status

  suspend fun snapshot(): ShieldPersistedState = state.first()

  suspend fun importPayload(payload: String): ImportOutcome {
    if (payload.isBlank()) {
      return ImportOutcome(
        added = 0,
        subscriptionsAdded = 0,
        issues = listOf("Вставьте URI или URL подписки для импорта.")
      )
    }

    val current = snapshot()
    val resolution = importResolver.resolve(payload, current.settings.subscriptionUserAgent)
    val now = Instant.now().toString()
    var added = 0
    var subscriptionsAdded = 0
    var firstImportedNodeId: String? = null

    context.shieldStore.updateData { snapshot ->
      val nodes = snapshot.nodes.toMutableList()
      val subscriptions = snapshot.subscriptions.toMutableList()

      val directUnique = uniqueNodes(nodes, resolution.directNodes)
      if (firstImportedNodeId == null) {
        firstImportedNodeId = directUnique.firstOrNull()?.id
      }
      added += directUnique.size
      nodes += directUnique

      resolution.subscriptions.forEach { resolved ->
        val update = applyResolvedSubscription(
          resolved = resolved,
          existingNodes = nodes,
          subscriptions = subscriptions,
          now = now
        )
        added += update.added
        subscriptionsAdded += update.subscriptionsAdded
        if (firstImportedNodeId == null) {
          firstImportedNodeId = update.firstNodeId
        }
      }

      snapshot.copy(nodes = nodes, subscriptions = subscriptions)
    }

    return ImportOutcome(
      added = added,
      subscriptionsAdded = subscriptionsAdded,
      issues = resolution.issues,
      firstImportedNodeId = firstImportedNodeId
    )
  }

  suspend fun refreshSubscriptions(): ImportOutcome {
    val snapshot = snapshot()
    val enabledSubscriptions = snapshot.subscriptions.filter { it.enabled }
    if (enabledSubscriptions.isEmpty()) {
      return ImportOutcome(
        added = 0,
        subscriptionsAdded = 0,
        issues = listOf("Нет активных подписок для обновления.")
      )
    }

    val now = Instant.now().toString()
    val results = enabledSubscriptions.map { item ->
      try {
        val response = subscriptionClient.readUrlText(item.url, snapshot.settings.subscriptionUserAgent)
        val parsed = com.egoistshield.tv.runtime.parseNodesFromText(response.text)
        ResolvedSubscription(
          url = item.url,
          name = response.name ?: item.name,
          userInfo = response.userInfo,
          nodes = parsed.nodes,
          issues = parsed.issues.map { "[${item.url}] $it" },
          successful = true
        )
      } catch (error: Throwable) {
        val message = error.message ?: "Unknown error"
        ResolvedSubscription(
          url = item.url,
          name = item.name,
          userInfo = null,
          nodes = emptyList(),
          issues = listOf("[${item.url}] Не удалось обновить подписку: $message"),
          successful = false
        )
      }
    }

    var added = 0
    var firstNodeId: String? = null
    context.shieldStore.updateData { current ->
      val nodes = current.nodes.toMutableList()
      val subscriptions = current.subscriptions.toMutableList()

      results.forEach { resolved ->
        val update = applyResolvedSubscription(
          resolved = resolved,
          existingNodes = nodes,
          subscriptions = subscriptions,
          now = now
        )
        added += update.added
        if (firstNodeId == null) {
          firstNodeId = update.firstNodeId
        }
      }

      current.copy(nodes = nodes, subscriptions = subscriptions)
    }

    return ImportOutcome(
      added = added,
      subscriptionsAdded = 0,
      issues = results.flatMap { it.issues },
      firstImportedNodeId = firstNodeId
    )
  }

  suspend fun toggleFavorite(nodeId: String) {
    context.shieldStore.updateData { current ->
      val nextFavorites = if (current.favoriteServerIds.contains(nodeId)) {
        current.favoriteServerIds - nodeId
      } else {
        current.favoriteServerIds + nodeId
      }
      current.copy(favoriteServerIds = nextFavorites.distinct())
    }
  }

  suspend fun setActiveNode(nodeId: String?) {
    context.shieldStore.updateData { current ->
      current.copy(activeNodeId = nodeId)
    }
  }

  suspend fun updateSettings(transform: (AppSettings) -> AppSettings) {
    context.shieldStore.updateData { current ->
      current.copy(settings = transform(current.settings))
    }
  }

  suspend fun updateDnsMode(mode: DnsMode, rawValue: String? = null): String {
    val normalized = if (mode == DnsMode.CUSTOM) {
      parseDnsServers(rawValue ?: snapshot().settings.systemDnsServers).joinToString(", ")
    } else {
      rawValue ?: snapshot().settings.systemDnsServers
    }

    context.shieldStore.updateData { current ->
      current.copy(
        settings = current.settings.copy(
          dnsMode = mode,
          systemDnsServers = normalized
        )
      )
    }

    return normalized
  }

  suspend fun updateCustomDns(rawValue: String): String {
    val normalized = parseDnsServers(rawValue).joinToString(", ")
    context.shieldStore.updateData { current ->
      current.copy(settings = current.settings.copy(systemDnsServers = normalized))
    }
    return normalized
  }

  suspend fun buildConfig(nodeId: String): String? {
    val snapshot = snapshot()
    val node = snapshot.nodes.firstOrNull { it.id == nodeId } ?: return null
    return SingBoxConfigBuilder.build(
      node = node,
      domainRules = snapshot.domainRules,
      processRules = snapshot.processRules,
      settings = snapshot.settings
    )
  }

  suspend fun prepareRuntimeLaunch(nodeId: String): RuntimeLaunchRequest? {
    val snapshot = snapshot()
    val node = snapshot.nodes.firstOrNull { it.id == nodeId }
      ?: return null
    val config = SingBoxConfigBuilder.build(
      node = node,
      domainRules = snapshot.domainRules,
      processRules = snapshot.processRules,
      settings = snapshot.settings
    )
    return EmbeddedSingBoxRuntime.createLaunchRequest(
      context = context,
      nodeId = node.id,
      profileName = node.name,
      configContent = config
    )
  }

  fun prepareVpnPermission() = EmbeddedSingBoxRuntime.prepareVpnPermission(context)

  fun startRuntime(request: RuntimeLaunchRequest) {
    EmbeddedSingBoxRuntime.start(context, request)
  }

  fun stopRuntime() {
    EmbeddedSingBoxRuntime.stop(context)
  }

  fun isRuntimeAvailable(): Boolean = EmbeddedSingBoxRuntime.isAvailable()

  private fun applyResolvedSubscription(
    resolved: ResolvedSubscription,
    existingNodes: MutableList<VpnNode>,
    subscriptions: MutableList<SubscriptionItem>,
    now: String
  ): SubscriptionUpdateResult {
    val existingIndex = subscriptions.indexOfFirst { it.url == resolved.url }
    val existingItem = subscriptions.getOrNull(existingIndex)
    val id = existingItem?.id ?: UUID.randomUUID().toString()
    val existingNodeCount = existingNodes.count { it.subscriptionId == id }

    var added = 0
    var firstNodeId: String? = null
    if (resolved.successful) {
      existingNodes.removeAll { it.subscriptionId == id }
      val attachedNodes = resolved.nodes.map { it.copy(subscriptionId = id) }
      val unique = uniqueNodes(existingNodes, attachedNodes)
      firstNodeId = unique.firstOrNull()?.id
      existingNodes += unique
      added = (unique.size - existingNodeCount).coerceAtLeast(0)
    }

    val updatedItem = SubscriptionItem(
      id = id,
      url = resolved.url,
      name = resolved.name ?: existingItem?.name ?: deriveNameFromUrl(resolved.url),
      enabled = existingItem?.enabled ?: true,
      lastUpdated = if (resolved.successful) now else existingItem?.lastUpdated,
      upload = resolved.userInfo?.get("upload") ?: existingItem?.upload,
      download = resolved.userInfo?.get("download") ?: existingItem?.download,
      total = resolved.userInfo?.get("total") ?: existingItem?.total,
      expire = resolved.userInfo?.get("expire") ?: existingItem?.expire
    )

    var subscriptionsAdded = 0
    if (existingIndex >= 0) {
      subscriptions[existingIndex] = updatedItem
    } else {
      subscriptions += updatedItem
      subscriptionsAdded = 1
    }

    return SubscriptionUpdateResult(
      added = added,
      subscriptionsAdded = subscriptionsAdded,
      firstNodeId = firstNodeId
    )
  }

  private fun deriveNameFromUrl(url: String): String {
    return runCatching {
      val uri = URI(url)
      uri.host ?: url
    }.getOrDefault(url)
  }
}

private data class SubscriptionUpdateResult(
  val added: Int,
  val subscriptionsAdded: Int,
  val firstNodeId: String?
)
