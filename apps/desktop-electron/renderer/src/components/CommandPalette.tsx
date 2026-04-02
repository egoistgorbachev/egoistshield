/**
 * CommandPalette — Raycast-style global command palette (Ctrl+K)
 *
 * Features:
 *  • Fuzzy search across servers, navigation, actions
 *  • Keyboard-first: ↑/↓ navigate, Enter execute, Esc close
 *  • Groups: Серверы, Навигация, Действия
 *  • Auto-closes on action execution
 */
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Globe, LayoutDashboard, Search, Send, Server, Settings, Shield, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MOTION } from "../lib/motion";
import type { ServerConfig } from "../store/useAppStore";
import { useAppStore } from "../store/useAppStore";

interface CommandItem {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  group: "servers" | "navigation" | "actions";
  action: () => void;
  keywords?: string; // extra search terms
}

const groupLabels: Record<CommandItem["group"], string> = {
  navigation: "Навигация",
  actions: "Действия",
  servers: "Серверы"
};

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Store selectors
  const servers = useAppStore((s) => s.servers);
  const setScreen = useAppStore((s) => s.setScreen);
  const connectToServer = useAppStore((s) => s.connectToServer);
  const toggleConnection = useAppStore((s) => s.toggleConnection);
  const smartConnect = useAppStore((s) => s.smartConnect);
  const isConnected = useAppStore((s) => s.isConnected);

  // Global Ctrl+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isToggleShortcut = (e.ctrlKey || e.metaKey) && e.code === "KeyK";
      if (isToggleShortcut) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setActiveIndex(0);
      // Small delay for animation
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Build command items
  const items: CommandItem[] = useMemo(() => {
    const nav: CommandItem[] = [
      {
        id: "nav-dashboard",
        label: "Главная",
        sublabel: "Ctrl+1",
        icon: <LayoutDashboard className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("dashboard"),
        keywords: "dashboard дашборд главная"
      },
      {
        id: "nav-servers",
        label: "Серверы",
        sublabel: "Ctrl+2",
        icon: <Server className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("servers"),
        keywords: "servers серверы список"
      },
      {
        id: "nav-settings",
        label: "Настройки",
        sublabel: "Ctrl+3",
        icon: <Settings className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("settings"),
        keywords: "settings настройки конфиг"
      },
      {
        id: "nav-dns",
        label: "DNS",
        sublabel: "Ctrl+4",
        icon: <Globe className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("dns"),
        keywords: "dns резолвер система интернет"
      },
      {
        id: "nav-zapret",
        label: "Zapret",
        sublabel: "Ctrl+5",
        icon: <Zap className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("zapret"),
        keywords: "zapret dpi winws flowseal обход"
      },
      {
        id: "nav-telegram-proxy",
        label: "Прокси Telegram",
        sublabel: "Ctrl+6",
        icon: <Send className="w-4 h-4" />,
        group: "navigation",
        action: () => setScreen("telegram-proxy"),
        keywords: "telegram proxy прокси telegram mtproto tg ws proxy flowseal"
      }
    ];

    const actions: CommandItem[] = [
      {
        id: "action-toggle",
        label: isConnected ? "Отключиться" : "Подключиться",
        sublabel: "Ctrl+Shift+C",
        icon: <Shield className="w-4 h-4" />,
        group: "actions",
        action: () => toggleConnection(),
        keywords: "connect disconnect подключить отключить vpn"
      },
      {
        id: "action-smart",
        label: "Умное подключение",
        sublabel: "Ctrl+Shift+S",
        icon: <Zap className="w-4 h-4" />,
        group: "actions",
        action: () => smartConnect(),
        keywords: "умный smart быстрый автоматический"
      }
    ];

    const serverItems: CommandItem[] = servers.slice(0, 20).map((s: ServerConfig) => ({
      id: `server-${s.id}`,
      label: s.name,
      sublabel: `${s.protocol.toUpperCase()} · ${s.countryCode.toUpperCase()}${s.ping > 0 ? ` · ${s.ping}ms` : ""}`,
      icon: <Globe className="w-4 h-4" />,
      group: "servers" as const,
      action: () => connectToServer(s.id),
      keywords: `${s.countryName || ""} ${s._host || ""}`
    }));

    return [...nav, ...actions, ...serverItems];
  }, [servers, isConnected, setScreen, connectToServer, toggleConnection, smartConnect]);

  // Filter items by query (simple fuzzy)
  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q) ||
        item.keywords?.toLowerCase().includes(q)
    );
  }, [items, query]);

  // Group filtered items
  const grouped = useMemo(() => {
    const groups: Record<CommandItem["group"], CommandItem[]> = {
      navigation: [],
      actions: [],
      servers: []
    };

    for (const item of filtered) {
      groups[item.group].push(item);
    }
    const order: CommandItem["group"][] = ["navigation", "actions", "servers"];

    return order.filter((g) => groups[g]?.length).map((g) => ({ group: g, items: groups[g] }));
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  // Clamp activeIndex
  useEffect(() => {
    if (activeIndex >= flatItems.length) setActiveIndex(Math.max(0, flatItems.length - 1));
  }, [activeIndex, flatItems.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && flatItems[activeIndex]) {
        e.preventDefault();
        flatItems[activeIndex]?.action();
        setIsOpen(false);
      }
    },
    [flatItems, activeIndex]
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const executeItem = (item: CommandItem) => {
    item.action();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-overlay bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
          />

          {/* Palette */}
          <motion.div
            className="fixed top-[15%] left-1/2 z-modal w-full max-w-[520px] -translate-x-1/2"
            initial={{ opacity: 0, y: -20, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={MOTION.spring.snappy}
          >
            <div className="overflow-hidden rounded-2xl border border-[var(--es-glass-border)] bg-[var(--es-bg-surface)]/95 backdrop-blur-xl shadow-lg">
              {/* Search input */}
              <div className="flex items-center gap-3 border-b border-[var(--es-glass-border)] px-4 py-3">
                <Search className="w-5 h-5 text-[var(--es-text-dim)] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Поиск серверов, действий, навигации..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-[var(--es-text-whisper)] outline-none"
                  autoComplete="off"
                  spellCheck={false}
                />
                <kbd className="hidden sm:block text-[10px] text-[var(--es-text-dim)] border border-[var(--es-glass-border)] rounded px-1.5 py-0.5 font-mono">
                  Esc
                </kbd>
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[340px] overflow-y-auto p-1.5 scrollbar-thin">
                {grouped.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-[var(--es-text-dim)]">
                    <Activity className="w-8 h-8 mb-2 opacity-30" />
                    <span className="text-sm">Ничего не найдено</span>
                  </div>
                ) : (
                  grouped.map(({ group, items: groupItems }) => (
                    <div key={group}>
                      <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--es-text-whisper)]">
                        {groupLabels[group] || group}
                      </div>
                      {groupItems.map((item) => {
                        const idx = flatIndex++;
                        const isActive = idx === activeIndex;
                        return (
                          <button
                            type="button"
                            key={item.id}
                            data-index={idx}
                            onClick={() => executeItem(item)}
                            onMouseEnter={() => setActiveIndex(idx)}
                            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                              isActive ? "bg-brand/10 text-white" : "text-[var(--es-text)] hover:bg-white/5"
                            }`}
                          >
                            <span className={`shrink-0 ${isActive ? "text-brand" : "text-[var(--es-text-dim)]"}`}>
                              {item.icon}
                            </span>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.sublabel && (
                              <span className="text-[11px] text-[var(--es-text-dim)] font-mono shrink-0">
                                {item.sublabel}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>

              {/* Footer hints */}
              <div className="flex items-center gap-4 border-t border-[var(--es-glass-border)] px-4 py-2 text-[10px] text-[var(--es-text-dim)]">
                <span>
                  <kbd className="font-mono border border-[var(--es-glass-border)] rounded px-1 py-0.5 mr-1">↑↓</kbd>
                  навигация
                </span>
                <span>
                  <kbd className="font-mono border border-[var(--es-glass-border)] rounded px-1 py-0.5 mr-1">Enter</kbd>
                  выполнить
                </span>
                <span>
                  <kbd className="font-mono border border-[var(--es-glass-border)] rounded px-1 py-0.5 mr-1">Esc</kbd>
                  закрыть
                </span>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
