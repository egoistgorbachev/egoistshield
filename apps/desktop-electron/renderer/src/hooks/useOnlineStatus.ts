import { useSyncExternalStore } from "react";

/** Подписка на online/offline события браузера */
function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

function getServerSnapshot(): boolean {
  return true; // SSR fallback — always online
}

/**
 * Хук для отслеживания online/offline статуса.
 * React 18+ concurrent-safe через useSyncExternalStore.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
