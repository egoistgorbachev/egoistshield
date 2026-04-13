; ── EgoistShield NSIS Custom Script ──
; Выполняется при установке/обновлении/удалении
; Убивает зомби-процессы, очищает firewall rules, удаляет temp runtime

!macro customInit
  ; Убить все запущенные процессы EgoistShield / runtime
  ; Без этого обновление может провалиться (файлы заблокированы)
  nsExec::ExecToLog 'taskkill /F /IM xray.exe'
  nsExec::ExecToLog 'taskkill /F /IM sing-box.exe'
  nsExec::ExecToLog 'taskkill /F /IM winws.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM EgoistShield.exe'
  nsExec::ExecToLog 'sc stop EgoistShieldZapret'
  nsExec::ExecToLog 'sc delete EgoistShieldZapret'
  nsExec::ExecToLog 'sc stop WinDivert'
  nsExec::ExecToLog 'sc delete WinDivert'
  nsExec::ExecToLog 'sc stop WinDivert14'
  nsExec::ExecToLog 'sc delete WinDivert14'

  ; Короткая пауза чтобы процессы гарантированно завершились
  Sleep 2000
!macroend

!macro customInstall
  ; Очистка firewall rules от Kill Switch предыдущей версии
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name=EgoistShield-KS-Block-All'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name=EgoistShield-KS-Allow-VPN'

  ; Очистка temp runtime файлов
  RMDir /r "$TEMP\EgoistShield"
!macroend

!macro customUnInit
  ; Убить процессы перед удалением
  nsExec::ExecToLog 'taskkill /F /IM xray.exe'
  nsExec::ExecToLog 'taskkill /F /IM sing-box.exe'
  nsExec::ExecToLog 'taskkill /F /IM winws.exe /T'
  nsExec::ExecToLog 'taskkill /F /IM EgoistShield.exe'
  nsExec::ExecToLog 'sc stop EgoistShieldZapret'
  nsExec::ExecToLog 'sc delete EgoistShieldZapret'
  nsExec::ExecToLog 'sc stop WinDivert'
  nsExec::ExecToLog 'sc delete WinDivert'
  nsExec::ExecToLog 'sc stop WinDivert14'
  nsExec::ExecToLog 'sc delete WinDivert14'
  Sleep 2000
!macroend

!macro customUnInstall
  ; Очистка firewall rules
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name=EgoistShield-KS-Block-All'
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name=EgoistShield-KS-Allow-VPN'

  ; Очищаем автозапуск, если пользователь включал его через настройки приложения.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "EgoistShield"

  ; Даём системе время отпустить winws/WinDivert файлы после stop/delete service.
  Sleep 2000

  ; Очистка temp без удаления пользовательского профиля.
  ; Reinstall/repair не должен молча сносить настройки, подписки и логи.
  RMDir /r "$TEMP\EgoistShield"

  ; При обновлении electron-builder сам переводит старый $INSTDIR во временный old-install.
  ; Если здесь отдельно планировать delayed rmdir для $INSTDIR, можно снести уже свежеразложенный билд.
  ${ifNot} ${isUpdated}
    ; После выхода uninstaller дочищаем пустой каталог установки отдельным cmd-процессом.
    ; Это снимает lock на Uninstall *.exe и убирает пустой $INSTDIR без ожидания reboot.
    Exec '"$SYSDIR\cmd.exe" /C cd /d "$TEMP" & ping 127.0.0.1 -n 5 >NUL & rmdir /S /Q "$INSTDIR"'

    ; Дополнительный fallback на случай, если директория останется занята.
    RMDir /r /REBOOTOK "$INSTDIR"
  ${endif}
!macroend
