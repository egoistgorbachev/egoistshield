# EgoistShield 4.0.4 Packaged Smoke

Эта проверка нужна именно для уже собранного `EgoistShield.exe`, а не для dev/e2e режима.

## Когда запускать

- перед публикацией нового desktop-релиза;
- на выделенной Windows QA-машине;
- когда нужно проверить реальный production-shell и системные сценарии без mock-runtime.

## Команда

```bash
npm run test:e2e:packaged
```

Команда запускает PowerShell harness, поднимает `out/dist/win-unpacked/EgoistShield.exe`, ждёт production boot marker в `main.log` и выводит ручной checklist.

## Что проверить в UI

1. Dashboard:
   - старт ощущается быстрым, splash не держит длинную искусственную паузу;
   - в отключённом состоянии виден блок readiness summary и быстрые действия.
2. DNS Center:
   - применить `System DoH` с `https://1.1.1.1/dns-query`;
   - затем вернуть состояние через reset.
3. Zapret:
   - экран открывается без `Error invoking remote method 'zapret:status'`;
   - видна версия ядра или понятный state без пустого layout.
4. Telegram Proxy:
   - экран рендерится без сломанных отступов;
   - основные действия доступны.

## Что посмотреть после прогона

- `main.log` в `%APPDATA%\\EgoistShield\\logs\\main.log`;
- отсутствие раннего падения `EgoistShield.exe`;
- отсутствие визуальных regression на стартовом shell и dashboard.

## Ограничения

- это не fully automated test и не должен входить в обычный `npm run test:e2e`;
- smoke трогает реальный production userData и реальные системные операции в Windows;
- выполнять его на основной рабочей машине без необходимости не стоит.
