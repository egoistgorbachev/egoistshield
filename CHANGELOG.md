# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [3.0.0] — 2026-02-27

### Архитектура

- **Electron 36.5** desktop VPN-клиент для Windows x64
- **React 19.1** + **TypeScript 5.8** (strict mode)
- **Zustand 5.0** — state management с persist
- **Vite 7.3** + Electron Forge — сборка
- **Tailwind CSS 3.4** — дизайн-система с CSS-переменными

### Функции

- Мульти-core VPN runtime: **Xray-core** + **sing-box**
- Поддержка 9 протоколов: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard
- Импорт конфигов: URI, Base64, JSON (sing-box), YAML (Clash/Mihomo), файлы, подписки
- Split Tunneling по процессам Windows
- Kill Switch через Windows Firewall
- Smart Routing — автовыбор сервера по пингу
- Auto-Fallback — автопереключение при обрыве
- GeoIP-определение — страны серверов по IP
- Speedtest через Cloudflare CDN
- Code splitting — lazy-load 5 экранов
- Тёмная и светлая тема

### Безопасность

- `contextIsolation: true`, `nodeIntegration: false`
- Content Security Policy (CSP)
- **Zod-валидация** всех 11 IPC endpoints
- GeoIP через HTTPS (`ipwho.is`)
- Автообновление через `electron-updater`

### Инфраструктура

- Git-репозиторий инициализирован
- CI/CD: GitHub Actions (Node 20, `tsc --noEmit`, Vitest, `npm audit`)
- 10 unit-тестов (Vitest), 1 E2E (Playwright)
- NSIS-инсталлятор (single-exe)

### Рефакторинг (post-audit)

- Удалено ~460 MB legacy-артефактов (C# backend, build кеши, старый launcher)
- Удалено 30 CSS-правил с `!important` — миграция на семантические токены
- Store разбит на 3 слайса: `connection`, `settings`, `servers` (502 → 63 строки combiner)
- Убраны все `as any` касты из store
- `.gitignore` дополнен (`node_modules`, `dist`, `out`)
- `.editorconfig` переписан для TS/CSS
- `.nvmrc` — фиксация Node 20
- README и ARCHITECTURE обновлены
