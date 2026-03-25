import path from "node:path";
import { MakerZIP } from "@electron-forge/maker-zip";
import { AutoUnpackNativesPlugin } from "@electron-forge/plugin-auto-unpack-natives";
import { VitePlugin } from "@electron-forge/plugin-vite";
import type { ForgeConfig } from "@electron-forge/shared-types";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: "EgoistShield",
    icon: path.resolve(__dirname, "renderer/public/assets/icon.ico"),
    win32metadata: {
      FileDescription: "EgoistShield Universal VPN Client",
      ProductName: "EgoistShield",
      CompanyName: "EgoistShield",
      OriginalFilename: "EgoistShield.exe",
      "requested-execution-level": "requireAdministrator"
    },
    extraResource: [path.resolve(__dirname, "runtime")]
  },
  makers: [
    // Продакшн инсталлер: electron-builder + NSIS (npm run dist)
    // MakerZIP оставлен для портативных сборок через Forge
    new MakerZIP({}, ["win32"])
  ],
  plugins: [
    new AutoUnpackNativesPlugin({}),
    new VitePlugin({
      build: [
        {
          entry: "electron/main.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: "electron/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};

export default config;
