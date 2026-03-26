# EgoistShield Desktop

Desktop-клиент `EgoistShield` для Windows 10/11.

Текущая ветка документации соответствует релизному состоянию **3.3.0**.

## Что есть в desktop-версии

- **Мультипротокольный импорт и подключение**: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard.
- **Dual-runtime**: Xray + Sing-box.
- **Smart Connect v3.3 handoff**: adaptive health-score выбор узлов, protocol-aware ranking, make-before-break cutover, rollback на предыдущую сессию при срыве нового runtime.
- **System DNS Center**: установка и сброс системного DNS Windows с валидацией ввода.
- **Kill Switch**: управление firewall-правилами Windows для защиты при обрыве соединения.
- **Автозапуск и авто-подключение**.
- **Updater**: ручная проверка новой версии и установка релиза через GitHub Releases.
- **Диагностика**: structured logs, runtime lifecycle, runtime diagnostics, DNS leak test, connection logs.
- **UI**: dashboard, server list, 3D-globe, usage insights, command palette, polished dark design system.

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

Инсталлятор появится в:

```text
apps/desktop-electron/out/dist/
```

## Лицензия

Проект распространяется по лицензии [MIT](../../LICENSE).
