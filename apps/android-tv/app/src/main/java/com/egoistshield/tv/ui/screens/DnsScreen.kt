package com.egoistshield.tv.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.egoistshield.tv.model.DnsMode
import com.egoistshield.tv.model.ShieldUiState
import com.egoistshield.tv.model.description
import com.egoistshield.tv.model.label
import com.egoistshield.tv.ui.components.FocusableCard
import com.egoistshield.tv.ui.components.MetricPill
import com.egoistshield.tv.ui.components.SectionHeader
import com.egoistshield.tv.ui.theme.ShieldAccent
import com.egoistshield.tv.ui.theme.ShieldBrand
import com.egoistshield.tv.ui.theme.ShieldSuccess
import com.egoistshield.tv.ui.theme.ShieldTextMuted

@Composable
fun DnsScreen(
  state: ShieldUiState,
  isCompact: Boolean,
  onSelectDnsMode: (DnsMode) -> Unit,
  onCustomDnsChange: (String) -> Unit,
  onApplyCustomDns: () -> Unit
) {
  LazyColumn(
    verticalArrangement = Arrangement.spacedBy(if (isCompact) 18.dp else 24.dp),
    contentPadding = PaddingValues(bottom = if (isCompact) 24.dp else 32.dp)
  ) {
    item {
      SectionHeader(
        eyebrow = "Центр DNS",
        title = if (isCompact) "DNS профиля" else "DNS-политика рабочего runtime-профиля",
        body = if (isCompact) {
          "Выберите режим и сохраните адреса резолверов для активного профиля."
        } else {
          "Этот экран управляет резолверами, которые попадают в runtime-конфиг и влияют на реальный туннель."
        },
        compact = isCompact
      )
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          text = "Текущий контур DNS",
          style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
        )
        if (isCompact) {
          Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricPill(label = "Профиль", value = state.dnsMode.label(), modifier = Modifier.fillMaxWidth(), accent = ShieldAccent, compact = true)
            MetricPill(
              label = "Маршрут",
              value = if (state.settings.routeAllTraffic) "Глобально" else "Выборочно",
              modifier = Modifier.fillMaxWidth(),
              accent = ShieldSuccess,
              compact = true
            )
          }
        } else {
          Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            MetricPill(label = "Профиль", value = state.dnsMode.label(), modifier = Modifier.weight(1f), accent = ShieldAccent)
            MetricPill(
              label = "Маршрут",
              value = if (state.settings.routeAllTraffic) "Глобально" else "Выборочно",
              modifier = Modifier.weight(1f),
              accent = ShieldSuccess
            )
            MetricPill(
              label = "TUN",
              value = if (state.settings.useTunMode) "Включён" else "Выключен",
              modifier = Modifier.weight(1f)
            )
          }
        }
      }
    }

    if (isCompact) {
      DnsMode.entries.forEach { mode ->
        item {
          FocusableCard(
            selected = state.dnsMode == mode,
            compact = true,
            onClick = { onSelectDnsMode(mode) }
          ) {
            Text(mode.label(), style = MaterialTheme.typography.titleMedium)
            Text(
              text = mode.description(),
              style = MaterialTheme.typography.bodySmall,
              color = ShieldTextMuted
            )
          }
        }
      }
    } else {
      item {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
          DnsMode.entries.take(2).forEach { mode ->
            FocusableCard(
              modifier = Modifier.weight(1f),
              selected = state.dnsMode == mode,
              onClick = { onSelectDnsMode(mode) }
            ) {
              Text(mode.label(), style = MaterialTheme.typography.titleMedium)
              Text(text = mode.description(), style = MaterialTheme.typography.bodyMedium, color = ShieldTextMuted)
            }
          }
        }
      }

      item {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
          DnsMode.entries.drop(2).forEach { mode ->
            FocusableCard(
              modifier = Modifier.weight(1f),
              selected = state.dnsMode == mode,
              onClick = { onSelectDnsMode(mode) }
            ) {
              Text(mode.label(), style = MaterialTheme.typography.titleMedium)
              Text(text = mode.description(), style = MaterialTheme.typography.bodyMedium, color = ShieldTextMuted)
            }
          }
        }
      }
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          "Свой DNS",
          style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
        )
        Text(
          text = if (isCompact) {
            "Поддерживаются IP и host:port."
          } else {
            "Поддерживаются IP, `host:port` и URL с IP-host. После сохранения значение нормализуется и попадает в сгенерированный sing-box JSON."
          },
          style = MaterialTheme.typography.bodyMedium,
          color = ShieldTextMuted
        )
        OutlinedTextField(
          value = state.customDns,
          onValueChange = onCustomDnsChange,
          modifier = Modifier.fillMaxWidth(),
          label = { Text("Серверы DNS") },
          placeholder = { Text("1.1.1.1, 1.0.0.1") },
          singleLine = true
        )
        if (isCompact) {
          Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Button(
              modifier = Modifier.fillMaxWidth(),
              onClick = {
                onCustomDnsChange("1.1.1.1, 1.0.0.1")
                onApplyCustomDns()
              },
              enabled = !state.isBusy,
              colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
            ) {
              Text("Cloudflare", maxLines = 1)
            }
            OutlinedButton(
              modifier = Modifier.fillMaxWidth(),
              onClick = {
                onCustomDnsChange("94.140.14.14, 94.140.15.15")
                onApplyCustomDns()
              },
              enabled = !state.isBusy
            ) {
              Text("AdGuard", maxLines = 1)
            }
            OutlinedButton(
              modifier = Modifier.fillMaxWidth(),
              onClick = {
                onCustomDnsChange("8.8.8.8, 8.8.4.4")
                onApplyCustomDns()
              },
              enabled = !state.isBusy
            ) {
              Text("Google", maxLines = 1)
            }
          }
        } else {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Button(
              modifier = Modifier.weight(1f),
              onClick = {
                onCustomDnsChange("1.1.1.1, 1.0.0.1")
                onApplyCustomDns()
              },
              enabled = !state.isBusy,
              colors = ButtonDefaults.buttonColors(containerColor = ShieldBrand)
            ) {
              Text("Cloudflare", maxLines = 1)
            }
            OutlinedButton(
              modifier = Modifier.weight(1f),
              onClick = {
                onCustomDnsChange("94.140.14.14, 94.140.15.15")
                onApplyCustomDns()
              },
              enabled = !state.isBusy
            ) {
              Text("AdGuard", maxLines = 1)
            }
            OutlinedButton(
              modifier = Modifier.weight(1f),
              onClick = {
                onCustomDnsChange("8.8.8.8, 8.8.4.4")
                onApplyCustomDns()
              },
              enabled = !state.isBusy
            ) {
              Text("Google", maxLines = 1)
            }
          }
        }
        OutlinedButton(
          modifier = Modifier.fillMaxWidth(),
          enabled = !state.isBusy,
          onClick = onApplyCustomDns
        ) {
          Text(if (state.isBusy) "Подождите завершения перехода" else "Сохранить DNS", maxLines = 1)
        }
      }
    }

    item {
      FocusableCard(compact = isCompact) {
        Text(
          "Диагностика DNS",
          style = if (isCompact) MaterialTheme.typography.titleMedium else MaterialTheme.typography.titleLarge
        )
        Text(
          text = "Текущее значение: ${state.customDns}",
          style = MaterialTheme.typography.bodyMedium,
          color = ShieldTextMuted
        )
        state.lastDiagnostic?.let { entry ->
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
}
