<div align="center">
  <img src="assets/egoist-shield-logo.png" width="112" alt="Логотип Egoist Shield" />
  <h1>Egoist Shield</h1>
  <p><strong>Единый командный центр сетевой защиты Windows.</strong></p>
  <p>VPN, DNS/DoH, Запрет, Telegram Proxy и проверяемое восстановление сети — в одном компактном приложении.</p>

  <p>
    <a href="https://github.com/egoist-ai1/egoistshield/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/egoist-ai1/egoistshield?display_name=tag&style=for-the-badge&color=e50914" /></a>
    <a href="https://github.com/egoist-ai1/egoistshield/actions/workflows/verify-release.yml"><img alt="Release verification" src="https://img.shields.io/github/actions/workflow/status/egoist-ai1/egoistshield/verify-release.yml?branch=main&style=for-the-badge&label=release%20verify" /></a>
    <img alt="Windows x64" src="https://img.shields.io/badge/Windows-10%20%7C%2011%20x64-2563eb?style=for-the-badge&logo=windows11&logoColor=white" />
    <a href="LICENSE.txt"><img alt="Personal freeware" src="https://img.shields.io/badge/license-personal%20freeware-16a34a?style=for-the-badge" /></a>
  </p>

  <p>
    <a href="https://github.com/egoist-ai1/egoistshield/releases/latest"><strong>Скачать последнюю версию</strong></a>
    · <a href="docs/troubleshooting.md">Решение проблем</a>
    · <a href="CHANGELOG.md">История изменений</a>
    · <a href="https://boosty.to/eg01stgames"><strong>Поддержать автора</strong></a>
  </p>
</div>

![Главный экран Egoist Shield](docs/images/dashboard.png)

## Что умеет Egoist Shield

- **VPN.** Управляет разрешённой подпиской, показывает фактический туннель, egress, DNS и восстановление соединения.
- **DNS и DoH.** Применяет проверенные профили к физическому uplink, подтверждает resolver readback и восстанавливает точный baseline.
- **Запрет.** Проверяет все встроенные профили, сравнивает полноту доступа и задержку, затем выбирает лучший результат.
- **Telegram Proxy.** Устанавливает собственную фоновую службу, проверяет локальный порт и реальный upstream-маршрут.
- **Система.** Показывает фактическое состояние Windows Update и Microsoft Defender и применяет только подтверждённые действия.
- **Восстановление интернета.** Откатывает только состояние, которым владеет Egoist Shield, не стирая здоровый внешний DNS или чужой VPN.

<table>
  <tr>
    <td width="50%"><strong>DNS / DoH</strong><br />Проверяемое применение и понятный статус источника.</td>
    <td width="50%"><strong>Запрет</strong><br />Полный sweep профилей вместо остановки на первом удачном.</td>
  </tr>
  <tr>
    <td><img src="docs/images/dns.png" alt="Экран DNS и DoH" /></td>
    <td><img src="docs/images/zapret.png" alt="Экран Запрет" /></td>
  </tr>
</table>

## Доверенное обновление

Начиная с 3.5.0 кнопка «Проверить и обновить» выполняет одну атомарную операцию:

```text
stable channel → Ed25519 → size/SHA-256/SHA-512/GitHub digest
              → загрузка .partial → повторная проверка candidate
              → транзакционная установка → перезапуск или rollback
```

Renderer не получает URL, хэш или команду запуска. Старый или подменённый manifest, неизвестный/revoked key, downgrade, изменившийся asset и неожиданный redirect блокируются до запуска EXE.

## Установка

1. Откройте [последний GitHub Release](https://github.com/egoist-ai1/egoistshield/releases/latest).
2. Скачайте `EgoistShield-Setup-<version>.exe`.
3. Сверьте SHA-256 с одноимённым `.sha256` и подписанным `release-manifest.json`.
4. Запустите Setup и подтвердите штатный UAC.

Версия 3.5.2 не имеет CA-trusted Authenticode-подписи. Windows может показать SmartScreen; это ограничение не скрывается. Доверие канала обеспечивается Ed25519-манифестом и точными хэшами. Переход с 3.4.3 на ветку 3.5.x выполняется один раз вручную.

## Приватность и безопасность

- Настройки, журналы и подписки остаются локально; секреты редактируются в diagnostics.
- Системные операции выполняются allowlisted Core-службой, а не произвольным PowerShell из UI.
- Установка/удаление затрагивает только компоненты с доказанным Egoist Shield ownership.
- Исходный код продукта остаётся приватным; этот репозиторий содержит только release metadata, проверяемые артефакты и документацию.

Подробнее: [SECURITY.md](SECURITY.md), [PRIVACY.md](PRIVACY.md), [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).

## Поддержать автора

<p align="center">
  <a href="https://boosty.to/eg01stgames" title="Поддержать Egoist Ai One на Boosty">
    <img src="assets/boosty-support-banner.svg" alt="Поддержать автора Egoist Ai One на Boosty" width="760">
  </a>
</p>
