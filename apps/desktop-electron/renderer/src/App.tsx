import { AnimatePresence, motion } from "framer-motion";
import { Download, Info, RefreshCw } from "lucide-react";
import React, { useEffect, Suspense, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { OfflineBanner } from "./components/OfflineBanner";
import { SplashScreen } from "./components/SplashScreen";
import { TitleBar } from "./components/TitleBar";
import { getAPI } from "./lib/api";
import { pageTransition } from "./lib/motion";
import { useAppStore } from "./store/useAppStore";

// Code splitting — экраны грузятся отложенно
const Dashboard = React.lazy(() => import("./screens/Dashboard").then((m) => ({ default: m.Dashboard })));
const SplitTunnel = React.lazy(() => import("./screens/SplitTunnel").then((m) => ({ default: m.SplitTunnel })));
const Settings = React.lazy(() => import("./screens/Settings").then((m) => ({ default: m.Settings })));
const ServerList = React.lazy(() => import("./screens/ServerList").then((m) => ({ default: m.ServerList })));
const Onboarding = React.lazy(() => import("./screens/Onboarding").then((m) => ({ default: m.Onboarding })));

// Fallback для Suspense — минимальный лоадер
function ScreenLoader() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-surface-app">
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

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateVersion, setUpdateVersion] = useState("");
  const [downloadProgress, setDownloadProgress] = useState(-1); // -1 = not downloading
  const [updateReady, setUpdateReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    checkFirstRun();
    // Splash screen timer
    const timer = setTimeout(() => setShowSplash(false), 2400);
    return () => clearTimeout(timer);
  }, [checkFirstRun]);

  useEffect(() => {
    if (isFirstRun === false) {
      installRuntime().then(() => {
        syncWithBackend();
      });
    }

    const api = getAPI();
    if (api?.updater) {
      api.updater.onUpdateAvailable((data) => {
        setUpdateAvailable(true);
        setUpdateVersion(data.version);
      });
      api.updater.onDownloadProgress((data) => {
        setDownloadProgress(data.percent);
      });
      api.updater.onUpdateDownloaded((data) => {
        setUpdateReady(true);
        setDownloadProgress(100);
        setUpdateVersion(data.version);
      });
    }

    // Auto-connect: main process отправляет serverId при autoConnect = true
    if (api?.autoConnect?.onAutoConnect) {
      api.autoConnect.onAutoConnect((serverId: string) => {
        const store = useAppStore.getState();
        if (!store.isConnected && !store.isConnecting && serverId) {
          useAppStore.setState({ selectedServerId: serverId });
          // Небольшая задержка, чтобы store обновился
          setTimeout(() => {
            useAppStore.getState().toggleConnection();
          }, 100);
        }
      });
    }
  }, [isFirstRun, installRuntime, syncWithBackend]);

  // Global Ctrl+V: auto-import VPN links from clipboard
  useEffect(() => {
    const handlePaste = async (e: KeyboardEvent) => {
      // Skip if typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (!(e.ctrlKey && e.key === "v")) return;

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
      } catch { /* ignore clipboard errors */ }
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
      <Suspense fallback={<ScreenLoader />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <div className="relative w-full h-screen bg-void flex flex-row overflow-hidden text-white font-sans selection:bg-brand/20">
      <AnimatePresence>{showSplash && <SplashScreen key="splash" />}</AnimatePresence>

      {/* Sidebar — left column */}
      <Sidebar />

      {/* Content — right column */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <TitleBar />
        <OfflineBanner />

        <div className="flex-1 relative overflow-hidden">
          <ErrorBoundary>
            <Suspense fallback={<ScreenLoader />}>
              <AnimatePresence mode="wait">
                {currentScreen === "dashboard" && (
                  <motion.div key="dashboard" {...pageTransition} className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl">
                    <Dashboard />
                  </motion.div>
                )}

                {currentScreen === "split-tunnel" && (
                  <motion.div
                    key="split-tunnel"
                    {...pageTransition}
                    className="absolute inset-0 bg-surface-app/90 backdrop-blur-xl"
                  >
                    <SplitTunnel />
                  </motion.div>
                )}

                {currentScreen === "servers" && (
                  <motion.div
                    key="servers"
                    {...pageTransition}
                    className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl"
                  >
                    <ServerList />
                  </motion.div>
                )}

                {currentScreen === "settings" && (
                  <motion.div
                    key="settings"
                    {...pageTransition}
                    className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl"
                  >
                    <Settings />
                  </motion.div>
                )}
              </AnimatePresence>
            </Suspense>
          </ErrorBoundary>
        </div>

        {/* Auto Update Toast */}
        <AnimatePresence>
          {updateAvailable && (
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
            >
              <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-[0_10px_40px_rgba(59,130,246,0.3)] bg-blue-500/10 border border-blue-500/30 backdrop-blur-xl">
                {updateReady ? (
                  <Download className="w-5 h-5 text-emerald-400 shrink-0" />
                ) : downloadProgress >= 0 ? (
                  <RefreshCw className="w-5 h-5 text-blue-400 shrink-0 animate-spin" />
                ) : (
                  <Info className="w-5 h-5 text-blue-400 shrink-0" />
                )}
                <div className="flex flex-col min-w-[160px]">
                  <p className="font-bold text-sm tracking-wide text-blue-100 leading-tight">
                    {updateReady
                      ? `v${updateVersion} готова к установке`
                      : downloadProgress >= 0
                        ? `Скачивание v${updateVersion}...`
                        : `Доступно обновление v${updateVersion}`}
                  </p>
                  {/* Progress bar */}
                  {downloadProgress >= 0 && !updateReady && (
                    <div className="w-full h-1 rounded-full bg-white/10 mt-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-400 transition-all duration-300"
                        style={{ width: `${downloadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
                {updateReady ? (
                  <button
                    onClick={() => getAPI()?.updater.install()}
                    className="ml-2 px-3 py-1.5 text-xs font-bold tracking-wide rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors cursor-pointer"
                  >
                    Установить
                  </button>
                ) : (
                  <button
                    onClick={() => setUpdateAvailable(false)}
                    className="ml-2 text-white/40 hover:text-white/70 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
