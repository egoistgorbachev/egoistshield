package com.egoistshield.tv.ui.screens

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.egoistshield.tv.R
import com.egoistshield.tv.model.ConnectionStatus
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.ShieldNode
import com.egoistshield.tv.model.ShieldUiState
import com.egoistshield.tv.model.label
import com.egoistshield.tv.ui.components.FocusableCard
import com.egoistshield.tv.ui.components.MetricPill
import com.egoistshield.tv.ui.components.SectionHeader
import com.egoistshield.tv.ui.components.StatusBadge
import com.egoistshield.tv.ui.theme.ShieldAccent
import com.egoistshield.tv.ui.theme.ShieldBrand
import com.egoistshield.tv.ui.theme.ShieldBrandLight
import com.egoistshield.tv.ui.theme.ShieldSuccess
import com.egoistshield.tv.ui.theme.ShieldTextMuted

@Composable
fun DashboardScreen(
  state: ShieldUiState,
  isCompact: Boolean,
  onSmartConnect: () -> Unit,
  onDisconnect: () -> Unit,
  onOpenServers: () -> Unit,
  onOpenSettings: () -> Unit,
  onLaunchRuntime: () -> Unit
) {
  val heroNode = state.connectedNode ?: state.selectedNode

  LazyColumn(
    verticalArrangement = Arrangement.spacedBy(if (isCompact) 18.dp else 24.dp),
    contentPadding = PaddingValues(bottom = if (isCompact) 24.dp else 32.dp)
  ) {
    item {
      SectionHeader(
        eyebrow = "EgoistShield",
        title = if (isCompact) {
          if (state.profilePrepared) "Профиль активен" else "Готов к подключению"
        } else {
          "Android клиент со встроенным VPN runtime"
        },
        body = state.lastStatusNote,
        compact = isCompact
      )
    }

    if (isCompact) {
      item {
        DashboardHeroCard(
          state = state,
          heroNode = heroNode,
          isCompact = true,
          onSmartConnect = onSmartConnect,
          onDisconnect = onDisconnect,
          onOpenServers = onOpenServers,
          onLaunchRuntime = onLaunchRuntime
        )
      }

      item { DashboardHealthCard(state = state, isCompact = true) }
      item { DashboardSummaryCard(state = state, isCompact = true) }
      item { DashboardActiveProfileCard(heroNode = heroNode, isCompact = true) }

      if (state.subscriptions.isNotEmpty()) {
        item {
          DashboardSubscriptionsCard(
            state = state,
            isCompact = true
          )
        }
      }

      if (state.lastDiagnostic != null) {
        item { DashboardDiagnosticsPeekCard(state = state, isCompact = true) }
      }
    } else {
      item {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
          DashboardHeroCard(
            modifier = Modifier.weight(1.18f),
            state = state,
            heroNode = heroNode,
            isCompact = false,
            onSmartConnect = onSmartConnect,
            onDisconnect = onDisconnect,
            onOpenServers = onOpenServers,
            onLaunchRuntime = onLaunchRuntime
          )

          Column(
            modifier = Modifier.weight(0.82f),
            verticalArrangement = Arrangement.spacedBy(18.dp)
          ) {
            DashboardSummaryCard(state = state, isCompact = false)
            DashboardHealthCard(state = state, isCompact = false)
            DashboardQuickActionsCard(onOpenServers = onOpenServers, onOpenSettings = onOpenSettings)
          }
        }
      }

      item {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
          DashboardActiveProfileCard(
            modifier = Modifier.weight(1f),
            heroNode = heroNode,
            isCompact = false
          )
          DashboardSubscriptionsCard(
            modifier = Modifier.weight(1f),
            state = state,
            isCompact = false
          )
        }
      }

      if (state.lastDiagnostic != null) {
        item { DashboardDiagnosticsPeekCard(state = state, isCompact = false) }
      }
    }

    if (state.recentSessions.isNotEmpty() || !isCompact) {
      item {
        DashboardRecentSessionsCard(
          state = state,
          isCompact = isCompact
        )
      }
    }
  }
}

@Composable
private fun DashboardHeroCard(
  state: ShieldUiState,
  heroNode: ShieldNode?,
  isCompact: Boolean,
  onSmartConnect: () -> Unit,
  onDisconnect: () -> Unit,
  onOpenServers: () -> Unit,
  onLaunchRuntime: () -> Unit,
  modifier: Modifier = Modifier
) {
  FocusableCard(
    modifier = modifier,
    compact = isCompact,
    onClick = if (state.profilePrepared) onDisconnect else onSmartConnect
  ) {
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(14.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          Image(
            painter = painterResource(id = R.drawable.ic_shield_logo),
            contentDescription = null,
            modifier = Modifier.size(56.dp)
          )
          Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            DashboardStatusBadge(state = state)
            Text(
              text = if (state.profilePrepared) "Туннель запущен" else "Туннель не запущен",
              style = MaterialTheme.typography.titleLarge,
              maxLines = 2,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
        Text(
          text = heroNode?.let { "${it.name} · ${it.protocol.label()} · ${it.sourceLabel}" }
            ?: "Импортируйте URI или подписку, а затем запустите профиль прямо в приложении.",
          style = MaterialTheme.typography.bodySmall,
          color = ShieldTextMuted,
          maxLines = 3,
          overflow = TextOverflow.Ellipsis
        )
        DashboardPrimaryActions(
          heroNode = heroNode,
          state = state,
          isCompact = true,
          onSmartConnect = onSmartConnect,
          onDisconnect = onDisconnect,
          onOpenServers = onOpenServers,
          onLaunchRuntime = onLaunchRuntime
        )
      }
    } else {
      Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp)
      ) {
        Box(contentAlignment = Alignment.Center) {
          Image(
            painter = painterResource(id = R.drawable.ic_shield_logo),
            contentDescription = null,
            modifier = Modifier.size(112.dp)
          )
        }

        Column(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          DashboardStatusBadge(state = state)
          Text(
            text = if (state.profilePrepared) "Туннель запущен" else "Туннель не запущен",
            style = MaterialTheme.typography.headlineMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = heroNode?.let { "${it.name} · ${it.protocol.label()} · ${it.sourceLabel}" }
              ?: "Импортируйте URI или подписку, после чего запустите туннель прямо в приложении.",
            style = MaterialTheme.typography.bodyLarge,
            color = ShieldTextMuted,
            maxLines = 3,
            overflow = TextOverflow.Ellipsis
          )

          DashboardPrimaryActions(
            heroNode = heroNode,
            state = state,
            isCompact = false,
            onSmartConnect = onSmartConnect,
            onDisconnect = onDisconnect,
            onOpenServers = onOpenServers,
            onLaunchRuntime = onLaunchRuntime
          )
        }
      }
    }
  }
}

@Composable
private fun DashboardStatusBadge(state: ShieldUiState) {
  StatusBadge(
    text = when (state.connectionStatus) {
      ConnectionStatus.CONNECTED -> "АКТИВЕН"
      ConnectionStatus.CONNECTING -> "ЗАПУСК"
      ConnectionStatus.DISCONNECTING -> "ОСТАНОВКА"
      ConnectionStatus.DISCONNECTED -> "ОЖИДАНИЕ"
    },
    accent = if (state.profilePrepared) ShieldSuccess else ShieldBrandLight
  )
}

@Composable
private fun DashboardPrimaryActions(
  heroNode: ShieldNode?,
  state: ShieldUiState,
  isCompact: Boolean,
  onSmartConnect: () -> Unit,
  onDisconnect: () -> Unit,
  onOpenServers: () -> Unit,
  onLaunchRuntime: () -> Unit
) {
  Column(
    modifier = Modifier.fillMaxWidth(),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    Button(
      modifier = Modifier.fillMaxWidth(),
      enabled = !state.isBusy && (state.profilePrepared || state.nodes.isNotEmpty()),
      onClick = if (state.profilePrepared) onDisconnect else onSmartConnect,
      colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
    ) {
      Text(
        text = when {
          state.isBusy -> "Подождите завершения перехода"
          state.profilePrepared -> "Отключить"
          else -> "Быстрое подключение"
        },
        maxLines = 1
      )
    }
    OutlinedButton(
      modifier = Modifier.fillMaxWidth(),
      enabled = heroNode == null || !state.isBusy,
      onClick = if (heroNode != null) onLaunchRuntime else onOpenServers
    ) {
      Text(
        text = if (heroNode != null) {
          "Запустить профиль"
        } else {
          "Открыть узлы"
        },
        maxLines = 1
      )
    }
  }
}

@Composable
private fun DashboardSummaryCard(
  state: ShieldUiState,
  isCompact: Boolean
) {
  val dnsSummaryValue = when (state.dnsMode) {
    DnsMode.SECURE -> "Защита"
    else -> state.dnsMode.label()
  }
  val runtimeSummaryValue = when {
    state.isBusy -> "Переход"
    state.runtimeReady -> "Готово"
    else -> "Ошибка"
  }

  FocusableCard(compact = isCompact) {
    Text(
      text = "Сводка профилей",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          MetricPill(
            label = "Узлы",
            value = state.nodes.size.toString(),
            modifier = Modifier.weight(1f),
            compact = true
          )
          MetricPill(
            label = "Подписки",
            value = state.subscriptions.size.toString(),
            modifier = Modifier.weight(1f),
            accent = ShieldAccent,
            compact = true
          )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
          MetricPill(
            label = "DNS",
            value = dnsSummaryValue,
            modifier = Modifier.weight(1f),
            compact = true
          )
          MetricPill(
            label = "Ядро",
            value = runtimeSummaryValue,
            modifier = Modifier.weight(1f),
            accent = if (state.runtimeReady) ShieldSuccess else ShieldBrandLight,
            compact = true
          )
        }
      }
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Узлы",
          value = state.nodes.size.toString(),
          modifier = Modifier.weight(1f)
        )
        MetricPill(
          label = "Подписки",
          value = state.subscriptions.size.toString(),
          modifier = Modifier.weight(1f),
          accent = ShieldAccent
        )
      }
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "DNS",
          value = dnsSummaryValue,
          modifier = Modifier.weight(1f)
        )
        MetricPill(
          label = "Ядро",
          value = runtimeSummaryValue,
          modifier = Modifier.weight(1f),
          accent = if (state.runtimeReady) ShieldSuccess else ShieldBrandLight
        )
      }
    }
  }
}

@Composable
private fun DashboardHealthCard(
  state: ShieldUiState,
  isCompact: Boolean
) {
  FocusableCard(compact = isCompact) {
    Text(
      text = "Готовность клиента",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = state.readinessLabel,
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Score",
          value = "${state.readinessScore}%",
          modifier = Modifier.fillMaxWidth(),
          accent = ShieldBrandLight,
          compact = true
        )
        MetricPill(
          label = "Автозапуск",
          value = if (state.settings.autoStart) "Готов" else "Вручную",
          modifier = Modifier.fillMaxWidth(),
          accent = ShieldSuccess,
          compact = true
        )
      }
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Score",
          value = "${state.readinessScore}%",
          modifier = Modifier.weight(1f),
          accent = ShieldBrandLight
        )
        MetricPill(
          label = "Автозапуск",
          value = if (state.settings.autoStart) "Готов" else "Вручную",
          modifier = Modifier.weight(1f),
          accent = ShieldSuccess
        )
      }
    }
  }
}

@Composable
private fun DashboardQuickActionsCard(
  onOpenServers: () -> Unit,
  onOpenSettings: () -> Unit
) {
  FocusableCard {
    Text("Быстрые действия", style = MaterialTheme.typography.titleLarge)
    Text(
      text = "Импортируйте профили, настраивайте DNS и запускайте встроенный туннель без внешнего backend.",
      style = MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    Spacer(modifier = Modifier.height(2.dp))
    Column(
      modifier = Modifier.fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        onClick = onOpenServers
      ) {
        Text("Центр узлов", maxLines = 1)
      }
      OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        onClick = onOpenSettings
      ) {
        Text("Настройки", maxLines = 1)
      }
    }
  }
}

@Composable
private fun DashboardDiagnosticsPeekCard(
  state: ShieldUiState,
  isCompact: Boolean
) {
  val entry = state.lastDiagnostic ?: return
  FocusableCard(compact = isCompact) {
    Text(
      text = "Последнее событие",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = "${entry.timeLabel} • ${entry.levelLabel} • ${entry.sourceLabel}",
      style = MaterialTheme.typography.labelLarge,
      color = ShieldTextMuted
    )
    Text(
      text = entry.message,
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium
    )
  }
}

@Composable
private fun DashboardActiveProfileCard(
  heroNode: ShieldNode?,
  isCompact: Boolean,
  modifier: Modifier = Modifier
) {
  FocusableCard(
    modifier = modifier,
    compact = isCompact
  ) {
    Text(
      text = "Активный профиль",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = heroNode?.name ?: "Пока не выбран",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge
    )
    Text(
      text = heroNode?.let { "${it.server}:${it.port} · ${it.securityLabel}" }
        ?: "Выберите узел в центре узлов или используйте быстрое подключение.",
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Источник",
          value = heroNode?.sourceLabel ?: "—",
          modifier = Modifier.fillMaxWidth(),
          compact = true
        )
        MetricPill(
          label = "Маршрут",
          value = heroNode?.routeHint ?: "—",
          modifier = Modifier.fillMaxWidth(),
          accent = ShieldAccent,
          compact = true
        )
      }
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Источник",
          value = heroNode?.sourceLabel ?: "—",
          modifier = Modifier.weight(1f)
        )
        MetricPill(
          label = "Маршрут",
          value = heroNode?.routeHint ?: "—",
          modifier = Modifier.weight(1f),
          accent = ShieldAccent
        )
      }
    }
  }
}

@Composable
private fun DashboardSubscriptionsCard(
  state: ShieldUiState,
  isCompact: Boolean,
  modifier: Modifier = Modifier
) {
  FocusableCard(
    modifier = modifier,
    compact = isCompact
  ) {
    Text(
      text = "Подписки",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    if (state.subscriptions.isEmpty()) {
      Text(
        text = "После импорта URL подписки здесь появится её статус, время синка и количество профилей.",
        style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
        color = ShieldTextMuted
      )
    } else {
      state.subscriptions.take(3).forEach { subscription ->
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(subscription.name, style = MaterialTheme.typography.labelLarge)
            Text(
              text = "${subscription.nodeCount} узлов · ${subscription.refreshedAt}",
              style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
              color = ShieldTextMuted
            )
          }
          StatusBadge(text = subscription.healthLabel, accent = ShieldSuccess)
        }
      }
    }
  }
}

@Composable
private fun DashboardRecentSessionsCard(
  state: ShieldUiState,
  isCompact: Boolean
) {
  FocusableCard(compact = isCompact) {
    Text(
      text = "Последние сессии",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    if (state.recentSessions.isEmpty()) {
      Text(
        text = "История появится после добавления live-статистики и расширенной телеметрии встроенного runtime.",
        style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
        color = ShieldTextMuted
      )
    } else {
      state.recentSessions.forEach { session ->
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
              Text(session.serverName, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
              Text(
                text = "${session.routeMode} · ${session.endedAt}",
                style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
                color = ShieldTextMuted
              )
            }
            Text(
              text = session.durationLabel,
              style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium
            )
          }
          Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
              text = "${session.downloadLabel} ↓",
              style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
              color = ShieldBrandLight
            )
            Text(
              text = "${session.uploadLabel} ↑",
              style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
              color = ShieldAccent
            )
          }
        }
      }
    }
  }
}
