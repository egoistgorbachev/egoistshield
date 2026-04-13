# EgoistShield 4.0.4 Release Verification & Distribution

Эта памятка описывает текущую release-политику для `apps/desktop-electron` на `2026-04-10` и product-version `4.0.4`.

Текущая модель распространения намеренно простая:

- desktop-приложение проверяет наличие нового релиза;
- приложение не скачивает и не запускает installer автоматически;
- при наличии новой версии пользователь открывает страницу GitHub Release и скачивает installer вручную;
- managed runtime updates для `Xray` и `sing-box` по-прежнему требуют опубликованный `SHA-256`.

## Что проверяет `npm run release:verify`

Post-build проверка больше не требует Authenticode-подписи. Вместо этого она валидирует целостность и согласованность release-артефактов:

- наличие `EgoistShield-<version>-Setup.exe`;
- наличие `EgoistShield-<version>-Setup.exe.blockmap`;
- наличие `latest.yml`;
- совпадение версии в `package.json` и `latest.yml`;
- совпадение `path` и `files[].url` с именем installer;
- наличие `sha512`, `size` и `isAdminRightsRequired` в `latest.yml`;
- совпадение размера installer с metadata в `latest.yml`;
- отсутствие пустых или битых output-файлов.

## Обязательный набор файлов для GitHub Release

```text
EgoistShield-<version>-Setup.exe
EgoistShield-<version>-Setup.exe.blockmap
latest.yml
```

Именно этот набор должен быть опубликован в GitHub Release, чтобы desktop-клиент мог корректно показать статус новой версии и открыть нужную страницу релиза.

## Базовый release-flow

1. Запустить тесты:

   ```bash
   npm test
   npm run stress
   npm run test:e2e
   ```

2. На выделенной Windows QA-машине при необходимости прогнать packaged smoke harness:

   ```bash
   npm run test:e2e:packaged
   ```

   Этот сценарий запускает упакованный `EgoistShield.exe`, ждёт production boot marker и ведёт по ручному checklist для реального `System DoH`, поэтому его не стоит выполнять как обычный быстрый smoke на рабочей машине.

   Детальный checklist: [packaged-smoke.md](./packaged-smoke.md)

3. Собрать desktop-релиз:

   ```bash
   npm run dist
   ```

4. Проверить артефакты вручную при необходимости:

   ```bash
   npm run release:verify
   ```

5. Загрузить в GitHub Release:
   - `EgoistShield-<version>-Setup.exe`
   - `EgoistShield-<version>-Setup.exe.blockmap`
   - `latest.yml`

## Что видит пользователь в приложении

- Если опубликованный канал совпадает с локальной версией, Settings показывает актуальный статус.
- Если в GitHub Release есть новая версия, приложение предлагает открыть страницу релиза.
- Если локальная сборка новее публичного канала, Settings честно показывает, что релизный канал отстаёт.
- Если metadata релиза частично повреждена или недоступна, приложение не пытается запускать installer, а переводит пользователя к ручной проверке release page.

## Почему выбран manual update flow

Для текущей product-политики это самый безопасный и предсказуемый вариант без лишней скрытой автоматизации:

- нет тихого скачивания installer в фоне;
- нет silent-launch установки из приложения;
- проще объяснить пользователю источник обновления;
- меньше риск некорректного update flow при повреждённой metadata или нестабильном GitHub API.

## Опционально на будущее

Authenticode-подпись можно добавить позже как отдельное улучшение trust-контрура, но текущий релизный процесс и `release:verify` на неё не завязаны.
