import { AnimatePresence, motion } from "framer-motion";
import { Cpu, FileCode2, Plus, Search, ShieldAlert, ShieldCheck, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";

type Tab = "proxy" | "bypass";

interface Process {
  name: string;
  path: string;
}

export function SplitTunnel() {
  const proxyApps = useAppStore((s) => s.proxyApps);
  const bypassApps = useAppStore((s) => s.bypassApps);
  const addProxyApp = useAppStore((s) => s.addProxyApp);
  const addBypassApp = useAppStore((s) => s.addBypassApp);
  const removeProxyApp = useAppStore((s) => s.removeProxyApp);
  const removeBypassApp = useAppStore((s) => s.removeBypassApp);
  const [activeTab, setActiveTab] = useState<Tab>("proxy");
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [processes, setProcesses] = useState<Process[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const apps = activeTab === "proxy" ? proxyApps : bypassApps;

  const fetchProcesses = async () => {
    setIsLoading(true);
    const api = getAPI();
    if (api) {
      const list = await api.system.listProcesses();
      setProcesses(list);
    }
    setIsLoading(false);
  };

  const handleOpenAddMenu = () => {
    setIsAddMenuOpen(true);
    fetchProcesses();
  };

  const handlePickFile = async () => {
    const api = getAPI();
    if (api) {
      const pickedFile = await api.system.pickFile([{ name: "Applications", extensions: ["exe"] }]);
      if (pickedFile) {
        const fileName = pickedFile.split("\\").pop() || pickedFile.split("/").pop() || pickedFile;
        addSelectedApp(fileName, pickedFile);
      }
    }
    setIsAddMenuOpen(false);
  };

  const addSelectedApp = async (fileName: string, path?: string) => {
    const iconData: string | undefined = undefined;
    // Keep fetching base64 icon data only if path is missing or we want legacy support,
    // but ProcessIcon will naturally fetch via path if provided.
    // If we still want to store it, we can.

    const appData: import("../store/useAppStore").App = { name: fileName, icon: iconData, path: path };
    if (activeTab === "proxy" && !proxyApps.find((a) => a.name === fileName)) {
      addProxyApp(appData);
    } else if (activeTab === "bypass" && !bypassApps.find((a) => a.name === fileName)) {
      addBypassApp(appData);
    }
    setIsAddMenuOpen(false);
    setSearchQuery("");
  };

  const filteredProcesses = processes.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as (File & { path: string })[];
    for (const file of files) {
      if (file.name.toLowerCase().endsWith(".exe")) {
        await addSelectedApp(file.name, file.path);
      }
    }
  };

  return (
    <main
      className="relative z-10 flex-1 flex flex-col p-6 h-full overflow-hidden"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 pointer-events-none"
          >
            <div
              className={cn(
                "w-full h-full rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-colors",
                activeTab === "proxy"
                  ? "border-orange-500/50 text-orange-400 bg-orange-500/5"
                  : "border-white/20 text-muted bg-white/5"
              )}
            >
              <div className="w-20 h-20 mb-4 bg-white/5 rounded-full flex items-center justify-center">
                <FileCode2 className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-black tracking-widest uppercase">Перетащите .exe файл сюда</h2>
              <p className="mt-2 text-muted font-medium">
                Программа будет добавлена в список "{activeTab === "proxy" ? "Защищенные" : "Исключения"}"
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-4 mt-2 text-center">
        <h1 className="text-2xl font-black text-white flex items-center justify-center gap-2 drop-shadow-md tracking-wider">
          <Zap className="text-orange-400 w-6 h-6" />
          ТУННЕЛИРОВАНИЕ
        </h1>
        <p className="text-muted mt-1 text-sm font-medium">Маршрутизация трафика для приложений.</p>
      </div>

      {/* Custom Tabs Symmetric */}
      <div role="tablist" aria-label="Режим туннелирования" className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 mb-6 shadow-inner relative z-10 w-full max-w-md mx-auto shrink-0">
        <TabButton
          active={activeTab === "proxy"}
          onClick={() => setActiveTab("proxy")}
          icon={<ShieldCheck className={cn("w-5 h-5", activeTab === "proxy" ? "text-orange-400" : "text-muted")} />}
          label="Через VPN"
        />
        <TabButton
          active={activeTab === "bypass"}
          onClick={() => setActiveTab("bypass")}
          icon={<ShieldAlert className={cn("w-5 h-5", activeTab === "bypass" ? "text-orange-400" : "text-muted")} />}
          label="Напрямую"
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 w-full max-w-5xl mx-auto bg-white/[0.02] border border-white/5 rounded-3xl p-5 flex flex-col overflow-hidden backdrop-blur-md shadow-2xl relative">
        <div
          className={cn(
            "absolute top-0 inset-x-0 h-32 rounded-t-3xl blur-[50px] opacity-20 pointer-events-none transition-colors duration-700",
            activeTab === "proxy" ? "bg-orange-500" : "bg-white/40"
          )}
        />

        <div className="flex items-center justify-between mb-4 z-10 px-2 pb-2 border-b border-white/5">
          <span className="text-sm font-bold text-muted uppercase tracking-widest">
            {activeTab === "proxy" ? "Защищенные (Proxy)" : "Исключения (Bypass)"}
          </span>
          <span className="text-xs font-bold text-white bg-white/10 px-3 py-1.5 rounded-xl">
            {apps.length} Программ
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-2 custom-scrollbar relative z-10 pb-4">
          <AnimatePresence mode="popLayout">
            {apps.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {apps.map((app) => (
                  <motion.div
                    layout
                    key={app.name}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <AppItem
                      name={app.name}
                      path={app.path}
                      icon={app.icon}
                      isActive={activeTab === "proxy"}
                      onRemove={() => (activeTab === "proxy" ? removeProxyApp(app.name) : removeBypassApp(app.name))}
                    />
                  </motion.div>
                ))}
              </div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center text-center mt-6"
              >
                <div className="relative w-24 h-24 mb-6">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.5, 0.2] }}
                    transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY, ease: "easeInOut" }}
                    className={cn(
                      "absolute inset-0 rounded-full blur-xl",
                      activeTab === "proxy" ? "bg-orange-500" : "bg-white/40"
                    )}
                  />
                  {activeTab === "proxy" ? (
                    <ShieldCheck className="w-full h-full text-orange-400 relative z-10 drop-shadow-xl" />
                  ) : (
                    <ShieldAlert className="w-full h-full text-muted relative z-10 drop-shadow-xl" />
                  )}
                </div>
                <p className="text-xl font-black text-white/90 mb-2 uppercase tracking-wide drop-shadow-sm">
                  {activeTab === "proxy" ? "Нет защищенных программ" : "Нет исключений"}
                </p>
                <p className="text-sm font-medium text-white/40 max-w-[250px] leading-relaxed">
                  Нажмите <b>"Добавить"</b> ниже или просто перетащите сюда <b>.exe</b> файл.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Add button */}
        <motion.button
          onClick={handleOpenAddMenu}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "mt-auto p-3.5 rounded-[18px] flex items-center justify-center gap-2 font-bold text-sm uppercase tracking-wide border transition-all shadow-lg z-10 backdrop-blur-md",
            activeTab === "proxy"
              ? "bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/20 hover:border-orange-500/30"
              : "bg-white/5 border-white/10 text-muted hover:bg-white/10 hover:text-white"
          )}
        >
          <Plus className="w-5 h-5" />
          Добавить программу
        </motion.button>
      </div>

      {/* Task Manager Modal */}
      <AnimatePresence>
        {isAddMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-void-card border border-white/10 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80%]"
            >
              <div className="flex items-center justify-between p-5 border-b border-white/5">
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-orange-400" />
                  Выберите приложение
                </h3>
                <button
                  type="button"
                  onClick={() => setIsAddMenuOpen(false)}
                  className="p-2 text-muted hover:text-white hover:bg-white/5 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 flex gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
                  <input
                    type="text"
                    placeholder="Поиск по задачам..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-black/40 border border-white/5 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-orange-500/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={handlePickFile}
                  className="flex items-center gap-2 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-medium transition-colors"
                >
                  <FileCode2 className="w-4 h-4" />
                  .exe
                </button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {isLoading ? (
                  <div className="flex flex-col gap-2 p-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5 animate-pulse"
                      >
                        <div className="w-8 h-8 bg-white/10 rounded-lg shrink-0" />
                        <div className="flex flex-col gap-2 w-full">
                          <div className="h-3.5 bg-white/20 rounded-md w-1/3" />
                          <div className="h-2.5 bg-white/10 rounded-md w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filteredProcesses.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {filteredProcesses.map((p) => (
                      <button
                        type="button"
                        key={p.name}
                        onClick={() => addSelectedApp(p.name, p.path)}
                        className="flex items-center gap-3 p-3 bg-transparent hover:bg-white/5 rounded-xl transition-colors text-left"
                      >
                        <div className="w-8 h-8 shrink-0 flex items-center justify-center bg-black/40 rounded-lg shadow-inner overflow-hidden">
                          <ProcessIcon path={p.path} fallback="📦" />
                        </div>
                        <div className="flex flex-col overflow-hidden w-full">
                          <span className="font-bold text-[15px] truncate">{p.name}</span>
                          <span className="text-[11px] text-subtle truncate w-full">{p.path}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center text-muted p-10 text-sm">Ничего не найдено</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm uppercase tracking-wide transition-all duration-300 z-10",
        active ? "text-white" : "text-muted hover:text-white/60"
      )}
    >
      {active && (
        <motion.div
          layoutId="split-tab"
          className="absolute inset-0 bg-white/10 rounded-xl"
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        />
      )}
      <span className="relative z-10 flex items-center gap-2">
        {icon}
        {label}
      </span>
    </button>
  );
}

function AppItem({
  name,
  path,
  icon,
  isActive,
  onRemove
}: { name: string; path?: string; icon?: string; isActive: boolean; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between p-2 pl-3 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all group shadow-sm">
      <div className="flex items-center gap-3 overflow-hidden pr-2">
        <div
          className={cn(
            "w-8 h-8 rounded-[10px] flex items-center justify-center text-sm shadow-inner transition-colors overflow-hidden shrink-0",
            isActive
              ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
              : "bg-white/5 text-muted border border-white/5"
          )}
        >
          {path ? (
            <ProcessIcon path={path} fallback="📦" />
          ) : icon?.startsWith("data:image") ? (
            <img src={icon} alt="" className="w-5 h-5 object-contain" />
          ) : (
            "📦"
          )}
        </div>
        <div className="font-bold text-[15px] text-white/90 group-hover:text-white truncate">{name}</div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="w-8 h-8 rounded-xl flex items-center justify-center bg-transparent hover:bg-red-500/20 text-whisper hover:text-red-400 transition-colors"
        title="Удалить"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

function ProcessIcon({ path, fallback }: { path: string; fallback: string }) {
  const [icon, setIcon] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "100px" }
    );
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isMounted = true;
    const api = getAPI();
    if (isVisible && path && api) {
      api.system.getAppIcon(path).then((res: string | null) => {
        if (isMounted && res) setIcon(res);
      });
    }
    return () => {
      isMounted = false;
    };
  }, [path, isVisible]);

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center">
      {icon ? (
        <img src={icon} alt="" className="w-5 h-5 object-contain" />
      ) : (
        <span className="text-base opacity-50">{fallback}</span>
      )}
    </div>
  );
}
