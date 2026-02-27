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

  ; Останавливаем процессы перед обновлением.
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM EgoistShield.exe /T /F'
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /IM xray.exe /T /F'

  ; Пытаемся снять старую установку (если зарегистрирован деинсталлятор).
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "UninstallString"
  ${If} $0 != ""
    nsExec::ExecToLog '$0 /S'
  ${EndIf}

  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\EgoistShield" "UninstallString"
  ${If} $0 != ""
    nsExec::ExecToLog '$0 /S'
  ${EndIf}

  ; Чистим остатки прошлых версий и runtime-кэш.
  RMDir /r "$LOCALAPPDATA\Programs\EgoistShield"
  RMDir /r "$LOCALAPPDATA\EgoistShield"
  RMDir /r "$APPDATA\EgoistShield"
  RMDir /r "$PROGRAMFILES64\EgoistShield"

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
  ; Удаляем автозапуск и остаточные пользовательские данные.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EgoistShield"
  RMDir /r "$LOCALAPPDATA\EgoistShield"
  RMDir /r "$APPDATA\EgoistShield"
!macroend
