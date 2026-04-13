# EgoistShield Desktop

Desktop-сетевой хаб `EgoistShield` для Windows 10/11.

Текущая ветка документации соответствует product-release **4.0.11** от **2026-04-13**.

## Что есть в desktop-версии

- **Импорт и локальное управление сетевыми профилями**.
- **Встроенные сетевые компоненты** для исполнения конфигураций и маршрутов приложения.
- **Smart Connect + safer handoff**: adaptive health-score выбор рабочих сценариев, ranking, make-before-break cutover и rollback на предыдущую сессию при срыве нового runtime.
- **Отдельный экран сервисного управления**: профили, автоподбор, диагностика, maintenance-инструменты и очистка Discord-кеша.
- **System DNS Center**: установка и сброс системного DNS Windows с валидацией ввода.
- **Автозапуск и автоматическое восстановление рабочего состояния** с синхронизацией Windows login item при старте приложения.
- **Updater**: реальная проверка релизного канала и ручной переход на GitHub Releases для скачивания installer.
- **Дополнительный фоновый компонент**: скрытый встроенный runtime для локальной конфигурации, служебных логов и встроенного обновления совместимого фонового модуля.
- **Диагностика**: structured logs, runtime lifecycle, route probe маршрута, runtime diagnostics, connection logs.
- **UI**: dashboard, server list, 3D-globe, usage insights, command palette, polished dark design system.

## Что вошло в 4.0.11

- **Hidden background runtime**: встроенный сетевой модуль больше не должен появляться отдельным окном, консолью или элементом в трее.
- **Managed runtime self-heal**: старые фоновые сборки автоматически заменяются скрытым runtime при запуске приложения.
- **GitHub release sync**: `Setup.exe`, `.blockmap` и `latest.yml` синхронизированы с release-каналом `4.0.11`.
- **Packaged smoke harness**: отдельный `npm run test:e2e:packaged` закрепляет QA-проверку production-shell и реального `System DoH` lifecycle.
- **Coverage hardening**: расширены тесты для `system-doh-manager`, сетевых runtime manager-ов и release/update edge-cases.

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
npm run test:e2e:packaged
npm run build:vite
npm run release:verify
npm run dist
```

## Что важно знать

- `System DNS Center` работает с системными DNS Windows и ожидает корректные IP-адреса DNS-серверов.
- Форматы `sdns://` и некоторые hostname-based secure DNS-схемы нельзя применять напрямую как системный DNS Windows без дополнительного локального DNS-сервиса.
- Системный DNS и часть сетевых операций требуют соответствующих прав в Windows.
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

Локальная проверка релиза:

```bash
npm run release:verify
```

`release:verify` проверяет наличие installer, `.blockmap`, `latest.yml`, совпадение версии, размеры файлов и обязательные поля release metadata.

Подробный сценарий проверки и публикации 4.0.11: [docs/release-signing.md](./docs/release-signing.md)

Отдельный runbook для packaged smoke: [docs/packaged-smoke.md](./docs/packaged-smoke.md)

## Лицензия

Проект распространяется по лицензии [MIT](../../LICENSE).
