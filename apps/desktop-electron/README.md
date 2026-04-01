# EgoistShield Desktop

Desktop-клиент `EgoistShield` для Windows 10/11.

Текущая ветка документации соответствует опубликованному GitHub Release **3.6.0** от **2026-04-01**.

## Что есть в desktop-версии

- **Импорт и подключение поддерживаемых конфигураций узлов**.
- **Встроенные сетевые компоненты** для исполнения конфигураций и маршрутов приложения.
- **Smart Connect + safer handoff**: adaptive health-score выбор узлов, ranking, make-before-break cutover и rollback на предыдущую сессию при срыве нового runtime.
- **Отдельный экран сервисного управления**: профили, автоподбор, диагностика, maintenance-инструменты и очистка Discord-кеша.
- **System DNS Center**: установка и сброс системного DNS Windows с валидацией ввода.
- **Kill Switch**: управление firewall-правилами Windows для защиты при обрыве соединения.
- **Автозапуск и автоматическое восстановление рабочего состояния** с синхронизацией Windows login item при старте приложения.
- **Updater**: ручная проверка новой версии и установка релиза через GitHub Releases.
- **Диагностика**: structured logs, runtime lifecycle, route probe маршрута, runtime diagnostics, connection logs.
- **UI**: dashboard, server list, 3D-globe, usage insights, command palette, polished dark design system.

## Что вошло в 3.6.0

- **Отдельный сервисный экран** собрал в одном месте служебные режимы, профили, maintenance и диагностику вместо разрозненных настроек.
- **Честный route probe** убрал расплывчатые сетевые формулировки и теперь показывает разницу между прямым и управляемым маршрутом.
- **Release polish** синхронизирует автозапуск с Windows startup login item и чище переживает install/update/uninstall цикл.
- **Settings cleanup** оставляет в общих настройках только точку входа в `DNS Center` и сервисные инструменты, без дублирующего управления.

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
- Форматы `sdns://` и некоторые hostname-based secure DNS-схемы нельзя применять напрямую как системный DNS Windows без дополнительного локального DNS-сервиса.
- `Kill Switch`, системный DNS и часть сетевых операций требуют соответствующих прав в Windows.
- Публичное описание продукта намеренно не использует формулировки, которые можно трактовать как обещание доступа к ресурсам с особыми ограничениями доступа.

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
