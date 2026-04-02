package com.egoistshield.tv.ui

import android.app.Application
import android.content.Intent
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.egoistshield.tv.data.AppSettings
import com.egoistshield.tv.data.RouteMode
import com.egoistshield.tv.data.ShieldPersistedState
import com.egoistshield.tv.data.ShieldRepository
import com.egoistshield.tv.data.SubscriptionItem
import com.egoistshield.tv.data.VpnNode
import com.egoistshield.tv.model.AppDestination
import com.egoistshield.tv.model.ConnectionMode
import com.egoistshield.tv.model.ConnectionStatus
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.NodeFilter
import com.egoistshield.tv.model.NodeProtocol
import com.egoistshield.tv.model.SessionRecord
import com.egoistshield.tv.model.SettingField
import com.egoistshield.tv.model.SettingsState
import com.egoistshield.tv.model.ShieldNode
import com.egoistshield.tv.model.ShieldUiState
import com.egoistshield.tv.model.SubscriptionFeed
import com.egoistshield.tv.model.label
import com.egoistshield.tv.runtime.EmbeddedRuntimeStage
import com.egoistshield.tv.runtime.EmbeddedRuntimeStatus
import com.egoistshield.tv.runtime.RuntimeLaunchRequest
import com.egoistshield.tv.runtime.RuntimeDiagnostics
import java.net.URI
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.max
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface ShieldUiEvent {
  data class RequestVpnPermission(val intent: Intent) : ShieldUiEvent
}

class ShieldViewModel(application: Application) : AndroidViewModel(application) {
  private val repository = ShieldRepository(application)

  private var persistedState = ShieldPersistedState()
  private var runtimeState = EmbeddedRuntimeStatus()
  private var pendingLaunch: RuntimeLaunchRequest? = null
  private var autoConnectChecked = false

  private val _uiState = MutableStateFlow(ShieldUiState())
  val uiState: StateFlow<ShieldUiState> = _uiState.asStateFlow()

  private val _events = MutableSharedFlow<ShieldUiEvent>()
  val events: SharedFlow<ShieldUiEvent> = _events.asSharedFlow()

  init {
    viewModelScope.launch {
      repository.state.collect { persisted ->
        persistedState = persisted
        _uiState.update { current ->
          mapPersistedState(
            persisted = persisted,
            current = current
          )
        }
        maybeAutoConnectFromState(persisted)
      }
    }

    viewModelScope.launch {
      repository.runtimeStatus.collect { runtime ->
        val previousStage = runtimeState.stage
        runtimeState = runtime
        applyRuntimeState(runtime)

        if (
          previousStage != runtime.stage &&
          runtime.stage in setOf(EmbeddedRuntimeStage.IDLE, EmbeddedRuntimeStage.ERROR) &&
          persistedState.activeNodeId != null
        ) {
          repository.setActiveNode(null)
        }
      }
    }

    viewModelScope.launch {
      RuntimeDiagnostics.entries.collect { entries ->
        _uiState.update {
          it.copy(
            diagnostics = entries.take(6),
            diagnosticsLogPath = RuntimeDiagnostics.logPath()
          )
        }
      }
    }
  }

  fun selectDestination(destination: AppDestination) {
    _uiState.update { it.copy(destination = destination) }
  }

  fun selectNode(nodeId: String) {
    _uiState.update { state ->
      state.copy(
        selectedNodeId = nodeId,
        connectionMode = ConnectionMode.MANUAL
      )
    }
  }

  fun setServerFilter(filter: NodeFilter) {
    _uiState.update { it.copy(serverFilter = filter) }
  }

  fun updateNodeSearchQuery(query: String) {
    _uiState.update { it.copy(nodeSearchQuery = query) }
  }

  fun toggleFavorite(nodeId: String) {
    viewModelScope.launch {
      repository.toggleFavorite(nodeId)
      RuntimeDiagnostics.record("ui", "Обновлён список избранных профилей.")
      _uiState.update { it.copy(lastStatusNote = "Список избранного обновлён.") }
    }
  }

  fun setDnsMode(mode: DnsMode) {
    viewModelScope.launch {
      runCatching {
        repository.updateDnsMode(mode, uiState.value.customDns)
      }.onSuccess { normalized ->
        RuntimeDiagnostics.record("dns", "DNS-профиль переключён на ${mode.label()} ($normalized).")
        _uiState.update {
          it.copy(
            dnsMode = mode,
            customDns = normalized,
            lastStatusNote = "DNS-профиль переключён: ${mode.label()}."
          )
        }
      }.onFailure { error ->
        RuntimeDiagnostics.record("dns", error.message ?: "Не удалось обновить DNS-профиль.", level = "ERROR")
        _uiState.update {
          it.copy(lastStatusNote = error.message ?: "Не удалось обновить DNS-профиль.")
        }
      }
    }
  }

  fun updateCustomDns(value: String) {
    _uiState.update { it.copy(customDns = value) }
  }

  fun applyCustomDns() {
    viewModelScope.launch {
      runCatching {
        repository.updateCustomDns(uiState.value.customDns)
      }.onSuccess { normalized ->
        RuntimeDiagnostics.record("dns", "Пользователь сохранил собственный DNS: $normalized.")
        _uiState.update {
          it.copy(
            dnsMode = DnsMode.CUSTOM,
            customDns = normalized,
            lastStatusNote = "Свой DNS сохранён: $normalized."
          )
        }
      }.onFailure { error ->
        RuntimeDiagnostics.record("dns", error.message ?: "Не удалось сохранить собственный DNS.", level = "ERROR")
        _uiState.update {
          it.copy(lastStatusNote = error.message ?: "Не удалось сохранить свой DNS.")
        }
      }
    }
  }

  fun toggleSetting(field: SettingField) {
    viewModelScope.launch {
      repository.updateSettings { settings ->
        when (field) {
          SettingField.AUTO_CONNECT -> settings.copy(autoConnect = !settings.autoConnect)
          SettingField.AUTO_START -> settings.copy(autoStart = !settings.autoStart)
          SettingField.AUTO_UPDATE -> settings.copy(autoUpdate = !settings.autoUpdate)
          SettingField.NOTIFICATIONS -> settings.copy(notifications = !settings.notifications)
          SettingField.KILL_SWITCH -> settings.copy(killSwitch = !settings.killSwitch)
          SettingField.TELEMETRY -> settings.copy(allowTelemetry = !settings.allowTelemetry)
          SettingField.ROUTE_ALL_TRAFFIC -> settings.copy(
            routeMode = if (settings.routeMode == RouteMode.GLOBAL) RouteMode.SELECTED else RouteMode.GLOBAL
          )
          SettingField.USE_TUN_MODE -> settings.copy(useTunMode = !settings.useTunMode)
        }
      }

      RuntimeDiagnostics.record("settings", "Изменён системный параметр: ${field.name}.")
      _uiState.update { it.copy(lastStatusNote = "Параметры клиента обновлены.") }
    }
  }

  fun smartConnect() {
    if (uiState.value.isBusy) {
      _uiState.update {
        it.copy(lastStatusNote = "Дождитесь завершения текущего перехода подключения.")
      }
      return
    }

    val nodeId = selectBestNodeId(uiState.value.nodes) ?: run {
      _uiState.update {
        it.copy(lastStatusNote = "Сначала импортируйте хотя бы один профиль или подписку.")
      }
      return
    }
    RuntimeDiagnostics.record("connect", "Запрошено быстрое подключение для $nodeId.")
    requestRuntimeLaunch(nodeId, ConnectionMode.SMART)
  }

  fun connectManually(nodeId: String) {
    if (uiState.value.isBusy) {
      _uiState.update {
        it.copy(lastStatusNote = "Клиент уже меняет состояние туннеля. Повторный запуск пока заблокирован.")
      }
      return
    }

    RuntimeDiagnostics.record("connect", "Запрошено ручное подключение для $nodeId.")
    requestRuntimeLaunch(nodeId, ConnectionMode.MANUAL)
  }

  fun disconnect() {
    if (uiState.value.connectionStatus == ConnectionStatus.CONNECTING) {
      RuntimeDiagnostics.record("connect", "Остановка отклонена: туннель ещё запускается.", level = "WARN")
      _uiState.update {
        it.copy(lastStatusNote = "Дождитесь завершения запуска туннеля, затем его можно будет остановить.")
      }
      return
    }

    if (uiState.value.connectionStatus == ConnectionStatus.DISCONNECTING) {
      _uiState.update {
        it.copy(lastStatusNote = "Остановка уже выполняется.")
      }
      return
    }

    if (runtimeState.stage == EmbeddedRuntimeStage.IDLE && uiState.value.connectedNodeId == null) {
      RuntimeDiagnostics.record("connect", "Остановка пропущена: туннель уже не активен.")
      _uiState.update {
        it.copy(lastStatusNote = "Туннель уже остановлен.")
      }
      return
    }

    viewModelScope.launch {
      RuntimeDiagnostics.record("connect", "Запрошена остановка активного туннеля.")
      _uiState.update {
        it.copy(
          connectionStatus = ConnectionStatus.DISCONNECTING,
          lastStatusNote = "Останавливаем встроенный туннель..."
        )
      }
      repository.stopRuntime()
    }
  }

  fun importPayload(payload: String) {
    viewModelScope.launch {
      RuntimeDiagnostics.record("import", "Запущен импорт URI/подписки.")
      _uiState.update {
        it.copy(lastStatusNote = "Импортируем URI и подписки в приложение...")
      }

      val outcome = repository.importPayload(payload)
      val note = buildImportMessage(outcome.added, outcome.subscriptionsAdded, outcome.issues)

      _uiState.update { current ->
        current.copy(
          selectedNodeId = outcome.firstImportedNodeId ?: current.selectedNodeId,
          lastStatusNote = note
        )
      }
      RuntimeDiagnostics.record("import", note)
    }
  }

  fun refreshSubscriptions() {
    viewModelScope.launch {
      RuntimeDiagnostics.record("import", "Запущено обновление активных подписок.")
      _uiState.update {
        it.copy(lastStatusNote = "Обновляем все активные подписки...")
      }

      val outcome = repository.refreshSubscriptions()
      val note = buildImportMessage(outcome.added, outcome.subscriptionsAdded, outcome.issues)
      _uiState.update {
        it.copy(lastStatusNote = note)
      }
      RuntimeDiagnostics.record("import", note)
    }
  }

  fun launchSelectedProfile() {
    val nodeId = uiState.value.selectedNodeId ?: uiState.value.connectedNodeId
    if (nodeId == null) {
      _uiState.update {
        it.copy(lastStatusNote = "Сначала выберите профиль для запуска.")
      }
      return
    }

    requestRuntimeLaunch(nodeId, uiState.value.connectionMode)
  }

  fun onVpnPermissionResult(granted: Boolean) {
    if (!granted) {
      pendingLaunch = null
      RuntimeDiagnostics.record("vpn", "Системное VPN-разрешение отклонено.", level = "WARN")
      _uiState.update {
        it.copy(
          connectionStatus = ConnectionStatus.DISCONNECTED,
          lastStatusNote = "Android не выдал системное разрешение VPN. Туннель не запущен."
        )
      }
      return
    }

    RuntimeDiagnostics.record("vpn", "Системное VPN-разрешение подтверждено.")
    viewModelScope.launch {
      startPendingLaunch()
    }
  }

  private fun requestRuntimeLaunch(nodeId: String, mode: ConnectionMode) {
    val currentState = uiState.value
    if (currentState.isBusy) {
      RuntimeDiagnostics.record("connect", "Новый запуск пропущен: предыдущий переход ещё не завершён.", level = "WARN")
      _uiState.update {
        it.copy(lastStatusNote = "Текущий запуск ещё не завершён. Подождите пару секунд и повторите.")
      }
      return
    }

    if (currentState.connectedNodeId == nodeId && currentState.profilePrepared) {
      RuntimeDiagnostics.record("connect", "Повторный запуск пропущен: профиль уже активен.")
      _uiState.update {
        it.copy(lastStatusNote = "Этот профиль уже активен.")
      }
      return
    }

    val node = uiState.value.nodes.firstOrNull { it.id == nodeId } ?: return

    viewModelScope.launch {
      val request = repository.prepareRuntimeLaunch(nodeId)
      if (request == null) {
        RuntimeDiagnostics.record("connect", "Не удалось подготовить runtime-профиль для $nodeId.", level = "ERROR")
        _uiState.update {
          it.copy(lastStatusNote = "Не удалось подготовить встроенный runtime-профиль.")
        }
        return@launch
      }

      pendingLaunch = request
      val permissionIntent = repository.prepareVpnPermission()
      RuntimeDiagnostics.record(
        "connect",
        if (permissionIntent == null) {
          "Готовим немедленный запуск профиля ${node.name}."
        } else {
          "Для профиля ${node.name} требуется системное VPN-разрешение."
        }
      )
      _uiState.update {
        it.copy(
          selectedNodeId = nodeId,
          connectionMode = mode,
          connectionStatus = ConnectionStatus.CONNECTING,
          lastStatusNote = if (permissionIntent == null) {
            "Запускаем встроенный туннель для ${node.name}."
          } else {
            "Android запросит системное разрешение VPN для профиля ${node.name}."
          }
        )
      }

      if (permissionIntent == null) {
        startPendingLaunch()
      } else {
        _events.emit(ShieldUiEvent.RequestVpnPermission(permissionIntent))
      }
    }
  }

  private suspend fun startPendingLaunch() {
    val request = pendingLaunch ?: return
    pendingLaunch = null

    runCatching {
      repository.setActiveNode(request.nodeId)
      repository.startRuntime(request)
      RuntimeDiagnostics.record("connect", "Foreground service получил профиль ${request.profileName}.")
    }.onFailure { error ->
      repository.setActiveNode(null)
      RuntimeDiagnostics.record("connect", error.message ?: "Не удалось запустить runtime.", level = "ERROR")
      _uiState.update {
        it.copy(
          connectionStatus = ConnectionStatus.DISCONNECTED,
          lastStatusNote = error.message ?: "Не удалось запустить встроенный runtime."
        )
      }
    }
  }

  private fun applyRuntimeState(runtime: EmbeddedRuntimeStatus) {
    _uiState.update { current ->
      current.copy(
        connectionStatus = runtime.stage.toConnectionStatus(),
        connectedNodeId = runtime.activeNodeId,
        selectedNodeId = runtime.activeNodeId ?: current.selectedNodeId,
        runtimeReady = runtime.available,
        runtimeBridgeLabel = runtime.bridgeLabel,
        lastStatusNote = runtime.message.takeIf { it.isNotBlank() } ?: current.lastStatusNote
      )
    }
  }

  private fun maybeAutoConnectFromState(persisted: ShieldPersistedState) {
    if (autoConnectChecked) return
    autoConnectChecked = true

    if (!persisted.settings.autoConnect) {
      RuntimeDiagnostics.record("startup", "Автоподключение отключено в настройках.")
      return
    }

    val activeNodeId = persisted.activeNodeId
    if (activeNodeId.isNullOrBlank()) {
      RuntimeDiagnostics.record("startup", "Автоподключение пропущено: нет активного профиля.")
      return
    }

    if (runtimeState.stage == EmbeddedRuntimeStage.RUNNING) {
      RuntimeDiagnostics.record("startup", "Автоподключение пропущено: runtime уже запущен.")
      return
    }

    RuntimeDiagnostics.record("startup", "Пытаемся восстановить последний активный профиль.")
    requestRuntimeLaunch(activeNodeId, ConnectionMode.MANUAL)
  }
}

private fun mapPersistedState(
  persisted: ShieldPersistedState,
  current: ShieldUiState
): ShieldUiState {
  val favoriteIds = persisted.favoriteServerIds.toSet()
  val recommendedId = selectBestNodeId(persisted.nodes.map { it.toShieldNode(emptyMap(), favoriteIds, null) })
  val subscriptionsById = persisted.subscriptions.associateBy { it.id }
  val nodes = persisted.nodes.map { it.toShieldNode(subscriptionsById, favoriteIds, recommendedId) }
  val connectedNodeId = current.connectedNodeId?.takeIf { connected ->
    nodes.any { it.id == connected }
  }
  val selectedNodeId = current.selectedNodeId
    ?.takeIf { selected -> nodes.any { it.id == selected } }
    ?: connectedNodeId
    ?: nodes.firstOrNull()?.id

  return current.copy(
    nodes = nodes,
    selectedNodeId = selectedNodeId,
    connectedNodeId = connectedNodeId,
    dnsMode = persisted.settings.dnsMode,
    customDns = persisted.settings.systemDnsServers,
    subscriptions = persisted.subscriptions.map { it.toFeed(persisted.nodes, favoriteIds) },
    settings = persisted.settings.toSettingsState(),
    recentSessions = persisted.usageHistory.mapNotNull { usage -> usage.toSessionRecord(persisted.nodes) },
    lastStatusNote = when {
      current.lastStatusNote.isNotBlank() -> current.lastStatusNote
      nodes.isEmpty() -> "Импортируйте URI или подписку, чтобы запустить туннель на Android."
      else -> "Профили загружены. Выберите узел или используйте быстрое подключение."
    }
  )
}

private fun AppSettings.toSettingsState(): SettingsState {
  return SettingsState(
    autoConnect = autoConnect,
    autoStart = autoStart,
    autoUpdate = autoUpdate,
    notifications = notifications,
    killSwitch = killSwitch,
    telemetry = allowTelemetry,
    routeAllTraffic = routeMode == RouteMode.GLOBAL,
    useTunMode = useTunMode
  )
}

private fun VpnNode.toShieldNode(
  subscriptionsById: Map<String, SubscriptionItem>,
  favoriteIds: Set<String>,
  recommendedId: String?
): ShieldNode {
  val premium = metadata["premium"] == "true" || Regex("premium|vip|pro|plus", RegexOption.IGNORE_CASE).containsMatchIn(name)
  val sourceLabel = subscriptionId?.let { subscriptionsById[it]?.name ?: "Удалённый профиль" } ?: "Ручной импорт"
  return ShieldNode(
    id = id,
    name = name,
    protocol = protocol,
    server = server,
    port = port,
    sourceLabel = sourceLabel,
    securityLabel = buildSecurityLabel(this),
    routeHint = buildRouteHint(this),
    premium = premium,
    recommended = id == recommendedId,
    favorite = favoriteIds.contains(id)
  )
}

private fun SubscriptionItem.toFeed(
  nodes: List<VpnNode>,
  favoriteIds: Set<String>
): SubscriptionFeed {
  val nodeCount = nodes.count { it.subscriptionId == id }
  val refreshedAt = lastUpdated
    ?.let { Instant.parse(it).atZone(ZoneId.systemDefault()).format(DateTimeFormatter.ofPattern("HH:mm")) }
    ?: "—"
  val healthLabel = when {
    !enabled -> "Пауза"
    expire != null && expire < Instant.now().epochSecond -> "Истекла"
    lastUpdated == null -> "Ожидание"
    else -> "Синхр."
  }
  val tier = when {
    name?.contains("premium", ignoreCase = true) == true -> "Премиум"
    favoriteIds.isNotEmpty() && nodeCount > 0 -> "Под контролем"
    else -> "Удалённо"
  }
  return SubscriptionFeed(
    id = id,
    name = name ?: runCatching { URI(url).host }.getOrNull().orEmpty().ifBlank { "Удалённый профиль" },
    url = url,
    nodeCount = nodeCount,
    refreshedAt = refreshedAt,
    tier = tier,
    healthLabel = healthLabel,
    enabled = enabled
  )
}

private fun com.egoistshield.tv.data.UsageRecord.toSessionRecord(nodes: List<VpnNode>): SessionRecord? {
  val node = nodes.firstOrNull { it.id == serverId } ?: return null
  return SessionRecord(
    id = id,
    serverName = node.name,
    routeMode = "Подготовленный профиль",
    endedAt = Instant.ofEpochMilli(timestamp)
      .atZone(ZoneId.systemDefault())
      .format(DateTimeFormatter.ofPattern("dd.MM HH:mm")),
    durationLabel = formatDuration(durationSec),
    downloadLabel = formatBytes(down),
    uploadLabel = formatBytes(up)
  )
}

private fun buildSecurityLabel(node: VpnNode): String {
  return when (node.protocol) {
    NodeProtocol.VLESS -> listOf(node.metadata["security"], node.metadata["type"]).filterNotNull().filter { it.isNotBlank() }.joinToString(" / ").ifBlank { "VLESS" }
    NodeProtocol.VMESS -> listOf(node.metadata["tls"], node.metadata["net"]).filterNotNull().filter { it.isNotBlank() }.joinToString(" / ").ifBlank { "VMess" }
    NodeProtocol.TROJAN -> "TLS ${node.metadata["sni"] ?: node.server}"
    NodeProtocol.SHADOWSOCKS -> node.metadata["method"] ?: "Shadowsocks"
    NodeProtocol.SOCKS -> "SOCKS proxy"
    NodeProtocol.HTTP -> if (node.metadata["tls"] == "true") "HTTPS proxy" else "HTTP proxy"
    NodeProtocol.HYSTERIA2 -> "QUIC ${node.metadata["sni"] ?: node.server}"
    NodeProtocol.TUIC -> "TUIC ${node.metadata["sni"] ?: node.server}"
    NodeProtocol.WIREGUARD -> "Туннель WireGuard"
  }
}

private fun buildRouteHint(node: VpnNode): String {
  val transport = node.metadata["type"] ?: node.metadata["net"] ?: node.metadata["network"]
  return when {
    !transport.isNullOrBlank() -> transport.uppercase()
    node.protocol == NodeProtocol.WIREGUARD -> "UDP"
    node.protocol == NodeProtocol.HYSTERIA2 -> "QUIC"
    else -> "Авто"
  }
}

private fun selectBestNodeId(nodes: List<ShieldNode>): String? {
  return nodes
    .sortedWith(
      compareByDescending<ShieldNode> { it.favorite }
        .thenByDescending { it.premium }
        .thenByDescending { protocolWeight(it.protocol) }
        .thenBy { it.name.lowercase() }
    )
    .firstOrNull()
    ?.id
}

private fun protocolWeight(protocol: NodeProtocol): Int = when (protocol) {
  NodeProtocol.WIREGUARD -> 9
  NodeProtocol.HYSTERIA2 -> 8
  NodeProtocol.TUIC -> 7
  NodeProtocol.VLESS -> 6
  NodeProtocol.TROJAN -> 5
  NodeProtocol.VMESS -> 4
  NodeProtocol.SHADOWSOCKS -> 3
  NodeProtocol.SOCKS -> 2
  NodeProtocol.HTTP -> 1
}

private fun buildImportMessage(added: Int, subscriptionsAdded: Int, issues: List<String>): String {
  val okPart = "Импорт завершён: $added новых узлов, $subscriptionsAdded новых подписок."
  val issueCount = issues.size
  return if (issueCount == 0) okPart else "$okPart Замечаний: $issueCount."
}

private fun formatDuration(totalSeconds: Long): String {
  val minutes = max(1L, totalSeconds / 60)
  val hours = minutes / 60
  val restMinutes = minutes % 60
  return if (hours > 0) {
    "${hours} ч ${restMinutes.toString().padStart(2, '0')} мин"
  } else {
    "$restMinutes мин"
  }
}

private fun formatBytes(value: Long): String {
  if (value <= 0) return "0 B"
  val kb = 1024.0
  val mb = kb * 1024
  val gb = mb * 1024
  return when {
    value >= gb -> String.format("%.1f GB", value / gb)
    value >= mb -> String.format("%.1f MB", value / mb)
    value >= kb -> String.format("%.1f KB", value / kb)
    else -> "$value B"
  }
}

private fun EmbeddedRuntimeStage.toConnectionStatus(): ConnectionStatus = when (this) {
  EmbeddedRuntimeStage.STARTING -> ConnectionStatus.CONNECTING
  EmbeddedRuntimeStage.RUNNING -> ConnectionStatus.CONNECTED
  EmbeddedRuntimeStage.STOPPING -> ConnectionStatus.DISCONNECTING
  EmbeddedRuntimeStage.IDLE,
  EmbeddedRuntimeStage.ERROR -> ConnectionStatus.DISCONNECTED
}
