<p align="center">
  <img src="apps/desktop-electron/renderer/public/assets/icon.png" width="112" alt="EgoistShield" />
</p>

<h1 align="center">EgoistShield</h1>

<p align="center">
  <b>Windows-клиент для защищённых мультипротокольных подключений, управления узлами и системным DNS</b>
</p>

<p align="center">
  <a href="https://github.com/egoistgorbachev/egoistshield/releases/latest">
    <img src="https://img.shields.io/github/v/release/egoistgorbachev/egoistshield?style=for-the-badge&color=22c55e&label=Latest%20Release" alt="Latest release" />
  </a>
  <img src="https://img.shields.io/badge/Windows-10%2F11-0ea5e9?style=for-the-badge&logo=windows" alt="Windows 10/11" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178c6?style=for-the-badge&logo=typescript" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/Desktop-v3.1.0-ff6b3d?style=for-the-badge" alt="Desktop 3.1.0" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-36.9-47848f?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.1-61dafb?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7.3-646cff?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/Zod-validated-8b5cf6?style=flat-square" alt="Zod validated" />
</p>

---

## Что это

**EgoistShield** — desktop-приложение для Windows 10/11, которое объединяет:

- импорт и управление мультипротокольными узлами;
- выбор сервера и подключение через поддерживаемые runtime;
- системные функции клиента: Kill Switch, автозапуск, авто-подключение, ручная проверка обновлений;
- отдельный экран управления системным DNS;
- журналы соединения, диагностику и метрики runtime.

Проект ориентирован на пользователей, которым нужен **локально управляемый Windows-клиент** с современным UI и воспроизводимым релизным контуром.

## Что нового в 3.1.0

- **Smart Connect на health-score модели**: выбор сервера больше не опирается только на ping, а учитывает историю успешности и качество соединения.
- **Runtime lifecycle и diagnostics**: явные состояния `probing`, `connecting`, `warmup`, `active`, `degraded`, `failed`.
- **System DNS Center**: отдельный экран для установки и сброса системного DNS Windows.
- **Структурированные логи соединения**: удобнее разбирать причины ошибок и деградации.
- **Обновлённый Windows installer pipeline**: стабильная сборка и выпуск инсталлятора `3.1.0`.

Подробности по изменениям: [CHANGELOG.md](CHANGELOG.md).

## Ключевые возможности

| Область | Возможности |
| --- | --- |
| Подключение | VLESS, VMess, Trojan, Shadowsocks, SOCKS, HTTP, Hysteria2, TUIC, WireGuard |
| Runtime | Xray + Sing-box, runtime diagnostics, soft fallback |
| Smart Connect | health-score выбор узлов, fallback-цепочка, быстрый warm-switch |
| Импорт | подписки, URI, буфер обмена, файлы конфигурации |
| Система | Kill Switch, автозапуск, авто-подключение, ручная проверка обновлений |
| DNS | отдельный экран системного DNS, reset к DHCP, валидация ввода |
| Наблюдаемость | журналы соединения, статус runtime, базовые сетевые проверки |
| Интерфейс | 3D-глобус, список узлов, графики, dashboard, тёмная дизайн-система |

## Интерфейс

- **Dashboard** с крупной кнопкой состояния, карточками узла и сетевыми метриками.
- **Server Center** с 3D-глобусом, списком узлов, фильтрацией и подписками.
- **DNS Center** для глобальной Windows DNS-конфигурации.
- **Settings** для Kill Switch, автозапуска, авто-подключения, обновлений и диагностических функций.

## Быстрый старт

1. Скачайте установщик из [последнего релиза](https://github.com/egoistgorbachev/egoistshield/releases/latest).
2. Установите приложение на Windows 10/11 x64.
3. Добавьте узлы через `Ctrl+V`, импорт файла или subscription URL.
4. Выберите сервер вручную или используйте `Smart Connect`.
5. При необходимости настройте системный DNS на отдельном экране `DNS Center`.

## Системные требования

| Параметр | Требование |
| --- | --- |
| ОС | Windows 10 / 11 x64 |
| Node.js для сборки | 20+ |
| Память | 4 GB RAM и выше рекомендуется |
| Диск | от 300 MB свободного места |

## Сборка из исходников

```bash
git clone https://github.com/egoistgorbachev/egoistshield.git
cd egoistshield/apps/desktop-electron
npm install
npm run test
npm run build:vite
npm run dist
```

## Правовой контур и добросовестное использование

Публичное описание проекта и его позиционирование приведены в консервативной форме с учётом действующих требований российского законодательства на конец марта 2026 года.

- Проект описывается как **клиент защищённых сетевых подключений и управления узлами**, а не как средство для доступа к ресурсам, доступ к которым ограничен законом.
- Приложение предполагает использование с собственной инфраструктурой пользователя или с узлами и подписками, на использование которых у пользователя есть законные основания.
- Пользователь и оператор собственной инфраструктуры самостоятельно оценивают применимость требований к обработке данных и локальным сетевым настройкам.
- Если вы добавляете телеметрию, учётные записи или внешние backend-сервисы, отдельно оцените требования законодательства о персональных данных и уведомительном контуре.

Это не юридическая консультация, а продуктовый и редакционный guardrail для публичной страницы проекта.

## Репозиторий

- Основной desktop-клиент: [apps/desktop-electron](apps/desktop-electron)
- Журнал изменений: [CHANGELOG.md](CHANGELOG.md)
- Последний релиз: [GitHub Releases](https://github.com/egoistgorbachev/egoistshield/releases)

## Лицензия

Проект распространяется по лицензии [MIT](LICENSE).
