# EgoistShield

Универсальный VPN-клиент нового поколения для Windows: импорт конфигов/ссылок/QR, мульти-core рантайм (Xray + sing-box), split tunneling по процессам и сайтам, Kill Switch.

## Технологии

- **Platform:** Electron 36.5 (Windows x64)
- **Frontend:** React 19.1, TypeScript 5.8 (strict), Tailwind CSS 3.4
- **Bundler:** Vite 7.3 + Electron Forge
- **State:** Zustand 5.0
- **VPN Runtime:** Xray-core + sing-box
- **Installer:** NSIS (electron-builder)
- **Tests:** Vitest (unit), Playwright (E2E)

## Структура

```
apps/desktop-electron/
├── electron/           # Main Process (Node.js)
│   ├── main.ts         # Точка входа Electron
│   ├── preload.ts      # contextBridge → egoistAPI
│   └── ipc/            # IPC обработчики + Zod-валидация
├── renderer/           # Renderer Process (React)
│   └── src/
│       ├── screens/    # Dashboard, ServerList, SplitTunnel, Settings, Onboarding
│       ├── components/ # UI компоненты
│       ├── store/      # Zustand store
│       └── lib/        # Утилиты
├── shared/             # Общие TypeScript типы
├── tests/              # Vitest тесты (10 файлов)
├── e2e/                # Playwright E2E
└── runtime/            # VPN runtime бинарники (xray, sing-box)
```

## Быстрый старт

```bash
cd apps/desktop-electron
npm install
npm run dev
```

## Тесты

```bash
npm test              # Unit-тесты (Vitest)
npm run test:e2e      # E2E (Playwright)
npm run stress        # Stress-тест VPN connect/disconnect
```

## Сборка

```bash
npm run package       # Electron Forge package
npm run build:installer  # NSIS installer (EgoistShield_Setup_*.exe)
```
