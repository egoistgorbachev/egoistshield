# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.4] — 2026-02-27

### ✨ UI/UX Модернизация

- **Glassmorphism** — все карточки Dashboard, Settings и SplitTunnel используют glass-card стиль с backdrop-blur
- **Noise overlay** — текстурированный шум на SettingsCard для глубины
- **Расширенные дизайн-токены** — `--es-glass-*`, `--es-ease-out-expo`, `--es-duration-slow`, `--es-shadow-lg`
- **Micro-animations** — pulse-glow, shimmer, float, fade-in-up keyframes + Tailwind animation presets
- **TitleBar** — Framer Motion масштабирование кнопок, gradient фон, hover glow на Close
- **BottomNav** — pulse-glow на Shield кнопке при connected, анимированный кольцевой индикатор
- **SplashScreen** — GPU-ускорение (will-change, transform-gpu), shimmer на progress bar, badge v1.0.4
- **SpeedGraph** — SVG glow filter, пульсирующая endpoint точка, усиленный gradient fill, useMemo мемоизация
- **Dashboard** — text-glow для статуса, glass-card на все info-карточки, GPU-ускорение floating particles
- **Settings** — glassmorphism + noise-overlay на SettingsCard
- **Motion presets** — добавлены `glassCard`, `buttonPulse`, `toggleSwitch`, `shimmerEffect`

### 🔧 Фиксы

- 5 пустых `catch {}` в main.ts → информативные `console.warn`
- Дублирование `before-quit` обработчиков → объединено в один
- Хардкод портов (9090, 10085) → константы `SINGBOX_TRAFFIC_URL`, `XRAY_API_PORT`
- Удалён несуществующий тип Screen `'logs'`
- Удалена неиспользуемая зависимость `electron-vite`

### 📦 Инфраструктура

- Версия обновлена до 1.0.4

## [1.0.1] — 2026-02-27

Первый публичный релиз EgoistShield — десктопный VPN-клиент для Windows.

### Возможности

- Мульти-core VPN runtime: Xray-core v26.2.6 + sing-box v1.12.22
- Поддержка 9 протоколов: VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard
- Импорт конфигов: URI, Base64, JSON, YAML (Clash/Mihomo), файлы, подписки с автообновлением
- Split Tunneling по процессам Windows
- Kill Switch через Windows Firewall
- Smart Routing — автовыбор сервера по пингу
- Auto-Fallback — автопереключение при обрыве
- GeoIP-определение стран серверов (HTTPS)
- Speedtest через Cloudflare CDN
- Тёмная и светлая темы
- Code splitting — lazy-load экранов
- Автообновление через electron-updater

### Технологии

- Electron 36.5, React 19.1, TypeScript 5.8 (strict)
- Vite 7.3 + Electron Forge, Tailwind CSS 3.4
- Zustand 5.0 (state management, slice architecture)
- NSIS installer (single-exe)

### Безопасность

- contextIsolation + Content Security Policy
- Zod-валидация всех 11 IPC endpoints
- GeoIP через HTTPS (ipwho.is)

### Инфраструктура

- CI/CD: GitHub Actions (tsc --noEmit, Vitest, npm audit)
- 10 unit-тестов (Vitest), 1 E2E (Playwright)
