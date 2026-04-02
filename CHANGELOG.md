# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

## [4.0.1] — 2026-04-02

### 🚀 Globe Profiling Pass, Dense-Map Hardening & Final Release

Релиз завершает изолированную волну оптимизации `Server Center`: 3D-карта стала заметно дешевле на low-end Windows машинах и плотных наборах стран, не меняя внешний product-flow релизов и ручных обновлений.

#### ✨ Добавлено
- **Dense-map E2E smoke**: отдельный сценарий проверяет `ServerList -> Карта` на широком наборе стран и повторном открытии tab без скачков layout.
- **Map panel test hook**: у карты появился стабильный `data-testid` для регрессионных проверок без хрупких селекторов.

#### ✅ Исправлено
- **Cached globe texture**: `Globe3D` больше не пересоздаёт world texture на каждое повторное открытие map-tab.
- **Adaptive render profile**: dense/low-end сцены автоматически снижают `DPR`, детализацию sphere/atmosphere/dots и стоимость connection arc.
- **Reduced DOM label pressure**: в тяжёлом режиме глобус оставляет только приоритетные country labels плюс active/hovered state вместо постоянного рендера всех подписей.
- **Memoized country dots**: hover/select на карте больше не заставляет весь набор маркеров лишний раз перерисовываться.
- **Release docs sync**: desktop docs, root README и package metadata обновлены под final-version `4.0.1`.

#### 🧪 Верификация
- `npm run build:vite`
- `npm test`
- `npm run stress`
- `npm run test:e2e`
- `npm run release:verify`
- `npm run dist`

## [4.0.0] — 2026-04-02

### 🚀 Product Hardening, Honest Updates & Safe Reinstall

Релиз переводит desktop-клиент в более зрелое product-состояние: desktop updater перестаёт делать скрытую установку из приложения, uninstall больше не ведёт себя как destructive reset, а release-контур честно показывает, когда локальная сборка опережает публичный канал.

#### ✨ Добавлено
- **Manual desktop updates**: приложение проверяет GitHub Release и открывает страницу релиза для ручного скачивания installer вместо скрытого запуска установки.
- **Checksum-verified runtime updates**: `Xray` и `sing-box` принимают обновления только при совпадении опубликованного `SHA-256 checksum`.
- **Release verification script**: post-build команда `npm run release:verify` проверяет полноту release-артефактов и согласованность `latest.yml`.

#### ✅ Исправлено
- **Honest updater status**: ручная проверка обновлений различает `актуально`, `есть обновление` и `локальная сборка опережает канал`, вместо ложного `up to date`.
- **Non-destructive uninstall**: uninstall/reinstall по умолчанию сохраняет профиль пользователя, настройки, подписки и логи.
- **Unified brand icon**: splash/onboarding/tray/installer assets сведены к одному круглому shield-mark без разнобоя по форме.
- **Release docs**: desktop-документация и changelog синхронизированы с product-версией `4.0.0`.

#### 🧪 Верификация
- `npm test`
- `npm run test:e2e`
- `npx playwright test -g "навигация — tab Zapret" --repeat-each=12`
- `npm run dist`

## [3.6.0] — 2026-04-01

### 🚀 Service Tools, Route Probe & Release Polish

Релиз фиксирует финальное desktop-состояние, с которым опубликован GitHub Release 1 апреля 2026 года: отдельный экран сервисного управления собирает в одном месте служебные режимы, профили и maintenance-инструменты, route probe честно показывает разницу между прямым и управляемым сетевым маршрутом, а installer/startup контур аккуратно синхронизирует автозапуск и дочищает следы предыдущих установок.

#### ✨ Добавлено
- **Отдельный сервисный экран**: standalone/service-режим, профили, автоподбор, maintenance, диагностика и очистка Discord-кеша собраны в одном месте.
- **Maintenance surface**: проверка `Core updates`, запуск updater/service menu, `Flowseal tests` и тюнинг `Game Filter` / `IPSet` вынесены в UI.
- **Single service entry point**: в общих настройках оставлена одна входная точка в сервисный экран, без второго центра управления той же системой.

#### ✅ Исправлено
- **Honest route probe**: прямой egress и egress через локальный управляемый маршрут теперь возвращаются отдельным типизированным результатом вместо расплывчатой сетевой проверки.
- **Startup autostart sync**: настройки `autoStart` и `startMinimized` теперь синхронизируются с Windows login item не только при переключении в UI, но и на старте приложения.
- **Installer / uninstall cleanup**: install/update/uninstall контур останавливает фоновые сетевые процессы приложения, удаляет служебные хвосты, дочищает `WinDivert`, firewall rules, updater cache и пользовательские каталоги в `AppData`.
- **DepthBackground scheduling**: убран риск обращения к `requestAnimationFrame` до инициализации draw-loop, а пауза/возврат при hidden viewport и reduced motion стали безопаснее.
- **Settings cleanup**: удалён устаревший тумблер аппаратного ускорения и закреплён единый вход в сервисный экран без второго центра управления в общих настройках.

#### 🧪 Верификация
- `npm exec vitest run tests/login-item-settings.spec.ts tests/route-probe.spec.ts tests/nsis-installer.spec.ts tests/preload-subscriptions.spec.ts tests/use-app-store.spec.ts tests/zapret-manager.spec.ts`
- `npm test`
- `npm run build:vite`
- `npm run stress`
- `npm run dist`
- локальный Windows smoke: install -> launch -> uninstall -> reinstall `3.6.0`

## [3.3.0] — 2026-03-25

### 🚀 Make-Before-Break Handoff & Safer Runtime Cutover

Релиз доводит desktop-клиент до следующего слоя бесшовности: при reconnect и smart switch новая сессия теперь не просто открывает порт, а проходит дополнительную verification перед переключением системного сетевого маршрута. Если новый runtime срывается в handoff window, клиент старается сохранить предыдущее рабочее соединение.

#### ✨ Добавлено
- **Stronger prepared-session verification**: новая runtime-сессия подтверждается серией локальных probe, а не только `waitForPort`.
- **Make-before-break handoff window**: старая сессия удерживается дольше в controlled grace period, пока новая проходит handoff verification.
- **Rollback to previous session**: при сбое нового runtime в первые секунды после cutover клиент восстанавливает предыдущее активное соединение.

#### ✅ Исправлено
- Повторные reconnect/smart switch меньше приводят к жёсткому обрыву, если новая сессия стартовала нестабильно.
- Default mode использует тот же более безопасный handoff-path, что и smart mode.
- Отдельный `System DNS Center` и системный DNS flow не изменены и не вовлечены в новую handoff-логику.

#### 🧪 Верификация
- `biome check`
- `tsc --noEmit`
- `vitest`
- локальная Windows `dist` сборка installer-артефакта `3.3.0`

## [3.2.0] — 2026-03-25

### 🚀 Smart Connect v3.1 Tuning & Stability-First Release

Релиз закрепляет новый этап сетевой оптимизации desktop-клиента: smart mode стал осторожнее к churn, лучше различает совместимость runtime и сильнее приоритизирует устойчивую сессию без потери реакции на реально более быстрые узлы.

#### ✨ Добавлено
- **Adaptive Smart Connect tuning**: protocol-aware профили для поддерживаемых форматов конфигураций и транспортов.
- **Quality cache с decay**: planner учитывает `stabilityScore`, `probeConfidence`, историю quality/ping и деградации узла.
- **Exploration sampling**: smart mode периодически проверяет кандидатов вне основного shortlist и не застревает на локальном optimum.
- **Runtime suitability memory**: успешный fallback закрепляет временное предпочтение runtime для узла, а проблемная связка `node + runtime` получает penalty/cooldown.

#### ✅ Исправлено
- Auto-switch больше не реагирует на единичный шумный spike и требует подтверждённого выигрыша перед cutover.
- После удачных probe или стабильной активной сессии cooldown ослабляется мягко, без мгновенного возврата к агрессивному churn.
- Early smart health checks перестроены в контур `3s -> 10s -> 30s` для более быстрой реакции после подключения.
- Smart monitoring теперь бюджетно опрашивает active node и shortlist кандидатов, а не шумит по всему пулу постоянно.

#### 🧪 Верификация
- `biome check`
- `tsc --noEmit`
- `vitest`
- локальная Windows `dist` сборка installer-артефакта `3.2.0`

## [3.1.0] — 2026-03-25

### 🚀 Network Engine, DNS Center & Release Refinement

Релиз переводит desktop-клиент на более зрелую сетевую модель: улучшен Smart Connect, добавлена явная runtime-диагностика, оформлен отдельный экран системного DNS и обновлена публичная документация проекта.

#### ✨ Добавлено
- **Smart Connect v2** на health-score логике: учитываются не только ping, но и история успешности, качество сессии и fallback-кандидаты.
- **Runtime lifecycle + diagnostics**: состояния `idle`, `probing`, `connecting`, `warmup`, `active`, `degraded`, `reconnecting`, `failed`.
- **System DNS Center**: отдельный экран для установки и сброса системного DNS Windows.
- **Structured connection logs** и более ясные причины ошибок runtime.
- **Protocol-aware groundwork** для дальнейшей оптимизации сетевого движка.

#### ✅ Исправлено
- Убраны устаревшие UI-элементы и состояния вокруг прежнего `TUN/Split Tunnel` контура.
- Исправлен парсинг системного DNS и добавлена безопасная поддержка IPv4/IPv6 форматов.
- Дочищен installer pipeline и воспроизводимость Windows-сборки.
- Исправлены визуальные артефакты dashboard и клиппинг теней карточек.

#### 📝 Документация
- Полностью обновлён корневой `README.md` под релиз `3.1.0`.
- Актуализирован `apps/desktop-electron/README.md`.
- Публичное описание перепозиционировано в более консервативную и юридически безопасную форму для РФ.

## [3.0.0] — 2026-03-19

### 🛡 Release Integrity & Desktop Polish

Релиз сфокусирован на доведении desktop-клиента до воспроизводимого релизного состояния: зелёный verification loop, честная типизация, более зрелая accessibility-семантика и готовый Windows installer pipeline.

#### ✅ Исправлено
- Полностью закрыт `P0` quality gate: `biome`, `tsc`, `vitest`, `stress`, `Playwright E2E`, `build:vite`.
- Починены `Ctrl+K`, `Ctrl+V`, window controls и E2E first-run flow.
- Убраны `any`/non-null assertions из критичных экранов и store-контуров (`Dashboard`, `ServerList`, `Settings`, `Onboarding`, `Globe3D`, `WorldMap`, `servers-slice`).
- Исправлены dev/test `userData`, `logs` и session paths для изоляции прогонов.
- Раздельная маршрутизация и runtime-dependent toggles теперь честно отражают ограничения выбранного сетевого режима и встроенного runtime.

#### 🎨 UI/UX
- Улучшены motion и стабильность визуальных компонентов `Globe3D`, `SpeedGraph`, onboarding и usage widgets.
- Дочищена accessibility-семантика: корректные `button/output/switch`, keyboard paths, decorative SVG handling.
- `UsageInsights` теперь показывает полезную недельную агрегацию, включая число уникальных узлов.

#### 📦 Release
- Версия desktop-приложения переведена на `3.0.0`.
- Single-EXE packaging script больше не хардкодит версию runtime-кэша.

## [2.0.0] — 2026-03-18

### 💎 Эпоха v2.0: Трансформация UI/UX & Производительности

Глобальное обновление интерфейса, превращающее EgoistShield в более зрелый desktop-клиент сетевых подключений. Улучшена производительность, переписаны стили, добавлен глубокий мониторинг (Smart UX) и внедрены строгие стандарты доступности (WCAG 2.2 AA).

#### 🚀 Ультимативная производительность
- **Интеллектуальный throttling 3D фона:** 30fps в активном состоянии соединения, авто-пауза при сворачивании и экономия CPU/GPU до 40%.
- **Аппаратные CSS-анимации:** Полный отказ от CPU-анимаций (Framer Motion) для пульсаций и колец фокуса в пользу Composite CSS (GPU-only, `pulse-ring`, `glow-pulse`). Тотальная плавность и 0% CPU overhead UI в фоновом режиме.

#### 🎨 Новая Дизайн-Система
- Унифицированный Spacing (4px grid) и Typography (Tokens + Tailwind).
- Абсолютно переписан **Tailwind config**: четко определены `z-index` (0..100), длительности анимаций и `motion` токены.
- Отказ от хардкода стилей и inline-CSS: все карточки унифицированы через `.glass-card` и `.sidebar-panel`.

#### 🤖 Smart UX
- **Usage Insights Dashboard:** Мониторинг статистики входящего/исходящего трафика в реальном времени, встроенный прямо в дашборд (bar charts & stats). Данные сохраняются локально.
- **Server Health Badges:** Цветовая индикация здоровья серверов и пинга (emerald/amber/red).
- **Command Palette (Ctrl+K):** Глобальный поиск и быстрое управление настройками через хоткей.
- Логи перенесены из настроек в отдельное окно `ConnectionLogsScreen` для невероятной чистоты UI Настроек.

#### ♿ Доступность
- Откалиброваны контрасты (3.1:1 — 4.5:1), убраны 'бледные тексты', добавлен семантический цвет `muted`.
- Внедрён ARIA Live для Toast Alert (VoiceOver / NVDA озвучка при ошибках подключения).
- Имплементированы aria-метки для переключателей, Split Tunnel списка и Server Status.
- Добавлен `lang="ru"` в корень.

#### 🔧 Core Fixes
- Устранение проблемы **Zombie runtime / Bind Port**: фоновые процессы теперь гарантированно уничтожаются при завершении и реконнекте, никаких "Port already in use".
- Оптимизация сетевых конфигов с добавлением более быстрого профиля транспорта для тяжёлых сценариев соединения.

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
- Юридический аудит — из README убраны спорные технические формулировки и избыточно рискованные публичные акценты
- `publish.private` → `false` (репо публичное)
- GitHub Topics и публичное описание репозитория дополнительно очищены до нейтрального позиционирования.

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
- Хардкод портов (9090, 10085) → именованные константы в main-process слое
- Удалён несуществующий тип Screen `'logs'`
- Удалена неиспользуемая зависимость `electron-vite`

### 📦 Инфраструктура

- Версия обновлена до 1.0.4

## [1.0.1] — 2026-02-27

Первый публичный релиз EgoistShield — десктопный Windows-клиент для защищённых сетевых подключений.

### Возможности

- Многокомпонентный сетевой runtime для исполнения поддерживаемых конфигураций
- Поддержка основных форматов конфигураций и транспортов
- Импорт конфигов: URI, Base64, JSON, YAML, файлы, подписки с автообновлением
- Раздельная маршрутизация по процессам Windows
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
