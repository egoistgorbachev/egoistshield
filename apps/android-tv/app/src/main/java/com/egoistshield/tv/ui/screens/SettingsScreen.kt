package com.egoistshield.tv.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.egoistshield.tv.model.SettingField
import com.egoistshield.tv.model.ShieldUiState
import com.egoistshield.tv.ui.components.FocusableCard
import com.egoistshield.tv.ui.components.MetricPill
import com.egoistshield.tv.ui.components.SectionHeader
import com.egoistshield.tv.ui.theme.ShieldAccent
import com.egoistshield.tv.ui.theme.ShieldBrandLight
import com.egoistshield.tv.ui.theme.ShieldSuccess
import com.egoistshield.tv.ui.theme.ShieldTextMuted

@Composable
fun SettingsScreen(
  state: ShieldUiState,
  isCompact: Boolean,
  onToggleSetting: (SettingField) -> Unit
) {
  val options = listOf(
    SettingOption(
      field = SettingField.AUTO_CONNECT,
      title = "Автоподключение",
      description = "Быстро восстанавливает выбранный профиль для следующего запуска.",
      enabled = state.settings.autoConnect
    ),
    SettingOption(
      field = SettingField.AUTO_START,
      title = "Автозапуск",
      description = "Готовит приложение к запуску из лаунчера и после перезапуска устройства.",
      enabled = state.settings.autoStart
    ),
    SettingOption(
      field = SettingField.AUTO_UPDATE,
      title = "Автообновление подписок",
      description = "Поддерживает удалённые подписки в актуальном состоянии.",
      enabled = state.settings.autoUpdate
    ),
    SettingOption(
      field = SettingField.NOTIFICATIONS,
      title = "Уведомления",
      description = "Показывает изменения статуса профиля, импорта и работы runtime.",
      enabled = state.settings.notifications
    ),
    SettingOption(
      field = SettingField.KILL_SWITCH,
      title = "Блокировка трафика",
      description = "Резерв для жёсткого контроля трафика при обрыве туннеля.",
      enabled = state.settings.killSwitch
    ),
    SettingOption(
      field = SettingField.ROUTE_ALL_TRAFFIC,
      title = "Маршрутизировать весь трафик",
      description = "Переключает режим между глобальным и выборочным маршрутом.",
      enabled = state.settings.routeAllTraffic
    ),
    SettingOption(
      field = SettingField.USE_TUN_MODE,
      title = "Использовать TUN",
      description = "Добавляет TUN inbound в итоговый конфиг runtime.",
      enabled = state.settings.useTunMode
    ),
    SettingOption(
      field = SettingField.TELEMETRY,
      title = "Телеметрия",
      description = "Подготавливает диагностику для будущей расширенной аналитики.",
      enabled = state.settings.telemetry
    )
  )

  LazyColumn(
    verticalArrangement = Arrangement.spacedBy(if (isCompact) 18.dp else 24.dp),
    contentPadding = PaddingValues(bottom = if (isCompact) 24.dp else 32.dp)
  ) {
    item {
      SectionHeader(
        eyebrow = "Система",
        title = if (isCompact) "Параметры" else "Параметры встроенного Android runtime",
        body = if (isCompact) {
          "Настройки профиля, подписок и итогового sing-box JSON."
        } else {
          "Экран уже управляет настройками, которые влияют на persist-состояние, remote subscriptions и итоговый sing-box JSON."
        },
        compact = isCompact
      )
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          text = "Стабильность и совместимость",
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
              label = "Готовность",
              value = "${state.readinessScore}%",
              modifier = Modifier.fillMaxWidth(),
              accent = ShieldBrandLight,
              compact = true
            )
            MetricPill(
              label = "Ядро",
              value = if (state.runtimeReady) "Онлайн" else "Проверить",
              modifier = Modifier.fillMaxWidth(),
              accent = if (state.runtimeReady) ShieldSuccess else ShieldAccent,
              compact = true
            )
          }
        } else {
          Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricPill(
              label = "Готовность",
              value = "${state.readinessScore}%",
              modifier = Modifier.weight(1f),
              accent = ShieldBrandLight
            )
            MetricPill(
              label = "Ядро",
              value = if (state.runtimeReady) "Онлайн" else "Проверить",
              modifier = Modifier.weight(1f),
              accent = if (state.runtimeReady) ShieldSuccess else ShieldAccent
            )
            MetricPill(
              label = "Диагностика",
              value = state.diagnostics.size.toString(),
              modifier = Modifier.weight(1f),
              compact = false
            )
          }
        }
      }
    }

    items(options, key = { it.field.name }) { option ->
      FocusableCard(compact = isCompact, onClick = { onToggleSetting(option.field) }) {
        if (isCompact) {
          Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(option.title, style = MaterialTheme.typography.titleMedium)
            Text(option.description, style = MaterialTheme.typography.bodySmall, color = ShieldTextMuted)
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Text(
                text = if (option.enabled) "Включено" else "Выключено",
                style = MaterialTheme.typography.labelLarge,
                color = ShieldTextMuted
              )
              Switch(checked = option.enabled, onCheckedChange = null)
            }
          }
        } else {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column(
              modifier = Modifier.weight(1f),
              verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
              Text(option.title, style = MaterialTheme.typography.titleLarge)
              Text(text = option.description, style = MaterialTheme.typography.bodyMedium, color = ShieldTextMuted)
            }
            Switch(checked = option.enabled, onCheckedChange = null)
          }
        }
      }
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          "Состояние ядра",
          style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
        )
        Text(
          text = if (state.runtimeReady) {
            "Встроенное libbox-ядро готово. Профили запускаются прямо внутри APK без внешнего backend."
          } else {
            "libbox-ядро пока недоступно. Проверьте инициализацию движка или перезапустите приложение."
          },
          style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
          color = ShieldTextMuted
        )
        Text(
          text = "Ядро: ${state.runtimeBridgeLabel}",
          style = MaterialTheme.typography.labelLarge
        )
        Text(
          text = "Состояние перехода: ${if (state.isBusy) "выполняется" else "стабильно"}",
          style = MaterialTheme.typography.bodySmall,
          color = ShieldTextMuted
        )
        Text(
          text = "Автозапуск: ${if (state.settings.autoStart) "включён" else "выключен"}",
          style = MaterialTheme.typography.bodySmall,
          color = ShieldTextMuted
        )
        Text(
          text = "Автоподключение: ${if (state.settings.autoConnect) "включено" else "выключено"}",
          style = MaterialTheme.typography.bodySmall,
          color = ShieldTextMuted
        )
      }
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          text = "Диагностика подключения",
          style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
        )
        Text(
          text = if (isCompact) {
            "Последние события foreground runtime, VPN service и автозапуска."
          } else {
            "Последние события foreground runtime, системного VPN service, автозапуска и DNS-операций."
          },
          style = if (isCompact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.bodyMedium,
          color = ShieldTextMuted
        )
        if (state.diagnostics.isEmpty()) {
          Text(
            text = "Журнал ещё пуст. После импорта, запуска или ошибки здесь появятся последние записи.",
            style = MaterialTheme.typography.bodySmall,
            color = ShieldTextMuted
          )
        } else {
          Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            state.diagnostics.forEach { entry ->
              Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
          }
        }
        state.diagnosticsLogPath?.let { path ->
          Text(
            text = "Локальный лог: $path",
            style = MaterialTheme.typography.bodySmall,
            color = ShieldTextMuted
          )
        }
      }
    }
  }
}

private data class SettingOption(
  val field: SettingField,
  val title: String,
  val description: String,
  val enabled: Boolean
)
