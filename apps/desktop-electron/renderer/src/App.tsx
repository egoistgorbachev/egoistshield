import React, { useEffect, Suspense, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BottomNav } from "./components/BottomNav";
import { TitleBar } from "./components/TitleBar";
import { OfflineBanner } from "./components/OfflineBanner";
import { SplashScreen } from "./components/SplashScreen";
import { useAppStore } from "./store/useAppStore";
import { getAPI } from "./lib/api";
import { pageTransition } from "./lib/motion";
import { Info } from "lucide-react";

// Code splitting — экраны грузятся отложенно
const Dashboard = React.lazy(() => import("./screens/Dashboard").then(m => ({ default: m.Dashboard })));
const SplitTunnel = React.lazy(() => import("./screens/SplitTunnel").then(m => ({ default: m.SplitTunnel })));
const Settings = React.lazy(() => import("./screens/Settings").then(m => ({ default: m.Settings })));
const ServerList = React.lazy(() => import("./screens/ServerList").then(m => ({ default: m.ServerList })));
const Onboarding = React.lazy(() => import("./screens/Onboarding").then(m => ({ default: m.Onboarding })));

// Fallback для Suspense — минимальный лоадер
function ScreenLoader() {
  return <div className="w-full h-full flex items-center justify-center bg-surface-app">
    <div className="w-8 h-8 border-2 border-brand-light/30 border-t-brand-light rounded-full animate-spin" />
  </div>;
}

export function App() {
  const currentScreen = useAppStore(state => state.currentScreen);
  const isFirstRun = useAppStore(state => state.isFirstRun);
  const checkFirstRun = useAppStore(state => state.checkFirstRun);
  const syncWithBackend = useAppStore(state => state.syncWithBackend);
  const installRuntime = useAppStore(state => state.installRuntime);
  
  const [updateAvailable, setUpdateAvailable] = useState(false);
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
    if (api?.updater?.onUpdateAvailable) {
      api.updater.onUpdateAvailable(() => {
        setUpdateAvailable(true);
      });
    }
  }, [isFirstRun, installRuntime, syncWithBackend]);

  if (isFirstRun === null) {
    return <div className="w-full h-screen bg-surface-app" />;
  }

  // Если первый старт, сразу рендерим онбординг (без сплеша)
  if (isFirstRun) {
    return <Suspense fallback={<ScreenLoader />}><Onboarding /></Suspense>;
  }

  return (
    <div className="relative w-full h-screen bg-surface-app flex flex-col overflow-hidden text-white font-sans selection:bg-brand/30">
      <AnimatePresence>
        {showSplash && <SplashScreen key="splash" />}
      </AnimatePresence>

      <TitleBar />
      <OfflineBanner />

      <div className="flex-1 relative overflow-hidden mt-8">
        <Suspense fallback={<ScreenLoader />}>
          <AnimatePresence mode="wait">
            {currentScreen === 'dashboard' && (
              <motion.div key="dashboard" {...pageTransition} className="absolute inset-0">
                <Dashboard />
              </motion.div>
            )}

            {currentScreen === 'split-tunnel' && (
              <motion.div key="split-tunnel" {...pageTransition} className="absolute inset-0 bg-surface-app/90 backdrop-blur-xl">
                <SplitTunnel />
              </motion.div>
            )}

            {currentScreen === 'servers' && (
              <motion.div key="servers" {...pageTransition} className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl">
                <ServerList />
              </motion.div>
            )}

            {currentScreen === 'settings' && (
              <motion.div key="settings" {...pageTransition} className="absolute inset-0 bg-surface-app/95 backdrop-blur-3xl">
                <Settings />
              </motion.div>
            )}
          </AnimatePresence>
        </Suspense>
      </div>

      <BottomNav />

      {/* Auto Update Toast */}
      <AnimatePresence>
        {updateAvailable && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-50 pointer-events-auto cursor-pointer"
            onClick={() => setUpdateAvailable(false)}
          >
            <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-[0_10px_40px_rgba(59,130,246,0.3)] bg-blue-500/10 border border-blue-500/30 backdrop-blur-xl">
              <Info className="w-5 h-5 text-blue-400 shrink-0" />
              <div>
                <p className="font-bold text-sm tracking-wide text-blue-100 leading-tight">Доступно обновление!</p>
                <p className="text-[10px] text-blue-200/60 uppercase tracking-widest mt-0.5">Перезапустите приложение</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
