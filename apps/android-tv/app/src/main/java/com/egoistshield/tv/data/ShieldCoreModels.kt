package com.egoistshield.tv.data

import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.NodeProtocol
import kotlinx.serialization.Serializable

@Serializable
enum class RuleMode {
  VPN,
  DIRECT,
  BLOCK
}

@Serializable
enum class RouteMode {
  GLOBAL,
  SELECTED
}

@Serializable
enum class SubscriptionUserAgent {
  AUTO,
  EGOISTSHIELD,
  V2RAYN,
  SINGBOX,
  NEKOBOX,
  MIHOMO,
  CLASH_VERGE,
  CLASH_FOR_WINDOWS,
  SHADOWROCKET,
  LOON,
  QUANTUMULTX,
  SURGE,
  CURL
}

@Serializable
data class VpnNode(
  val id: String,
  val name: String,
  val protocol: NodeProtocol,
  val server: String,
  val port: Int,
  val uri: String,
  val metadata: Map<String, String> = emptyMap(),
  val subscriptionId: String? = null
)

@Serializable
data class ProcessRule(
  val id: String,
  val process: String,
  val mode: RuleMode
)

@Serializable
data class DomainRule(
  val id: String,
  val domain: String,
  val mode: RuleMode
)

@Serializable
data class SubscriptionItem(
  val id: String,
  val url: String,
  val name: String? = null,
  val enabled: Boolean = true,
  val lastUpdated: String? = null,
  val upload: Long? = null,
  val download: Long? = null,
  val total: Long? = null,
  val expire: Long? = null
)

@Serializable
data class AppSettings(
  val autoStart: Boolean = false,
  val startMinimized: Boolean = false,
  val autoUpdate: Boolean = true,
  val autoConnect: Boolean = false,
  val notifications: Boolean = true,
  val useTunMode: Boolean = true,
  val killSwitch: Boolean = false,
  val allowTelemetry: Boolean = false,
  val dnsMode: DnsMode = DnsMode.SECURE,
  val systemDnsServers: String = "1.1.1.1, 1.0.0.1",
  val subscriptionUserAgent: SubscriptionUserAgent = SubscriptionUserAgent.AUTO,
  val runtimePath: String = "",
  val routeMode: RouteMode = RouteMode.GLOBAL,
  val zapretProfile: String = "disabled",
  val zapretSuspendDuringVpn: Boolean = true
)

@Serializable
data class UsageRecord(
  val id: String,
  val timestamp: Long,
  val serverId: String,
  val ping: Int = 0,
  val down: Long = 0,
  val up: Long = 0,
  val durationSec: Long = 0
)

@Serializable
data class ShieldPersistedState(
  val nodes: List<VpnNode> = emptyList(),
  val activeNodeId: String? = null,
  val subscriptions: List<SubscriptionItem> = emptyList(),
  val processRules: List<ProcessRule> = emptyList(),
  val domainRules: List<DomainRule> = emptyList(),
  val settings: AppSettings = AppSettings(),
  val usageHistory: List<UsageRecord> = emptyList(),
  val favoriteServerIds: List<String> = emptyList()
)
