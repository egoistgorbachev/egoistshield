# EgoistShield Android

Универсальный VPN-клиент для Android-смартфонов и Android TV приставок.

## Технологии

- **Platform:** React Native 0.84 (Android)
- **UI:** React 19, TypeScript 5.8
- **State:** Zustand 5.0
- **Navigation:** React Navigation 7
- **VPN Engine:** sing-box (ARM64/ARMv7)
- **Runtime:** Android VpnService + TUN interface

## Структура

```
apps/android/
├── android/                    # Native Android (Gradle/Kotlin)
│   └── app/src/main/
│       ├── java/.../vpn/       # EgoistVpnService, SingBoxRunner, VpnModule
│       └── AndroidManifest.xml # VPN + Leanback (TV)
├── src/
│   ├── native/                 # VPN bridge, config builder, URI parser
│   ├── screens/                # Dashboard, ServerList, Settings
│   ├── store/                  # Zustand store
│   └── theme.ts                # Design tokens
├── App.tsx                     # Entry + Navigation
└── package.json
```

## Поддерживаемые протоколы

VLESS, VMess, Trojan, Shadowsocks, Hysteria2, TUIC, WireGuard

## Установка и запуск

```bash
cd apps/android
npm install

# Dev
npm run android

# Build APK
npm run build:debug    # Debug APK
npm run build:apk      # Release APK
```

## Требования

- Node.js >= 22
- Android SDK (API 24+)
- Android NDK
- JDK 17+
- sing-box ARM64 binary (в `android/app/src/main/jniLibs/arm64-v8a/libsingbox.so`)

## Android TV

Приложение адаптировано для Android TV:

- D-pad навигация через tab navigation
- Увеличенные touch-targets (80px tab bar)
- Leanback-совместимость в AndroidManifest
