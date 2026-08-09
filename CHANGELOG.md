# Changelog

## 3.5.0 — 2026-08-09

- Канонический публичный updater channel перенесён на `egoist-ai1/egoistshield`.
- Добавлена атомарная операция check → download → verify → install → restart.
- Manifest schema v2 подписывает точные UTF-8 bytes branded Setup.
- Добавлены key registry/revocation, anti-rollback, `.partial` resume и TOCTOU recheck.
- Сетевые, HTTP 404 и trust-ошибки больше не отображаются как «версия актуальна».
- Setup перезапускает новую версию после commit и восстановленную версию после rollback.
- Интерфейс показывает реальную фазу и процент без raw HTTP/.NET/PowerShell текста.

Старые релизы до 3.5.0 считаются legacy и не участвуют в доверенном one-click channel.

