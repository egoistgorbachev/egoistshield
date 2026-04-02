# EgoistShield

Universal Android client for `EgoistShield`, built as a separate Gradle application in `apps/android-tv`.

## What is already implemented

- universal launcher app with both `LAUNCHER` and `LEANBACK_LAUNCHER`
- adaptive Compose shell that switches between phone and TV layouts automatically
- `Dashboard`, `Server Center`, `DNS Center`, `System Settings`
- persisted app state via DataStore for nodes, subscriptions, favorites, DNS, and settings
- real URI/subscription import pipeline for:
  - `vless://`
  - `vmess://`
  - `trojan://`
  - `ss://`
  - `socks://` / `socks5://`
  - `http://` / `https://`
  - `hy2://` / `hysteria2://`
  - `tuic://`
  - `wireguard://` / `wg://`
- remote subscription refresh with configurable user-agent profiles
- real sing-box JSON generation for imported nodes and current DNS / route settings
- embedded `libbox` runtime with in-app `VpnService` session runner
- Android VPN permission flow wired into both phone and TV Compose UI
- Smart Connect and manual profile launch flows on top of imported real profiles
- runtime diagnostics feed with recent connection / boot / TUN events
- boot and package-replaced recovery receiver for auto-start / auto-connect flows
- local Gradle wrapper and Android build configuration

## Current scope

This module is now a working universal Android application with an embedded VPN transport layer.

The APK already includes:

- bundled native `libbox.so` inside `app/libs/libbox.aar`
- in-app `ShieldVpnService` based on Android `VpnService`
- foreground runtime lifecycle and system VPN permission handling
- local config generation and direct runtime launch without any external Android backend

## Build

```powershell
cd apps/android-tv
.\gradlew.bat assembleDebug
```

Release APK:

```powershell
cd apps/android-tv
.\gradlew.bat assembleRelease
```

## Test

```powershell
cd apps/android-tv
.\gradlew.bat testDebugUnitTest
```

Debug APK:

```text
app\build\outputs\apk\debug\app-debug.apk
```

Release APK:

```text
app\build\outputs\apk\release\app-release.apk
```

Packaged release artifact:

```text
artifacts\release\EgoistShield-1.4.0-universal-release.apk
```

Release checksum:

```text
artifacts\release\EgoistShield-1.4.0-universal-release.sha256.txt
```

## Local environment

For this workspace, Android command-line tools and SDK packages were installed locally and `local.properties` was generated automatically.

The embedded runtime was built locally from official `sing-box` sources and placed into:

```text
app\libs\libbox.aar
```

Temporary build tooling was prepared under:

```text
artifacts\tools\
```

Installed packages:

- `platform-tools`
- `platforms;android-35`
- `build-tools;35.0.0`
- `ndk;28.0.13004108`

## Verified flow

- build passes locally
- Android TV emulator smoke test passes for:
  - app launch
  - import of a real proxy URI
  - Android VPN permission grant
  - Smart Connect runtime launch
  - dashboard state propagation after import
  - graceful stop of the embedded tunnel
  - autonomous embedded runtime start on both debug and release package ids
- Android phone emulator smoke test passes for:
  - cold and warm launch
  - bottom navigation and compact mobile layout rendering
  - import of a real proxy URI
  - Android VPN permission grant
  - embedded runtime start and graceful stop
  - diagnostics rendering inside `System Settings`
  - auto-recovery after `MY_PACKAGE_REPLACED` when `autoStart` and `autoConnect` are enabled
- current emulator smoke profile uses `trojan://1.1.1.1:443` as a transport-path check, so downstream TLS errors from that placeholder endpoint are expected

## Release notes

- release build is configured for R8 code shrinking and resource shrinking
- direct APK distribution is supported through local keystore signing
- `profileinstaller` is included so packaged ART profiles can improve startup on installed builds
- local signing material lives in `keystore.properties` and `signing/` and is ignored by git for safety
- current packaged release checksum is stored in `artifacts/release/EgoistShield-1.4.0-universal-release.sha256.txt`

## Suggested next steps

1. Add live session stats from `CommandClient` into Dashboard and recent sessions.
2. Extend route-policy / kill-switch enforcement on top of the embedded runtime.
3. Add Compose UI / instrumentation tests for TV text-entry, VPN permission flow, and focus traversal.
4. Run the embedded tunnel flow on a physical Android TV box and a physical Android phone with a production-ready proxy profile.
