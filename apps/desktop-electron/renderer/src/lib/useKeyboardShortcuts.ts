/**
 * useKeyboardShortcuts — глобальные горячие клавиши приложения
 *
 * Ctrl+1 → Dashboard
 * Ctrl+2 → Серверы
 * Ctrl+3 → Настройки
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
        switch (e.key) {
          case "1":
            e.preventDefault();
            useAppStore.getState().setScreen("dashboard");
            break;
          case "2":
            e.preventDefault();
            useAppStore.getState().setScreen("servers");
            break;
          case "3":
            e.preventDefault();
            useAppStore.getState().setScreen("settings");
            break;
        }
      }

      if (ctrl && e.shiftKey) {
        switch (e.key.toUpperCase()) {
          case "C":
            e.preventDefault();
            useAppStore.getState().toggleConnection();
            break;
          case "S":
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
