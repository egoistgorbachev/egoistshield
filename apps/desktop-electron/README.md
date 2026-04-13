# EgoistShield Desktop

Desktop-клиент `EgoistShield` для Windows 10/11.

Текущая ветка документации соответствует подготовке product-release **4.0.4** от **2026-04-10**.

## Что есть в desktop-версии

- **Импорт и подключение поддерживаемых конфигураций узлов**.
- **Встроенные сетевые компоненты** для исполнения конфигураций и маршрутов приложения.
- **Smart Connect + safer handoff**: adaptive health-score выбор узлов, ranking, make-before-break cutover и rollback на предыдущую сессию при срыве нового runtime.
- **Отдельный экран сервисного управления**: профили, автоподбор, диагностика, maintenance-инструменты и очистка Discord-кеша.
- **System DNS Center**: установка и сброс системного DNS Windows с валидацией ввода.
- **Kill Switch**: управление firewall-правилами Windows для защиты при обрыве соединения.
- **Автозапуск и автоматическое восстановление рабочего состояния** с синхронизацией Windows login item при старте приложения.
- **Updater**: реальная проверка релизного канала и ручной переход на GitHub Releases для скачивания installer.
- **Дополнительный фоновый компонент**: отдельный headless-экран для локальной конфигурации, служебных логов и встроенного обновления совместимого фонового модуля.
- **Диагностика**: structured logs, runtime lifecycle, route probe маршрута, runtime diagnostics, connection logs.
- **UI**: dashboard, server list, 3D-globe, usage insights, command palette, polished dark design system.

## Что вошло в 4.0.4

- **Faster startup shell**: splash больше не держит искусственную паузу на каждый запуск и скрывается сразу после гидрации store.
- **Cheaper dashboard idle motion**: в off-state убраны самые дорогие постоянные анимации, сохранив визуальный характер при активном соединении.
- **Readiness dashboard block**: отключённый dashboard теперь показывает полезную сводку состояния и быстрые переходы вместо пустого воздуха.
- **Lean brand asset generation**: packaging больше не генерирует и не хранит лишние дубли PNG-логотипов.
- **Packaged smoke harness**: добавлен отдельный ручной `npm run test:e2e:packaged` для QA-проверки упакованного `EgoistShield.exe`, production-shell и реального `System DoH` lifecycle.
- **Coverage hardening**: расширены тесты для `system-doh-manager`, `zapret-manager` и `vpn-manager` вокруг recovery, runtime install и handoff edge-cases.

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

Локальная проверка релиза:

```bash
npm run release:verify
```

`release:verify` проверяет наличие installer, `.blockmap`, `latest.yml`, совпадение версии, размеры файлов и обязательные поля release metadata.

Подробный сценарий проверки и публикации 4.0.4: [docs/release-signing.md](./docs/release-signing.md)

Отдельный runbook для packaged smoke: [docs/packaged-smoke.md](./docs/packaged-smoke.md)

## Лицензия

Проект распространяется по лицензии [MIT](../../LICENSE).
