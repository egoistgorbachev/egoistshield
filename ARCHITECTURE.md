# Архитектура EgoistShield v3.0

## Обзор

Electron desktop VPN-клиент для Windows x64. Два процесса: Main (Node.js) и Renderer (React).

## Архитектура

```
desktop-electron/
├── electron/           # Main Process (Node.js)
│   ├── main.ts         # Точка входа Electron
│   │                   # Tray, single instance, auto-updater, traffic monitoring
│   ├── preload.ts      # contextBridge → egoistAPI
│   └── ipc/            # IPC обработчики
│       ├── handlers.ts       # Роутер всех IPC вызовов (Zod-валидация)
│       ├── ipc-schemas.ts    # Zod-схемы для IPC inputs
│       ├── vpn-manager.ts    # Управление runtime (xray/sing-box)
│       ├── config-builder.ts # Генерация конфигов для runtime
│       ├── kill-switch.ts    # Windows Firewall Kill Switch
│       ├── subscription-utils.ts  # Утилиты подписок (UA, fetch, dedup)
│       ├── runtime-installer.ts   # Автоустановка xray/sing-box с GitHub
│       ├── state-store.ts    # JSON persistence в userData
│       ├── node-parser.ts    # Парсинг VPN узлов
│       ├── import-resolver.ts # Определение источника импорта
│       ├── port-utils.ts     # Утилиты портов
│       ├── system-proxy.ts   # Windows системный прокси
│       ├── contracts.ts      # Реэкспорт типов
│       └── parsers/          # Парсеры конфигурационных форматов
│           ├── uri-parsers.ts    # vless://, vmess://, trojan://, ss://, hysteria2://, tuic://
│           ├── json-parser.ts    # sing-box JSON конфиги
│           ├── clash-parser.ts   # Clash/Mihomo YAML конфиги
│           └── parser-utils.ts   # Общие утилиты парсинга
│
├── renderer/           # Renderer Process (React 19)
│   └── src/
│       ├── App.tsx            # Корневой компонент (code splitting, AnimatePresence)
│       ├── main.tsx           # React entry + ErrorBoundary + Toaster
│       ├── screens/           # 5 экранов
│       │   ├── Dashboard.tsx  # Главный экран: connect/disconnect, скорость, трафик
│       │   ├── ServerList.tsx # Список серверов с ping, GeoIP, виртуализация
│       │   ├── SplitTunnel.tsx # Split tunneling по процессам
│       │   ├── Settings.tsx   # Настройки: DNS, Kill Switch, тема, протокол
│       │   └── Onboarding.tsx # First run wizard
│       ├── components/        # 10 UI компонентов
│       ├── store/useAppStore.ts  # Zustand с persist (localStorage)
│       ├── lib/               # Утилиты (api, cn, country-detector, motion)
│       ├── hooks/             # useOnlineStatus
│       ├── styles/globals.css # Дизайн-токены (dark/light), Tailwind base
│       └── types/electron.d.ts # Типизация window.egoistAPI
│
├── shared/types.ts     # Единый источник TypeScript типов
├── tests/              # 10 Unit-тестов (Vitest)
├── e2e/                # 1 E2E тест (Playwright)
└── runtime/            # VPN runtime бинарники
    ├── xray/           # Xray Core
    └── sing-box/       # sing-box
```

## IPC API

```
Renderer ──[egoistAPI]──> Preload ──[ipcRenderer.invoke]──> Main Process
```

| Группа         | Методы                                                                       |
| -------------- | ---------------------------------------------------------------------------- |
| `state`        | get, set                                                                     |
| `import`       | text, file                                                                   |
| `subscription` | refreshOne, refreshAll                                                       |
| `vpn`          | connect, disconnect, status, diagnose, stressTest, onFallback                |
| `runtime`      | installXray, installAll                                                      |
| `app`          | isAdmin, isFirstRun, markFirstRunDone                                        |
| `system`       | pickFile, listProcesses, getAppIcon, ping, pingActiveProxy, speedtest, geoip |
| `window`       | minimize, close                                                              |
| `traffic`      | onUpdate, offUpdate                                                          |
| `updater`      | onUpdateAvailable                                                            |

## Безопасность

- `contextIsolation: true`, `nodeIntegration: false`
- Content Security Policy в `index.html`
- Zod-валидация всех IPC inputs (`ipc-schemas.ts`)
- GeoIP через HTTPS (`ipwho.is`)
- Автообновление через `electron-updater`

## Протоколы VPN

vless, vmess, trojan, shadowsocks, socks, http, hysteria2, tuic, wireguard
