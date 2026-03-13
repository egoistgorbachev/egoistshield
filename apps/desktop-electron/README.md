# 🛡️ EgoistShield

> Desktop VPN клиент для Windows — быстрый, стабильный, расширяемый.

## Возможности

- 🔒 **9 протоколов**: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard
- ⚡ **Dual-runtime**: Xray + Sing-box с автоматическим fallback
- 🛡️ **Kill Switch**: Блокировка трафика при обрыве VPN (Windows Firewall)
- 🌐 **TUN-режим**: Полный перехват сетевого трафика
- 📡 **Smart Routing**: Автоматический выбор сервера с минимальным пингом
- 🔄 **Подписки**: Импорт и автообновление subscription-ссылок (12 UA-профилей)
- 🎨 **Premium UI**: Дизайн-система «Inferno Core» с glassmorphism и анимациями
- 📊 **Мониторинг**: Реальное время трафик, пинг, GeoIP
- 🔐 **Безопасность**: Sandbox, CSP, IPC Zod-валидация, contextIsolation

## Стек

| Компонент  | Версия       |
| ---------- | ------------ |
| Electron   | 36.5         |
| React      | 19.1         |
| TypeScript | 5.8 (strict) |
| Vite       | 7.3          |
| Zustand    | 5.0          |
| Biome      | 1.9          |

## Быстрый старт

```bash
# Установка
npm install

# Разработка
npm run dev

# Сборка
npm run make

# Тесты
npx vitest run

# Линтинг
npx biome check .
```

## Структура

```
electron/       Main Process (Node.js)
├── main.ts     Entry point
├── preload.ts  contextBridge API
└── ipc/        Бизнес-логика (handlers, vpn-manager, config-builder...)

renderer/       Renderer Process (React)
└── src/
    ├── screens/      5 экранов
    ├── components/   13 компонентов
    ├── store/        Zustand + 3 слайса
    └── styles/       Дизайн-система
```

## Лицензия

Private — только для личного использования.
