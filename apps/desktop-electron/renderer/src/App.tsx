import { AnimatePresence, motion } from "framer-motion";
import { Download } from "lucide-react";
import React, { useEffect, Suspense, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { Sidebar } from "./components/Sidebar";
import { SplashScreen } from "./components/SplashScreen";
import { TitleBar } from "./components/TitleBar";
import { getAPI } from "./lib/api";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { Zapret } from "./screens/Zapret";
import { useAppStore } from "./store/useAppStore";

const ACTIVE_PROXY_PING_INTERVAL_MS = 2_500;
const SPLASH_MIN_VISIBLE_MS = 320;
const SPLASH_MAX_VISIBLE_MS = 700;

// Code splitting — экраны грузятся отложенно
const Dashboard = React.lazy(() => import("./screens/Dashboard").then((m) => ({ default: m.Dashboard })));
const DnsControl = React.lazy(() => import("./screens/DnsControl").then((m) => ({ default: m.DnsControl })));
const Settings = React.lazy(() => import("./screens/Settings").then((m) => ({ default: m.Settings })));
const ServerList = React.lazy(() => import("./screens/ServerList").then((m) => ({ default: m.ServerList })));
const Onboarding = React.lazy(() => import("./screens/Onboarding").then((m) => ({ default: m.Onboarding })));
const TelegramProxy = React.lazy(() =>
  import("./screens/TelegramProxy").then((m) => ({ default: m.TelegramProxy }))
);

// Fallback для Suspense — минимальный лоадер
function ScreenLoader({ screen }: { screen?: string }) {
  return (
    <div
      data-screen-loading={screen ?? "unknown"}
      className="w-full h-full flex items-center justify-center bg-surface-app"
    >
      <div className="w-8 h-8 border-2 border-brand-light/30 border-t-brand-light rounded-full animate-spin" />
    </div>
  );
}

export function App() {
  const currentScreen = useAppStore((state) => state.currentScreen);
  const isFirstRun = useAppStore((state) => state.isFirstRun);
  const checkFirstRun = useAppStore((state) => state.checkFirstRun);
  const syncWithBackend = useAppStore((state) => state.syncWithBackend);
  const installRuntime = useAppStore((state) => state.installRuntime);

  useKeyboardShortcuts();

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [updateReleaseUrl, setUpdateReleaseUrl] = useState("");
  const [showSplash, setShowSplash] = useState(() => !useAppStore.persist.hasHydrated());
  const [isStoreHydrated, setIsStoreHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    checkFirstRun();

    if (useAppStore.persist.hasHydrated()) {
      setShowSplash(false);
      return;
    }

    const startedAt = Date.now();
    const maxTimer = setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_MAX_VISIBLE_MS);
    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(SPLASH_MIN_VISIBLE_MS - elapsedMs, 0);

      window.setTimeout(() => {
        setShowSplash(false);
      }, remainingMs);
    });

    return () => {
      clearTimeout(maxTimer);
      unsubscribe();
    };
  }, [checkFirstRun]);

  useEffect(() => {
    setIsStoreHydrated(useAppStore.persist.hasHydrated());

    const unsubscribe = useAppStore.persist.onFinishHydration(() => {
      setIsStoreHydrated(true);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isFirstRun === false && isStoreHydrated) {
      void syncWithBackend();
      void installRuntime();
    }

    const api = getAPI();
    const disposers: Array<() => void> = [];
    let autoConnectTimer: ReturnType<typeof setTimeout> | null = null;

    if (api?.updater) {
      disposers.push(api.updater.onUpdateAvailable((data) => {
        setUpdateAvailable(true);
        setUpdateVersion(data.version);
        setUpdateReleaseUrl(data.releaseUrl ?? data.downloadUrl ?? "");
      }));
      disposers.push(api.updater.onUpdateNotAvailable(() => {
        setUpdateAvailable(false);
        setUpdateVersion("");
        setUpdateReleaseUrl("");
      }));
      disposers.push(api.updater.onUpdateError(() => {
        setUpdateAvailable(false);
      }));
    }

    // Auto-connect: main process отправляет serverId при autoConnect = true
    if (api?.autoConnect?.onAutoConnect) {
      disposers.push(api.autoConnect.onAutoConnect((serverId: string) => {
        const store = useAppStore.getState();
        if (!store.isConnected && !store.isConnecting && serverId) {
          useAppStore.setState({ selectedServerId: serverId });
          // Небольшая задержка, чтобы store обновился
          if (autoConnectTimer) {
            clearTimeout(autoConnectTimer);
          }
          autoConnectTimer = setTimeout(() => {
            useAppStore.getState().toggleConnection();
          }, 100);
        }
      }));
    }

    return () => {
      if (autoConnectTimer) {
        clearTimeout(autoConnectTimer);
      }
      for (const dispose of disposers) {
        dispose();
      }
    };
  }, [isFirstRun, isStoreHydrated, installRuntime, syncWithBackend]);

  // ── Global Ping Polling ───────────────────────────────────
  // Обновляет activePing каждую секунду НЕЗАВИСИМО от активного экрана.
  // Sidebar Shield использует activePing для цветовой индикации.
  const isConnected = useAppStore((s) => s.isConnected);
  const setActivePing = useAppStore((s) => s.setActivePing);

  useEffect(() => {
    let pingInterval: ReturnType<typeof setInterval> | undefined;
    let pingInFlight = false;
    let disposed = false;
    let doPing = async () => {};

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void doPing();
      }
    };

    if (isConnected) {
      doPing = async () => {
        if (disposed || pingInFlight || document.hidden) {
          return;
        }

        const api = getAPI();
        if (api?.system?.pingActiveProxy) {
          pingInFlight = true;
          try {
            const p = await api.system.pingActiveProxy();
            if (!disposed && p > 0) {
              setActivePing(p);
            }
          } catch (error: unknown) {
            console.warn("[App] Active proxy ping failed", error);
          } finally {
            pingInFlight = false;
          }
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      void doPing();
      pingInterval = setInterval(() => {
        void doPing();
      }, ACTIVE_PROXY_PING_INTERVAL_MS);
    } else {
      setActivePing(null);
    }

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(pingInterval);
    };
  }, [isConnected, setActivePing]);

  // Global Ctrl+V: auto-import VPN links from clipboard
  useEffect(() => {
    const handlePaste = async (e: KeyboardEvent) => {
      // Skip if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const isPasteShortcut = (e.ctrlKey || e.metaKey) && e.code === "KeyV";
      if (!isPasteShortcut) return;

      e.preventDefault();
      const api = getAPI();
      if (!api) return;

      try {
        let text = "";
        if (api.system?.readClipboard) {
          text = await api.system.readClipboard();
        } else {
          text = await navigator.clipboard.readText();
        }
        if (!text?.trim()) return;

        // Check if clipboard contains VPN-like links
        const vpnPatterns = /^(vless|vmess|ss|trojan|hysteria2?|tuic|wg|wireguard):\/\/|^https?:\/\//im;
        if (!vpnPatterns.test(text.trim())) return;

        const result = await api.import.text(text);
        await useAppStore.getState().syncWithBackend();

        if (result && (result.added > 0 || result.subscriptionsAdded > 0)) {
          useAppStore.getState().setScreen("servers");
        }
      } catch (error: unknown) {
        console.warn("[App] Clipboard import failed", error);
      }
    };

    window.addEventListener("keydown", handlePaste);
    return () => window.removeEventListener("keydown", handlePaste);
  }, []);

  if (isFirstRun === null) {
    return <div className="w-full h-screen bg-surface-app" />;
  }

  // Если первый старт, сразу рендерим онбординг (без сплеша)
  if (isFirstRun) {
    return (
      <Suspense fallback={<ScreenLoader screen="onboarding" />}>
        <Onboarding />
      </Suspense>
    );
  }

  const activeScreen = (() => {
    switch (currentScreen) {
      case "servers":
        return <ServerList />;
      case "dns":
        return <DnsControl />;
      case "zapret":
        return <Zapret />;
      case "telegram-proxy":
        return <TelegramProxy />;
      case "settings":
        return <Settings />;
      case "dashboard":
      default:
        return <Dashboard />;
    }
  })();

  return (
    <div className="relative flex h-screen w-full flex-row overflow-hidden bg-void text-white font-sans selection:bg-brand/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,76,41,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.06),transparent_22%)]" />
      {/* Skip to content — visible only on focus via Tab */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-max
                   focus:bg-brand focus:text-white focus:px-4 focus:py-2 focus:rounded-lg
                   focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Перейти к содержимому
      </a>
      <AnimatePresence>{showSplash && <SplashScreen key="splash" />}</AnimatePresence>

      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette />

      {/* Sidebar — left column */}
      <Sidebar />

      {/* Content — right column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TitleBar />
        <OfflineBanner />

        <div id="main-content" className="flex-1 relative overflow-hidden">
          <ErrorBoundary>
            <div key={currentScreen} data-screen={currentScreen} className="absolute inset-0 bg-surface-app/95 backdrop-blur-md">
              <Suspense fallback={<ScreenLoader screen={currentScreen} />}>{activeScreen}</Suspense>
            </div>
          </ErrorBoundary>
        </div>

        {/* Auto Update Toast */}
        <AnimatePresence>
          {updateAvailable && (
            <motion.output
              aria-live="polite"
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-toast pointer-events-auto"
            >
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-[0_10px_40px_rgba(59,130,246,0.3)] bg-blue-500/10 border border-blue-500/30 backdrop-blur-xl">
                <Download className="w-5 h-5 text-blue-300 shrink-0" />
                <div className="flex flex-col min-w-[160px]">
                  <p className="font-bold text-sm tracking-wide text-blue-100 leading-tight">
                    Доступна версия v{updateVersion}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-blue-100/75">
                    Скачайте обновление вручную со страницы релиза, чтобы проверить release notes и installer перед установкой.
                  </p>
                </div>
                <div className="ml-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const api = getAPI();
                      if (api?.updater?.openReleasePage) {
                        void api.updater.openReleasePage();
                        return;
                      }
                      void api?.updater?.install?.();
                    }}
                    className="px-3 py-1.5 text-xs font-bold tracking-wide rounded-lg bg-blue-500/20 text-blue-100 border border-blue-400/30 hover:bg-blue-500/30 transition-colors cursor-pointer"
                  >
                    {updateReleaseUrl ? "Открыть релиз" : "Открыть страницу"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateAvailable(false)}
                    className="text-white/40 hover:text-white/70 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </motion.output>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
