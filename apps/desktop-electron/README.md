# EgoistShield Desktop

Desktop-клиент `EgoistShield` для Windows 10/11.

Текущая ветка документации соответствует опубликованному GitHub Release **3.6.0** от **2026-04-01**.

## Что есть в desktop-версии

- **Мультипротокольный импорт и подключение**: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard.
- **Dual-runtime**: Xray + Sing-box.
- **Smart Connect + safer handoff**: adaptive health-score выбор узлов, protocol-aware ranking, make-before-break cutover и rollback на предыдущую сессию при срыве нового runtime.
- **Zapret Control / Flowseal**: отдельный экран для standalone/service-режима, профилей, автоподбора, диагностики, maintenance-инструментов и очистки Discord-кеша.
- **System DNS Center**: установка и сброс системного DNS Windows с валидацией ввода.
- **Kill Switch**: управление firewall-правилами Windows для защиты при обрыве соединения.
- **Автозапуск и авто-подключение** с синхронизацией Windows login item при старте приложения.
- **Updater**: ручная проверка новой версии и установка релиза через GitHub Releases.
- **Диагностика**: structured logs, runtime lifecycle, honest route probe, runtime diagnostics, connection logs.
- **UI**: dashboard, server list, 3D-globe, usage insights, command palette, polished dark design system.

## Что вошло в 3.6.0

- **Zapret Control** собрал в одном месте службу, standalone-режим, профили, Flowseal maintenance и диагностику вместо разрозненных настроек.
- **Honest route probe** заменил псевдо-`dns leak test`: UI теперь честно показывает direct/VPN egress-маршруты.
- **Release polish** синхронизирует автозапуск с Windows startup login item и чище переживает install/update/uninstall цикл.
- **Settings cleanup** оставляет в общих настройках только точку входа в `DNS Center` и `Zapret Control`, без дублирующего управления.

## Стек

| Компонент | Версия |
| --- | --- |
| Electron | 36.9.5 |
| React | 19.1.0 |
| TypeScript | 5.8.3 |
| Vite | 7.3.1 |
| Zustand | 5.0.11 |
| Zod | 3.24.x |
| Vitest | 3.1.2 |
| Playwright | 1.58.x |

## Структура

```text
electron/                 Main process, IPC, runtime orchestration
renderer/src/             React UI, store, screens, design system
shared/                   Shared runtime types and DNS parser
tests/                    Unit and integration tests
e2e/                      Playwright scenarios
packaging/                Installer, icons, builder assets and scripts
```

## Основные команды

```bash
npm install
npm run test
npm run stress
npm run test:e2e
npm run build:vite
npm run dist
```

## Что важно знать

- `System DNS Center` работает с системными DNS Windows и ожидает корректные IP-адреса DNS-серверов.
- Форматы `sdns://` и некоторые hostname-based secure DNS-схемы нельзя применять напрямую как системный DNS Windows без локального DNS-прокси.
- `Kill Switch`, системный DNS и часть сетевых операций требуют соответствующих прав в Windows.
- Публичное описание продукта намеренно не использует формулировки, которые можно трактовать как обещание обхода законно установленных ограничений.

## Сборка релиза

```bash
npm run dist
```

Артефакты релиза появятся в:

```text
apps/desktop-electron/out/dist/
```

Ожидаемый набор для GitHub Release:

```text
EgoistShield-<version>-Setup.exe
EgoistShield-<version>-Setup.exe.blockmap
latest.yml
```

## Лицензия

Проект распространяется по лицензии [MIT](../../LICENSE).
