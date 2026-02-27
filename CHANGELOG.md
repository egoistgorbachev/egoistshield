# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [1.0.7] — 2026-02-27

### 💎 «Void Prism» — Новый 3D Логотип и Иконки

- **Новый Логотип**: Изометрическая 3D модель `Void Prism` с GSAP анимациями (орбитальные кольца, пульсация ядра, левитация).
- **Новые Иконки (App Icons)**: Интегрирован новый дизайн во все ярлыки Windows (`.ico`), иконки системного трея и `favicon`.
- Цветовой респонс (Indigo -> Emerald) при подключении выведен на передний план.

## [1.0.6] — 2026-02-27

### 🌌 «Void Obsidian» — Полный UI Редизайн v2

- **GSAP 3.12** интеграция: 3D tilt shield, magnetic buttons, counter animations, GSAP Timeline splash
- **Canvas 2D частицы**: 55 интерактивных точек, mouse repulsion, connection lines, emerald/indigo color shift
- **Новая палитра**: cool indigo-violet (#818CF8) + void black (#030308) вместо warm orange
- **Circular Speed Gauge**: 270° arc с gradient stroke + GSAP animated fill (вместо линейного графика)
- **Dock-style навигация**: GSAP magnetic hover (scale + y shift), back.out/elastic.out easing
- **SplashScreen**: GSAP Timeline — grid materialization → shield back.out → ring progress
- **TitleBar**: ultra-minimal «ES» + magnetic window controls
- **Типографика**: Outfit (display) + Inter (body) + JetBrains Mono (metrics)
- **Glass panels**: unified CSS utility с CSS variables
- **3D Tilt**: shield реагирует на позицию мыши через perspective transform

## [1.0.5] — 2026-02-27

### 🎨 Premium Cyber-Luxury Dark Редизайн

- **Палитра**: Deep indigo-black (#050508) с синим подтоном, warm white (#F0EDE8) текст
- **Aurora Mesh Background**: 3 анимированных orb с drift-animation на Dashboard и SplashScreen
- **Floating BottomNav**: Pill shape с glass blur, sliding `layoutId` active indicator
- **Shield кнопка**: Rotating conic-gradient ring, ambient glow при подключении
- **Неоновый SpeedGraph**: Двойной stroke с neon glow filter, grid pattern, scan line
- **SplashScreen**: Aurora orbs + conic spinning progress ring (вместо linear bar)
- **Типографика**: Space Grotesk (заголовки) + JetBrains Mono (метрики/пинг)
- **Settings**: Luxury glass cards с gradient underline, gradient toggle fill, inner shadows
- **TitleBar**: Transparent gradient glass с animated brand text
- **Dot matrix overlay**: Subtle 16px grid pattern на фонах
- **Inner shadows**: Многослойные тени для глубины на всех карточках

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
