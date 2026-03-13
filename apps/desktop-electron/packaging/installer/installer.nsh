!include "LogicLib.nsh"

; ─── Branded progress window text for oneClick install ───
!macro customHeader
  !system "echo '  Branded NSIS header'"
!macroend

; Текст в окне прогресса установки.
!define MUI_INSTFILESPAGE_FINISHHEADER_TEXT "Установка завершена!"
!define MUI_INSTFILESPAGE_FINISHHEADER_SUBTEXT "EgoistShield готов к работе."
!define MUI_INSTFILESPAGE_ABORTHEADER_TEXT "Установка прервана"
!define MUI_INSTFILESPAGE_ABORTHEADER_SUBTEXT "EgoistShield не был установлен."

; Заголовок окна установщика.
!define MUI_HEADERIMAGE
!define MUI_HEADER_TRANSPARENT_TEXT

; Брендированное описание.
Caption "EgoistShield — Установка"
SubCaption 0 ": Подготовка"
SubCaption 1 ": Установка компонентов"
SubCaption 2 ": Завершение"
BrandingText "EgoistShield v2.0 — ваш цифровой щит"

!macro preInit
  SetShellVarContext all

  ; ── 1. Останавливаем ВСЕ связанные процессы ──
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM EgoistShield.exe /T /F'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM xray.exe /T /F'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM sing-box.exe /T /F'

  ; Даём 1 секунду на завершение процессов.
  Sleep 1000

  ; ── 2. Деинсталляция предыдущей версии (с ожиданием завершения) ──
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "UninstallString"
  ${If} $0 != ""
    ; Получаем каталог деинсталлятора для корректного запуска.
    ReadRegStr $1 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "InstallLocation"
    ExecWait '$0 /S _?=$1'
    ; Удаляем запись реестра, если деинсталлятор не сделал это.
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield"
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "UninstallString"
  ${If} $0 != ""
    ReadRegStr $1 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "InstallLocation"
    ExecWait '$0 /S _?=$1'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield"
  ${EndIf}

  ; Также проверяем формат ID {uuid}, который использует electron-builder.
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{EgoistShield}" "UninstallString"
  ${If} $0 != ""
    ExecWait '$0 /S'
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\{EgoistShield}"
  ${EndIf}

  ; Удаляем автозапуск от предыдущей версии.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EgoistShield"

  ; ── 3. Полная очистка каталогов предыдущих версий ──
  ; Каталог установки (Programs).
  RMDir /r "$LOCALAPPDATA\Programs\EgoistShield"
  RMDir /r "$PROGRAMFILES64\EgoistShield"

  ; Electron userData (настройки, кэш, IndexedDB, localStorage).
  RMDir /r "$APPDATA\EgoistShield"
  RMDir /r "$LOCALAPPDATA\EgoistShield"

  ; Electron forge использует productName с пробелами или оригинальный package name.
  RMDir /r "$APPDATA\egoistshield-desktop-electron"
  RMDir /r "$LOCALAPPDATA\egoistshield-desktop-electron"

  ; Electron updater cache.
  RMDir /r "$LOCALAPPDATA\egoistshield-desktop-electron-updater"

  ; Временные файлы от прошлых запусков.
  RMDir /r "$TEMP\EgoistShield"
  RMDir /r "$TEMP\egoistshield-desktop-electron"

  ; ── 4. Ярлыки ──
  Delete "$DESKTOP\EgoistShield.lnk"
  RMDir /r "$SMPROGRAMS\EgoistShield"
!macroend

!macro customInstall
  SetShellVarContext all

  ; Тихая установка — всегда создаём ярлык на рабочем столе.
  CreateShortCut "$DESKTOP\EgoistShield.lnk" "$INSTDIR\EgoistShield.exe"

  ; Включаем автозапуск установленного клиента (можно выключить в настройках приложения).
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EgoistShield" '"$INSTDIR\EgoistShield.exe" --minimized'
!macroend

!macro customUnInstall
  ; Удаляем автозапуск.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EgoistShield"

  ; Electron userData (настройки, кэш, IndexedDB, localStorage).
  RMDir /r "$APPDATA\EgoistShield"
  RMDir /r "$LOCALAPPDATA\EgoistShield"
  RMDir /r "$APPDATA\egoistshield-desktop-electron"
  RMDir /r "$LOCALAPPDATA\egoistshield-desktop-electron"

  ; Electron updater cache.
  RMDir /r "$LOCALAPPDATA\egoistshield-desktop-electron-updater"

  ; Временные файлы.
  RMDir /r "$TEMP\EgoistShield"
  RMDir /r "$TEMP\egoistshield-desktop-electron"
!macroend
