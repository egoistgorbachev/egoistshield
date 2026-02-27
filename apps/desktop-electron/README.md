# EgoistShield Desktop (Electron)

## Стек
- Electron Forge 7
- React 19 + TypeScript + Vite
- IPC-архитектура main/preload/renderer

## Что реализовано
- Полностью русский интерфейс и компактный desktop-layout.
- Реальные кнопки и разделы: главная, узлы, подписки, маршрутизация, диагностика, настройки.
- Импорт конфигов: текст/ссылки, файл, QR-код с изображения.
- Подключение VPN через встроенный runtime-процесс `xray.exe`.
- Runtime `xray` встраивается в сборку автоматически.
- В интерфейсе доступно восстановление runtime, если файлы повреждены.
- Режим «Только выбранные сайты» использует PAC-маршрутизацию на Windows.
- Системный прокси Windows включается/отключается при connect/disconnect.
- Сборка настроена на запуск с правами администратора (`requireAdministrator`).

## Команды
```bash
npm install
npm run dev
npm run test
npm run stress
npm run build:win
npm run build:installer
npm run build:single-exe
```

## Установщик
- Команда: `npm run build:installer`
- Результат:
  - `out/make/nsis/EgoistShield_Setup_2.0.0.exe`
  - копия: `artifacts/release-electron/installer/EgoistShield_Setup_2.0.0.exe`

## Один EXE без установки
- Команда: `npm run build:single-exe`
- Результат:
  - `packaging/output/EgoistShield_single.exe`
  - копия в `artifacts/release-electron/single-exe/EgoistShield_single.exe`
- При первом запуске файл сам распакует runtime в `%LOCALAPPDATA%\EgoistShield\runtime\2.0.0-beta.1` и запустит UI.
- При первом запуске файл сам распакует runtime в `%LOCALAPPDATA%\EgoistShield\runtime\2.0.0` и запустит UI.

## Runtime
`xray.exe` подготавливается скриптом сборки `npm run ensure:runtime` и включается в итоговый пакет.
Ручной путь в интерфейсе не требуется.
