# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [1.8.4] — 2026-03-13

### 🔄 Автообновление + Оформление репозитория

#### ✨ Новое
- **Кнопка «Проверить обновления»** в Настройках (4 состояния: idle → checking → upToDate/available/error)
- **Тогл «Автообновление»** — включение/выключение автоматической загрузки новых версий
- **IPC `updater:check`** — ручная проверка обновлений через кнопку
- **IPC `updater:set-auto`** — управление autoDownload из UI
- **События `update-not-available` / `update-error`** → обратная связь в renderer

#### 📝 Репозиторий
- README полностью переработан — HTML-таблица возможностей, раздел «Интерфейс», FAQ, лицензия
- Юридический аудит — убраны названия anti-DPI протоколов из README
- `publish.private` → `false` (репо публичное)
- GitHub Topics: vpn, windows, vpn-client, privacy

## [1.8.3] — 2026-03-13

### 🔬 UI/UX Audit v4 — Performance + DRY

#### ⚡ Performance
- **Sidebar glow ring**: Framer Motion (always GPU) → CSS-only `.animate-glow-pulse`
- **Dashboard ambient glow**: Framer Motion → CSS-only `.animate-glow-pulse-slow`
- **Status text transition**: `filter: blur(4px)` (full repaint) → `scale: 0.95` (compositor-only)
- **[NEW] `glow-pulse` keyframe** + `.animate-glow-pulse` / `.animate-glow-pulse-slow`

#### 🎨 Inline → Tailwind DRY
- **InternetFixButton**: 3 conditional JS objects → Tailwind cn() (bg-gradient-to-br)
- **ServerItem active**: inline bg/border/shadow → Tailwind cn() + arbitrary values
- **ServerItem active bar**: inline gradient+shadow → Tailwind bg-gradient-to-b
- **Sidebar shield body**: inline gradient+shadow → Tailwind cn() + arbitrary values

## [1.8.2] — 2026-03-13

### 🔬 UI/UX Audit v3 — 8 улучшений

#### ⚡ Performance
- **Power Button focus ring**: Framer Motion (always GPU) → CSS-only `.animate-pulse-ring` (zero idle cost)
- **[NEW] `pulse-ring` keyframe** для compositor-thread анимации

#### 🎨 Дизайн-система
- **[NEW] `.sidebar-panel`** CSS utility: Sidebar nav bg/blur/border/shadow из inline → DRY
- **[NEW] `.glass-panel`** CSS utility: SettingsCard из inline → DRY (единый glass стиль)
- **Skeleton IP Card**: shimmer loading для Dashboard IP (Skeleton.tsx теперь используется)

#### ♿ Контраст
- **text-white/60 → text-muted**: 5 мест (Settings, SplitTunnel, ServerList, Onboarding)
- **text-white/70 → text-muted**: 4 места (Settings tooltip, ServerList empty, Onboarding)
- **text-white/80 → text-white/85**: 4 места (Settings heading/labels, ServerList, ServerItem)

## [1.8.1] — 2026-03-13

### 🔬 UI/UX Audit v2 — 10 улучшений

#### ⚡ Микроинтеракции
- **InfoCard CSS hover**: `-translate-y-1px` + border brightening + shadow upgrade + `active:scale-0.98` (60fps, compositor)
- **InternetFixButton**: `hover:brightness-110` + `active:scale-0.98`
- **WinButton**: удалён no-op `whileHover={{ scale: 1 }}`

#### ♿ Доступность
- **SplitTunnel ARIA**: `role="tablist"` + `role="tab"` + `aria-selected` (паритет с ServerList)
- **Eye button**: `aria-label="Показать/Скрыть IP"` для screen readers
- **text-white/50 → text-muted**: 28 мест мигрированы (Dashboard, SplitTunnel, Settings, ServerList, Onboarding, AddServerModal, ErrorBoundary)

#### 🎨 Дизайн-система
- **[NEW] `.glass-card`** CSS utility: единый стиль для всех карточек (DRY замена 85+ inline styles)
- **[NEW] `Skeleton.tsx`**: shimmer gradient компонент для loading states
- **Globe3D loading**: из spinner → outline skeleton (3 концентрических кольца)
- **`shimmer` keyframe** + `.animate-shimmer` utility добавлены

## [1.8.0] — 2026-03-13

### 🎯 UI/UX Design Audit — 22 улучшения

#### ⚡ Производительность
- **Canvas Optimization**: IntersectionObserver + Page Visibility API на DepthBackground и SpeedGraph — анимации не тратят CPU/GPU когда не видны (~60% экономия в фоне)

#### ♿ Доступность (WCAG AA)
- **Пульсирующий Focus Ring** на Power Button (state-aware: orange ↔ emerald)
- **HSL Contrast Tones**: заменены ~50 мест `text-white/15..40` → `text-muted/subtle/whisper` (контраст 3.1:1–4.5:1)
- **`@media (prefers-contrast: more)`**: автоповышение контраста для пользователей с ослабленным зрением
- **ARIA**: `role="dialog"` + `aria-modal` + focus trap в новом `<Dialog>`, `role="tablist"/"tab"` в ServerList, `aria-label` в ToggleRow switch

#### 🎨 Дизайн-система
- **Tailwind Config**: glass backgrounds (3 уровня), glass borders (3 уровня), 5 brand shadows, 7 backgroundImages (gradients), 5 unified borderRadius (`card/panel/button/input/modal`)
- **Токенизация**: inline `style={{}}` → Tailwind-классы в SettingsCard, SplitTunnel, Sidebar
- **Unified border-radius**: стандартизация с 11 до 5 значений

#### 🧹 Code Quality
- **Dialog Component**: переиспользуемый `<Dialog>` с focus trap, Escape, backdrop click, AnimatePresence
- **Settings Reset Modal** мигрирован на `<Dialog>` component
- **Dead Code**: удалены `whileHover={undefined}` / `whileTap={undefined}` из Dashboard
- **Font**: удалён неиспользуемый `@fontsource/outfit/800.css` (-15KB)
- **Toaster CSS**: исправлены сломанные `rgb(var())` на корректные hex-значения
- **SplitTunnel**: `bg-surface` → `bg-void-card` (корректный Tailwind-класс)


## [1.0.8] — 2026-02-27

### 💠 «Hyper-Glow» — Тотальная максимизация UI и Анимаций

- **ShieldLogo v3**: Переписан логотип с добавлением экстремального неонового свечения (Hyper-Glow) и более интенсивных 3D GSAP анимаций (левитация, вращение колец).
- **ParticleCanvas**: Частицы теперь испускают неоновое свечение (`shadowBlur`) и обладают повышенной упругостью (сила отталкивания усилена с 0.8 до 1.2).
- **Zero Orange left**: Оранжевые цвета в интерфейсе из прошлой версии полностью истреблены. Внедрены `text-brand` и `text-neon-emerald` с жестким `drop-shadow`.
- **BottomNav & Dashboard Text**: Добавлены `.shadow-glow` эффекты к тексту показателей скорости и кнопкам.
- **Обновлены иконки**: Инсталлятор и системный трей используют новейший вид сверх-яркого Void Prism логотипа.

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
