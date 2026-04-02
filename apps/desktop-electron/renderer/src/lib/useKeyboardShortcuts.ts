/**
 * useKeyboardShortcuts — глобальные горячие клавиши приложения
 *
 * Ctrl+1 → Dashboard
 * Ctrl+2 → Серверы
 * Ctrl+3 → Настройки
 * Ctrl+4 → DNS
 * Ctrl+5 → Zapret
 * Ctrl+6 → Telegram Proxy
 * Ctrl+Shift+C → Toggle VPN connection
 * Ctrl+Shift+S → Smart Connect
 */
import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && !e.shiftKey) {
        switch (e.code) {
          case "Digit1":
            e.preventDefault();
            useAppStore.getState().setScreen("dashboard");
            break;
          case "Digit2":
            e.preventDefault();
            useAppStore.getState().setScreen("servers");
            break;
          case "Digit3":
            e.preventDefault();
            useAppStore.getState().setScreen("settings");
            break;
          case "Digit4":
            e.preventDefault();
            useAppStore.getState().setScreen("dns");
            break;
          case "Digit5":
            e.preventDefault();
            useAppStore.getState().setScreen("zapret");
            break;
          case "Digit6":
            e.preventDefault();
            useAppStore.getState().setScreen("telegram-proxy");
            break;
        }
      }

      if (ctrl && e.shiftKey) {
        switch (e.code) {
          case "KeyC":
            e.preventDefault();
            useAppStore.getState().toggleConnection();
            break;
          case "KeyS":
            e.preventDefault();
            useAppStore.getState().smartConnect();
            break;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}
