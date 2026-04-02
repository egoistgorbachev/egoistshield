package com.egoistshield.tv.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.egoistshield.tv.model.ConnectionStatus
import com.egoistshield.tv.model.NodeFilter
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
fun ServersScreen(
  state: ShieldUiState,
  isCompact: Boolean,
  onSelectNode: (String) -> Unit,
  onConnectNode: (String) -> Unit,
  onSmartConnect: () -> Unit,
  onDisconnect: () -> Unit,
  onToggleFavorite: (String) -> Unit,
  onFilterChange: (NodeFilter) -> Unit,
  onSearchQueryChange: (String) -> Unit,
  onImportPayload: (String) -> Unit,
  onRefreshSubscriptions: () -> Unit,
  onLaunchRuntime: () -> Unit
) {
  val filteredNodes = remember(state.nodes, state.serverFilter, state.nodeSearchQuery) {
    val byFilter = when (state.serverFilter) {
      NodeFilter.ALL -> state.nodes
      NodeFilter.RECOMMENDED -> state.nodes.filter { it.recommended }
      NodeFilter.FAVORITES -> state.nodes.filter { it.favorite }
      NodeFilter.PREMIUM -> state.nodes.filter { it.premium }
    }
    val query = state.nodeSearchQuery.trim()
    if (query.isBlank()) {
      byFilter
    } else {
      byFilter.filter { node -> node.matchesQuery(query) }
    }
  }
  val selectedNode = state.selectedNode?.takeIf { current ->
    filteredNodes.any { it.id == current.id }
  } ?: filteredNodes.firstOrNull()
  val isFallbackSelection = state.selectedNodeId != null && selectedNode?.id != state.selectedNodeId
  val filterRows = NodeFilter.entries.toList().chunked(2)
  var importText by rememberSaveable { mutableStateOf("") }
  val focusManager = LocalFocusManager.current
  val submitImport = {
    val payload = importText.trim()
    if (payload.isBlank()) {
      focusManager.clearFocus(force = true)
    } else {
      onImportPayload(payload)
      importText = ""
      focusManager.clearFocus(force = true)
    }
  }

  if (isCompact) {
    LazyColumn(
      modifier = Modifier.fillMaxSize(),
      contentPadding = PaddingValues(bottom = 20.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      item {
        SectionHeader(
          eyebrow = "Центр узлов",
          title = "Узлы и подписки",
          body = "Импортируйте URI, выберите профиль и запускайте его прямо в приложении.",
          compact = true
        )
      }

      item {
        NodeDiscoveryCard(
          query = state.nodeSearchQuery,
          visibleCount = filteredNodes.size,
          totalCount = state.nodes.size,
          isCompact = true,
          onQueryChange = onSearchQueryChange
        )
      }

      item {
        ServerFiltersCard(
          filterRows = filterRows,
          currentFilter = state.serverFilter,
          onFilterChange = onFilterChange
        )
      }

      if (selectedNode != null) {
        item {
          SelectedNodeCard(
            selectedNode = selectedNode,
            state = state,
            isCompact = true,
            isFallbackSelection = isFallbackSelection,
            onConnectNode = onConnectNode,
            onDisconnect = onDisconnect,
            onToggleFavorite = onToggleFavorite,
            onLaunchRuntime = onLaunchRuntime
          )
        }
      }

      item {
        SmartConnectCard(
          state = state,
          isCompact = true,
          onSmartConnect = onSmartConnect,
          onDisconnect = onDisconnect
        )
      }

      item {
        ImportCard(
          isCompact = true,
          importText = importText,
          onImportTextChange = { importText = it },
          onSubmitImport = submitImport,
          isBusy = state.isBusy,
          onRefreshSubscriptions = onRefreshSubscriptions
        )
      }

      item {
        SubscriptionSourcesCard(state = state, isCompact = true)
      }

      if (filteredNodes.isEmpty()) {
        item {
          EmptyNodeCard(isCompact = true)
        }
      } else {
        items(filteredNodes, key = { it.id }) { node ->
          NodeListCard(
            node = node,
            selected = node.id == state.selectedNodeId,
            isCompact = true,
            onClick = { onSelectNode(node.id) }
          )
        }
      }
    }
  } else {
    Row(
      modifier = Modifier.fillMaxSize(),
      horizontalArrangement = Arrangement.spacedBy(24.dp)
    ) {
      Column(
        modifier = Modifier.weight(1.08f),
        verticalArrangement = Arrangement.spacedBy(18.dp)
      ) {
        SectionHeader(
          eyebrow = "Центр узлов",
          title = "Импорт узлов, подписок и запуск встроенного туннеля",
          body = "Здесь клиент принимает URI, собирает рабочий профиль и поддерживает быстрый переход от поиска узла к реальному запуску."
        )

        NodeDiscoveryCard(
          query = state.nodeSearchQuery,
          visibleCount = filteredNodes.size,
          totalCount = state.nodes.size,
          isCompact = false,
          onQueryChange = onSearchQueryChange
        )

        ServerFiltersCard(
          filterRows = filterRows,
          currentFilter = state.serverFilter,
          onFilterChange = onFilterChange
        )

        Box(modifier = Modifier.weight(1f)) {
          if (filteredNodes.isEmpty()) {
            EmptyNodeCard(isCompact = false)
          } else {
            LazyColumn(
              verticalArrangement = Arrangement.spacedBy(16.dp),
              contentPadding = PaddingValues(bottom = 24.dp)
            ) {
              items(filteredNodes, key = { it.id }) { node ->
                NodeListCard(
                  node = node,
                  selected = node.id == state.selectedNodeId,
                  isCompact = false,
                  onClick = { onSelectNode(node.id) }
                )
              }
            }
          }
        }
      }

      LazyColumn(
        modifier = Modifier.weight(0.92f),
        contentPadding = PaddingValues(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp)
      ) {
        if (selectedNode != null) {
          item {
            SelectedNodeCard(
              selectedNode = selectedNode,
              state = state,
              isCompact = false,
              isFallbackSelection = isFallbackSelection,
              onConnectNode = onConnectNode,
              onDisconnect = onDisconnect,
              onToggleFavorite = onToggleFavorite,
              onLaunchRuntime = onLaunchRuntime
            )
          }
        }

        item {
          SmartConnectCard(
            state = state,
            isCompact = false,
            onSmartConnect = onSmartConnect,
            onDisconnect = onDisconnect
          )
        }

        item {
          ImportCard(
              isCompact = false,
              importText = importText,
              onImportTextChange = { importText = it },
              onSubmitImport = submitImport,
              isBusy = state.isBusy,
              onRefreshSubscriptions = onRefreshSubscriptions
            )
          }

        item {
          SubscriptionSourcesCard(state = state, isCompact = false)
        }
      }
    }
  }
}

@Composable
private fun NodeDiscoveryCard(
  query: String,
  visibleCount: Int,
  totalCount: Int,
  isCompact: Boolean,
  onQueryChange: (String) -> Unit
) {
  FocusableCard(compact = isCompact) {
    Text(
      text = "Поиск и выдача",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = if (query.isBlank()) {
        "Фильтруйте выдачу по ролям или начните поиск по имени, адресу, источнику и протоколу."
      } else {
        "Показываем результаты для запроса «$query»."
      },
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    OutlinedTextField(
      value = query,
      onValueChange = onQueryChange,
      modifier = Modifier.fillMaxWidth(),
      singleLine = true,
      label = { Text("Поиск узла") },
      placeholder = { Text("Имя, сервер, протокол или источник") }
    )
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Видимые",
          value = visibleCount.toString(),
          modifier = Modifier.fillMaxWidth(),
          compact = true
        )
        MetricPill(
          label = "Всего",
          value = totalCount.toString(),
          modifier = Modifier.fillMaxWidth(),
          accent = ShieldAccent,
          compact = true
        )
      }
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(
          label = "Видимые",
          value = visibleCount.toString(),
          modifier = Modifier.weight(1f)
        )
        MetricPill(
          label = "Всего",
          value = totalCount.toString(),
          modifier = Modifier.weight(1f),
          accent = ShieldAccent
        )
      }
    }
  }
}

@Composable
private fun ServerFiltersCard(
  filterRows: List<List<NodeFilter>>,
  currentFilter: NodeFilter,
  onFilterChange: (NodeFilter) -> Unit
) {
  Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
    filterRows.forEach { filters ->
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        filters.forEach { filter ->
          if (currentFilter == filter) {
            Button(
              modifier = Modifier.weight(1f),
              onClick = { onFilterChange(filter) },
              colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
            ) {
              Text(filter.label(), maxLines = 1)
            }
          } else {
            OutlinedButton(
              modifier = Modifier.weight(1f),
              onClick = { onFilterChange(filter) }
            ) {
              Text(filter.label(), maxLines = 1)
            }
          }
        }
      }
    }
  }
}

@Composable
private fun EmptyNodeCard(isCompact: Boolean) {
  FocusableCard(compact = isCompact) {
    Text("Пока нет узлов", style = MaterialTheme.typography.titleLarge)
    Text(
      text = "Импортируйте vless://, vmess://, trojan://, ss://, hysteria2://, tuic://, wireguard:// или URL подписки.",
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
  }
}

@Composable
private fun NodeListCard(
  node: ShieldNode,
  selected: Boolean,
  isCompact: Boolean,
  onClick: () -> Unit
) {
  FocusableCard(
    selected = selected,
    compact = isCompact,
    onClick = onClick
  ) {
    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Text(
            text = node.name,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = "${node.server}:${node.port} · ${node.protocol.label()}",
            style = MaterialTheme.typography.bodyMedium,
            color = ShieldTextMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = "${node.sourceLabel} · ${node.securityLabel}",
            style = MaterialTheme.typography.bodyMedium,
            color = ShieldTextMuted,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
          )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          StatusBadge(text = node.routeHint, accent = ShieldBrandLight)
          if (node.favorite) {
            StatusBadge(text = "ИЗБР.", accent = ShieldAccent)
          }
          if (node.recommended) {
            StatusBadge(text = "РЕК.", accent = ShieldSuccess)
          }
        }
      }
    } else {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
          Text(
            text = node.name,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = "${node.server}:${node.port} · ${node.protocol.label()}",
            style = MaterialTheme.typography.bodyMedium,
            color = ShieldTextMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
          Text(
            text = "${node.sourceLabel} · ${node.securityLabel}",
            style = MaterialTheme.typography.bodyMedium,
            color = ShieldTextMuted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )
        }

        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
          StatusBadge(text = node.routeHint, accent = ShieldBrandLight)
          if (node.favorite) {
            StatusBadge(text = "ИЗБР.", accent = ShieldAccent)
          }
          if (node.recommended) {
            StatusBadge(text = "РЕК.", accent = ShieldSuccess)
          }
        }
      }
    }
  }
}

@Composable
private fun SelectedNodeCard(
  selectedNode: ShieldNode,
  state: ShieldUiState,
  isCompact: Boolean,
  isFallbackSelection: Boolean,
  onConnectNode: (String) -> Unit,
  onDisconnect: () -> Unit,
  onToggleFavorite: (String) -> Unit,
  onLaunchRuntime: () -> Unit
) {
  val isConnectedNode = state.connectedNodeId == selectedNode.id && state.connectionStatus == ConnectionStatus.CONNECTED
  val actionEnabled = !state.isBusy

  FocusableCard(compact = isCompact) {
    Text(
      "Выбранный узел",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = selectedNode.name,
      style = if (isCompact) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.headlineLarge,
      maxLines = if (isCompact) 2 else 1,
      overflow = TextOverflow.Ellipsis
    )
    Text(
      text = "${selectedNode.server}:${selectedNode.port} · ${selectedNode.protocol.label()}",
      style = MaterialTheme.typography.bodyLarge,
      color = ShieldTextMuted
    )
    if (isFallbackSelection) {
      Text(
        text = "Текущий выбранный профиль скрыт фильтрами или поиском, поэтому показан первый доступный результат.",
        style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
        color = ShieldTextMuted
      )
    }

    if (isCompact) {
      Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(label = "Источник", value = selectedNode.sourceLabel, modifier = Modifier.fillMaxWidth(), compact = true)
        MetricPill(
          label = "Маршрут",
          value = selectedNode.routeHint,
          modifier = Modifier.fillMaxWidth(),
          accent = ShieldSuccess,
          compact = true
        )
      }
    } else {
      Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        MetricPill(label = "Источник", value = selectedNode.sourceLabel, modifier = Modifier.weight(1f))
        MetricPill(
          label = "Маршрут",
          value = selectedNode.routeHint,
          modifier = Modifier.weight(1f),
          accent = ShieldSuccess
        )
      }
    }

    MetricPill(
      label = "Защита",
      value = selectedNode.securityLabel,
      modifier = Modifier.fillMaxWidth(),
      accent = ShieldAccent
    )

    Column(
      modifier = Modifier.fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = actionEnabled,
        onClick = {
          if (isConnectedNode) {
            onDisconnect()
          } else {
            onConnectNode(selectedNode.id)
          }
        },
        colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
      ) {
        Text(
          text = if (isConnectedNode) {
            "Отключить"
          } else {
            "Подключить"
          },
          maxLines = 1
        )
      }
      OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        enabled = actionEnabled,
        onClick = { onToggleFavorite(selectedNode.id) }
      ) {
        Text(
          text = if (selectedNode.favorite) "Убрать из избранного" else "В избранное",
          maxLines = 1
        )
      }
      OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        enabled = actionEnabled,
        onClick = onLaunchRuntime
      ) {
        Text("Запустить профиль", maxLines = 1)
      }
    }
  }
}

@Composable
private fun SmartConnectCard(
  state: ShieldUiState,
  isCompact: Boolean,
  onSmartConnect: () -> Unit,
  onDisconnect: () -> Unit
) {
  FocusableCard(compact = isCompact) {
    Text(
      "Быстрое подключение",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = "Клиент выберет подходящий профиль и сразу запустит встроенный туннель.",
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    Column(
      modifier = Modifier.fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Button(
        modifier = Modifier.fillMaxWidth(),
        enabled = !state.isBusy && state.nodes.isNotEmpty(),
        onClick = onSmartConnect,
        colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
      ) {
        Text(
          text = if (state.isBusy) "Подождите завершения перехода" else "Запустить быстрое подключение",
          maxLines = 1
        )
      }
      if (state.profilePrepared) {
        OutlinedButton(
          modifier = Modifier.fillMaxWidth(),
          enabled = !state.isBusy,
          onClick = onDisconnect
        ) {
          Text("Остановить подключение", maxLines = 1)
        }
      }
    }
  }
}

@Composable
private fun ImportCard(
  isCompact: Boolean,
  importText: String,
  onImportTextChange: (String) -> Unit,
  onSubmitImport: () -> Unit,
  isBusy: Boolean,
  onRefreshSubscriptions: () -> Unit
) {
  FocusableCard(compact = isCompact) {
    Text(
      "Импорт",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    Text(
      text = "Вставьте URI узла или ссылку на подписку.",
      style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
      color = ShieldTextMuted
    )
    OutlinedTextField(
      value = importText,
      onValueChange = onImportTextChange,
      modifier = Modifier
        .fillMaxWidth()
        .onPreviewKeyEvent { keyEvent ->
          if (keyEvent.type == KeyEventType.KeyUp && (keyEvent.key == Key.Enter || keyEvent.key == Key.NumPadEnter)) {
            onSubmitImport()
            true
          } else {
            false
          }
        },
      label = { Text("URI или ссылка") },
      placeholder = { Text("vless://... или https://example.com/sub") },
      singleLine = true,
      supportingText = { Text("Нажмите Done или Enter, чтобы импортировать сразу.") },
      keyboardOptions = KeyboardOptions(
        keyboardType = KeyboardType.Uri,
        imeAction = ImeAction.Done
      ),
      keyboardActions = KeyboardActions(onDone = { onSubmitImport() }),
      colors = TextFieldDefaults.colors()
    )
    Column(
      modifier = Modifier.fillMaxWidth(),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Button(
        modifier = Modifier.fillMaxWidth(),
        onClick = onSubmitImport,
        enabled = importText.isNotBlank() && !isBusy,
        colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
      ) {
        Text(if (isBusy) "Подождите завершения перехода" else "Импортировать", maxLines = 1)
      }
      OutlinedButton(
        modifier = Modifier.fillMaxWidth(),
        enabled = !isBusy,
        onClick = onRefreshSubscriptions
      ) {
        Text("Обновить подписки", maxLines = 1)
      }
    }
  }
}

@Composable
private fun SubscriptionSourcesCard(state: ShieldUiState, isCompact: Boolean) {
  FocusableCard(compact = isCompact) {
    Text(
      "Источники узлов",
      style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
    )
    if (state.subscriptions.isEmpty()) {
      Text(
        text = "Подключённые подписки появятся здесь после первого импорта.",
        style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
        color = ShieldTextMuted
      )
    } else {
      state.subscriptions.forEach { subscription ->
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column(modifier = Modifier.weight(1f)) {
            Text(subscription.name, style = MaterialTheme.typography.labelLarge)
            Text(
              text = "${subscription.nodeCount} узлов · обновлено ${subscription.refreshedAt}",
              style = MaterialTheme.typography.bodyMedium,
              color = ShieldTextMuted
            )
          }
          StatusBadge(text = subscription.tier, accent = ShieldAccent)
        }
      }
    }
  }
}

private fun ShieldNode.matchesQuery(rawQuery: String): Boolean {
  val query = rawQuery.trim().lowercase()
  if (query.isBlank()) return true
  return listOf(
    name,
    server,
    sourceLabel,
    securityLabel,
    routeHint,
    protocol.label()
  ).any { field ->
    field.lowercase().contains(query)
  }
}
