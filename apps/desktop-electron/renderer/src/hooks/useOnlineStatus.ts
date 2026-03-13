import { useSyncExternalStore } from "react";

/** Подписка на online/offline события браузера */
function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true; // SSR fallback — always online
}

/**
 * Хук для отслеживания online/offline статуса.
 * React 18+ concurrent-safe через useSyncExternalStore.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
