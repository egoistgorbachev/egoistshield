@echo off
chcp 65001 > nul 2>&1
title EgoistShield Android - APK Build

set JAVA_HOME=C:\Android\jdk17
set ANDROID_HOME=C:\Android\sdk
set GRADLE_USER_HOME=C:\Android\.gradle
set PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%

echo.
echo ╔══════════════════════════════════════════╗
echo ║   EgoistShield Android - Сборка APK     ║
echo ╚══════════════════════════════════════════╝
echo.

java -version 2>&1
echo.

REM === Step 1: Bundle JS ===
echo [1/3] Создание JS-бандла...
cd /d "%~dp0"
if not exist "android\app\src\main\assets" mkdir "android\app\src\main\assets"
call npx react-native bundle --platform android --dev false --entry-file index.js --bundle-output android\app\src\main\assets\index.android.bundle --assets-dest android\app\src\main\res

if not exist "android\app\src\main\assets\index.android.bundle" (
    echo [ERROR] JS-бандл не создан! Пробуем через node...
    call node node_modules\react-native\cli.js bundle --platform android --dev false --entry-file index.js --bundle-output android\app\src\main\assets\index.android.bundle --assets-dest android\app\src\main\res
)

if not exist "android\app\src\main\assets\index.android.bundle" (
    echo ═══════════════════════════════════════════
    echo   ❌ FAILED: JS-бандл не создан
    echo ═══════════════════════════════════════════
    pause
    exit /b 1
)

echo [OK] JS-бандл создан!
echo.

REM === Step 2: Map short drive ===
echo [2/3] Маппинг короткого пути...
subst E: /d > nul 2>&1
subst E: "%~dp0"
echo [OK] E:\ = %~dp0

REM === Step 3: Gradle build ===
echo [3/3] Сборка APK...
echo.
cd /d E:\android
call gradlew.bat assembleDebug --no-daemon

set BUILD_RESULT=%ERRORLEVEL%
subst E: /d > nul 2>&1

echo.
if %BUILD_RESULT% == 0 (
    echo ═══════════════════════════════════════════
    echo   ✅ BUILD SUCCESS!
    echo ═══════════════════════════════════════════
    echo.
    echo   APK файл:
    dir /s /b "%~dp0android\app\build\outputs\apk\debug\*.apk" 2>nul
    echo.
    echo   Перекиньте APK на телефон и установите!
) else (
    echo ═══════════════════════════════════════════
    echo   ❌ BUILD FAILED (код: %BUILD_RESULT%)
    echo ═══════════════════════════════════════════
)

echo.
pause
