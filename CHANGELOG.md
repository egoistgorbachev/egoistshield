# Changelog

Все значимые изменения проекта EgoistShield документируются в этом файле.

Формат основан на [Keep a Changelog](https://keepachangelog.com/ru/1.0.0/),
версионирование — [Semantic Versioning](https://semver.org/lang/ru/).

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
