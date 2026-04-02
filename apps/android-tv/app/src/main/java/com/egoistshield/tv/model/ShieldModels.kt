package com.egoistshield.tv.model

import kotlinx.serialization.Serializable

enum class AppDestination {
  DASHBOARD,
  SERVERS,
  DNS,
  SETTINGS
}

enum class ConnectionStatus {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  DISCONNECTING
}

enum class ConnectionMode {
  SMART,
  MANUAL
}

enum class NodeFilter {
  ALL,
  RECOMMENDED,
  FAVORITES,
  PREMIUM
}

@Serializable
enum class DnsMode {
  AUTO,
  SECURE,
  SYSTEM,
  CUSTOM
}

enum class SettingField {
  AUTO_CONNECT,
  AUTO_START,
  AUTO_UPDATE,
  NOTIFICATIONS,
  KILL_SWITCH,
  TELEMETRY,
  ROUTE_ALL_TRAFFIC,
  USE_TUN_MODE
}

@Serializable
enum class NodeProtocol {
  VLESS,
  VMESS,
  TROJAN,
  SHADOWSOCKS,
  SOCKS,
  HTTP,
  HYSTERIA2,
  TUIC,
  WIREGUARD
}

data class ShieldNode(
  val id: String,
  val name: String,
  val protocol: NodeProtocol,
  val server: String,
  val port: Int,
  val sourceLabel: String,
  val securityLabel: String,
  val routeHint: String,
  val premium: Boolean,
  val recommended: Boolean,
  val favorite: Boolean
)

data class SubscriptionFeed(
  val id: String,
  val name: String,
  val url: String,
  val nodeCount: Int,
  val refreshedAt: String,
  val tier: String,
  val healthLabel: String,
  val enabled: Boolean
)

data class SessionRecord(
  val id: String,
  val serverName: String,
  val routeMode: String,
  val endedAt: String,
  val durationLabel: String,
  val downloadLabel: String,
  val uploadLabel: String
)

data class SettingsState(
  val autoConnect: Boolean = false,
  val autoStart: Boolean = false,
  val autoUpdate: Boolean = true,
  val notifications: Boolean = true,
  val killSwitch: Boolean = false,
  val telemetry: Boolean = false,
  val routeAllTraffic: Boolean = true,
  val useTunMode: Boolean = true
)

data class RuntimeDiagnosticEntry(
  val timeLabel: String,
  val levelLabel: String,
  val sourceLabel: String,
  val message: String
)

data class ShieldUiState(
  val destination: AppDestination = AppDestination.DASHBOARD,
  val connectionStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED,
  val connectionMode: ConnectionMode = ConnectionMode.SMART,
  val serverFilter: NodeFilter = NodeFilter.ALL,
  val nodeSearchQuery: String = "",
  val nodes: List<ShieldNode> = emptyList(),
  val selectedNodeId: String? = null,
  val connectedNodeId: String? = null,
  val dnsMode: DnsMode = DnsMode.SECURE,
  val customDns: String = "1.1.1.1, 1.0.0.1",
  val subscriptions: List<SubscriptionFeed> = emptyList(),
  val settings: SettingsState = SettingsState(),
  val recentSessions: List<SessionRecord> = emptyList(),
  val lastStatusNote: String = "Импортируйте URI или подписку, чтобы запустить туннель прямо в приложении.",
  val runtimeReady: Boolean = false,
  val runtimeBridgeLabel: String = "libbox (встроенный)",
  val diagnostics: List<RuntimeDiagnosticEntry> = emptyList(),
  val diagnosticsLogPath: String? = null
) {
  val selectedNode: ShieldNode?
    get() = nodes.firstOrNull { it.id == selectedNodeId }

  val connectedNode: ShieldNode?
    get() = nodes.firstOrNull { it.id == connectedNodeId }

  val isBusy: Boolean
    get() = connectionStatus == ConnectionStatus.CONNECTING || connectionStatus == ConnectionStatus.DISCONNECTING

  val profilePrepared: Boolean
    get() = connectionStatus == ConnectionStatus.CONNECTED && connectedNodeId != null

  val readinessScore: Int
    get() = listOf(
      nodes.isNotEmpty(),
      runtimeReady,
      settings.useTunMode,
      settings.autoStart
    ).count { it } * 25

  val readinessLabel: String
    get() = when {
      readinessScore >= 100 -> "Пиковая готовность"
      readinessScore >= 75 -> "Почти готово"
      readinessScore >= 50 -> "Нужна доводка"
      else -> "Базовая готовность"
    }

  val lastDiagnostic: RuntimeDiagnosticEntry?
    get() = diagnostics.firstOrNull()
}

fun AppDestination.label(): String = when (this) {
  AppDestination.DASHBOARD -> "Центр"
  AppDestination.SERVERS -> "Узлы"
  AppDestination.DNS -> "DNS"
  AppDestination.SETTINGS -> "Параметры"
}

fun AppDestination.title(): String = when (this) {
  AppDestination.DASHBOARD -> "Командный центр"
  AppDestination.SERVERS -> "Центр узлов"
  AppDestination.DNS -> "Центр DNS"
  AppDestination.SETTINGS -> "Система"
}

fun ConnectionMode.label(): String = when (this) {
  ConnectionMode.SMART -> "Быстрое подключение"
  ConnectionMode.MANUAL -> "Ручной маршрут"
}

fun DnsMode.label(): String = when (this) {
  DnsMode.AUTO -> "Авто"
  DnsMode.SECURE -> "Защищённый"
  DnsMode.SYSTEM -> "Системный"
  DnsMode.CUSTOM -> "Свой"
}

fun DnsMode.description(): String = when (this) {
  DnsMode.AUTO -> "Клиент использует управляемый профиль резолверов для базового сценария."
  DnsMode.SECURE -> "Защищённые резолверы попадут прямо в сгенерированный sing-box конфиг."
  DnsMode.SYSTEM -> "Использовать системную DNS-политику устройства и не подменять её в профиле."
  DnsMode.CUSTOM -> "Ручной список DNS для локальной инфраструктуры или любимого провайдера."
}

fun NodeFilter.label(): String = when (this) {
  NodeFilter.ALL -> "Все"
  NodeFilter.RECOMMENDED -> "Рекомендуемые"
  NodeFilter.FAVORITES -> "Избранные"
  NodeFilter.PREMIUM -> "Премиум"
}

fun NodeProtocol.label(): String = when (this) {
  NodeProtocol.VLESS -> "VLESS"
  NodeProtocol.VMESS -> "VMess"
  NodeProtocol.TROJAN -> "Trojan"
  NodeProtocol.SHADOWSOCKS -> "Shadowsocks"
  NodeProtocol.SOCKS -> "SOCKS"
  NodeProtocol.HTTP -> "HTTP"
  NodeProtocol.HYSTERIA2 -> "Hysteria 2"
  NodeProtocol.TUIC -> "TUIC"
  NodeProtocol.WIREGUARD -> "WireGuard"
}
