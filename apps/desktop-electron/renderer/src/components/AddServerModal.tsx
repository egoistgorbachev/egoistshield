import { AnimatePresence, motion } from "framer-motion";
import jsQR from "jsqr";
import {
  CheckCircle2,
  ClipboardPaste,
  FileJson,
  Link as LinkIcon,
  Loader2,
  QrCode,
  UploadCloud,
  X
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { type ServerConfig, useAppStore } from "../store/useAppStore";

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AddServerModal({ isOpen, onClose }: AddServerModalProps) {
  const [activeTab, setActiveTab] = useState<"url" | "file" | "qr" | "clipboard">("clipboard");
  const [urlInput, setUrlInput] = useState("");
  const [clipboardText, setClipboardText] = useState("");
  const [clipboardLoading, setClipboardLoading] = useState(false);
  const [clipboardDone, setClipboardDone] = useState(false);
  const { addServer } = useAppStore();

  // QR Code Scanning State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  useEffect(() => {
    if (!isOpen) {
      stopScan();
      setUrlInput("");
      setClipboardText("");
      setClipboardDone(false);
      setActiveTab("url");
    }
  }, [isOpen]);


  useEffect(() => {
    if (activeTab === "qr" && isOpen) {
      startScan();
    } else {
      stopScan();
    }
    return () => stopScan();
  }, [activeTab, isOpen]);

  const handleImportUrl = async () => {
    if (!urlInput.trim()) return;
    const gw = window as any;

    if (gw.egoistAPI) {
      try {
        await gw.egoistAPI.import.text(urlInput);
        await useAppStore.getState().syncWithBackend();
      } catch (err) {
        console.error(err);
        // Can add error state later
      }
    } else {
      let cc = "us";
      if (urlInput.toLowerCase().includes("de")) cc = "de";
      else if (urlInput.toLowerCase().includes("nl")) cc = "nl";

      const newServer: ServerConfig = {
        id: Math.random().toString(36).substring(7),
        name: `Link Connection (${cc.toUpperCase()})`,
        protocol: "unknown",
        ping: Math.floor(Math.random() * 60) + 20,
        load: Math.floor(Math.random() * 30) + 5,
        countryCode: cc,
        recommended: false
      };
      addServer(newServer);
    }
    onClose();
  };

  const handleImportFile = async () => {
    const globalWindow = window as any;
    if (!globalWindow.egoistAPI) return;

    const pickedFile = await globalWindow.egoistAPI.system.pickFile([
      { name: "VPN Config files", extensions: ["json", "yaml", "txt", "conf"] }
    ]);
    if (pickedFile) {
      try {
        await globalWindow.egoistAPI.import.file(pickedFile);
        await useAppStore.getState().syncWithBackend();
        onClose();
      } catch (err) {
        console.error("Failed to import server file", err);
      }
    }
  };

  const handleClipboardImport = useCallback(async () => {
    setClipboardLoading(true);
    setClipboardDone(false);
    try {
      const gw = window as any;
      let text = "";
      if (gw.egoistAPI?.system?.readClipboard) {
        text = await gw.egoistAPI.system.readClipboard();
      } else {
        text = await navigator.clipboard.readText();
      }
      if (!text.trim()) {
        setClipboardText("Буфер обмена пуст");
        setClipboardLoading(false);
        return;
      }
      setClipboardText(text.substring(0, 200) + (text.length > 200 ? "..." : ""));

      if (gw.egoistAPI) {
        try {
          const result = await gw.egoistAPI.import.text(text);
          await useAppStore.getState().syncWithBackend();
          if (result && (result.added > 0 || result.subscriptionsAdded > 0)) {
            setClipboardDone(true);
            setTimeout(() => onClose(), 800);
          } else {
            setClipboardText(`Узлов не найдено. Убедитесь, что ссылка корректна.`);
          }
        } catch (importErr: any) {
          setClipboardText(`Ошибка импорта: ${importErr.message || "не удалось обработать"}`);
        }
      } else {
        setClipboardDone(true);
        setTimeout(() => onClose(), 800);
      }
    } catch (err: any) {
      setClipboardText(`Ошибка: ${err.message || "не удалось прочитать"}`);
    }
    setClipboardLoading(false);
  }, [onClose]);

  // Global Ctrl+V handler when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        // Allow native paste inside the URL input field
        if (activeTab === "url") return;
        e.preventDefault();
        await handleClipboardImport();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, activeTab, handleClipboardImport]);

  // Focus trap — keep Tab inside modal
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener("keydown", handleTab);
    // Auto-focus the first <button> inside modal
    requestAnimationFrame(() => {
      modalRef.current?.querySelector<HTMLElement>("button, input")?.focus();
    });
    return () => window.removeEventListener("keydown", handleTab);
  }, [isOpen]);


  const startScan = async () => {
    setScanError("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser"
        }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setScanning(true);
        scanLoop();
      }
    } catch (err: any) {
      console.error("Screen share error", err);
      setScanError("Не удалось получить доступ к экрану для сканирования QR-кода.");
      setScanning(false);
    }
  };

  const stopScan = () => {
    setScanning(false);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const scanLoop = () => {
    if (!videoRef.current || !canvasRef.current || !scanning) return;

    if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "dontInvert"
        });

        if (code) {
          console.log("Found QR code", code.data);
          const gw = window as any;
          if (gw.egoistAPI) {
            gw.egoistAPI.import
              .text(code.data)
              .then(() => {
                useAppStore.getState().syncWithBackend();
              })
              .catch((err: any) => console.error(err));
          } else {
            const newServer: ServerConfig = {
              id: Math.random().toString(36).substring(7),
              name: "QR Imported Node",
              protocol: "unknown",
              ping: Math.floor(Math.random() * 60) + 20,
              load: Math.floor(Math.random() * 30) + 5,
              countryCode: "us",
              recommended: false
            };
            addServer(newServer);
          }
          stopScan();
          onClose();
          return;
        }
      }
    }

    if (scanning) {
      requestAnimationFrame(scanLoop);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          style={{ WebkitAppRegion: "no-drag" } as any}
          onClick={onClose}
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden relative"
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-white/5 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white tracking-wide">Добавить Сервер</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex p-2 bg-surface-app">
              <TabBtn
                active={activeTab === "clipboard"}
                onClick={() => setActiveTab("clipboard")}
                icon={<ClipboardPaste className="w-4 h-4" />}
                label="Буфер"
              />
              <TabBtn
                active={activeTab === "url"}
                onClick={() => setActiveTab("url")}
                icon={<LinkIcon className="w-4 h-4" />}
                label="Ссылка"
              />
              <TabBtn
                active={activeTab === "file"}
                onClick={() => setActiveTab("file")}
                icon={<FileJson className="w-4 h-4" />}
                label="Файл"
              />
              <TabBtn
                active={activeTab === "qr"}
                onClick={() => setActiveTab("qr")}
                icon={<QrCode className="w-4 h-4" />}
                label="QR"
              />
            </div>

            {/* Content */}
            <div className="p-6">
              {activeTab === "url" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-4"
                >
                  <p className="text-sm text-muted mb-2">
                    Вставьте ссылку vmess://, vless://, ss://, trojan:// или ссылку на подписку.
                  </p>
                  <input
                    type="text"
                    placeholder="vless://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all font-mono text-sm"
                  />
                  <button
                    onClick={handleImportUrl}
                    className="w-full py-3.5 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 mt-2 relative overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #FF4D00, #FF6B00, #FF8C38)",
                      boxShadow: "0 4px 20px rgba(255,107,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
                    }}
                  >
                    <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                    <CheckCircle2 className="w-5 h-5 relative z-10" />{" "}
                    <span className="relative z-10">Добавить сервер</span>
                  </button>
                </motion.div>
              )}

              {activeTab === "file" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-4 items-center justify-center py-6"
                >
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-2">
                    <UploadCloud className="w-8 h-8 text-orange-400" />
                  </div>
                  <p className="text-sm text-center text-muted mb-2">Поддерживаются форматы .json, .yaml, .txt</p>
                  <button
                    onClick={handleImportFile}
                    className="py-3 px-6 text-white/80 hover:text-white rounded-xl transition-all font-bold flex items-center gap-2 relative overflow-hidden"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)"
                    }}
                  >
                    <FileJson className="w-5 h-5" /> Выбрать файл
                  </button>
                </motion.div>
              )}

              {activeTab === "clipboard" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-4 items-center justify-center py-4"
                >
                  <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-1">
                    {clipboardDone ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    ) : clipboardLoading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      >
                        <Loader2 className="w-8 h-8 text-orange-400" />
                      </motion.div>
                    ) : (
                      <ClipboardPaste className="w-8 h-8 text-orange-400" />
                    )}
                  </div>
                  <p className="text-sm text-center text-muted mb-1">
                    Нажмите кнопку или <span className="text-brand font-bold">Ctrl+V</span> в любой момент
                  </p>
                  {clipboardText && (
                    <div className="w-full bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
                      <p
                        className={cn(
                          "text-xs font-mono break-all",
                          clipboardDone
                            ? "text-emerald-400/80"
                            : clipboardText.startsWith("Ошибка")
                              ? "text-red-400/80"
                              : "text-white/40"
                        )}
                      >
                        {clipboardText}
                      </p>
                    </div>
                  )}
                  {!clipboardDone && (
                    <button
                      onClick={handleClipboardImport}
                      disabled={clipboardLoading}
                      className="w-full py-3.5 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 relative overflow-hidden disabled:opacity-50"
                      style={{
                        background: "linear-gradient(135deg, #FF4D00, #FF6B00, #FF8C38)",
                        boxShadow: "0 4px 20px rgba(255,107,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)"
                      }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                      <ClipboardPaste className="w-5 h-5 relative z-10" />
                      <span className="relative z-10">Вставить из буфера</span>
                    </button>
                  )}
                </motion.div>
              )}

              {activeTab === "qr" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-4 items-center justify-center"
                >
                  <p className="text-sm text-center text-muted mb-2">Выберите окно с QR кодом для сканирования</p>

                  <div className="w-full aspect-square bg-black border border-white/10 rounded-2xl overflow-hidden relative flex items-center justify-center">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover opacity-50"
                      muted
                      playsInline
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {!scanning && !scanError && (
                      <button
                        onClick={startScan}
                        className="relative z-10 py-2.5 px-5 text-white rounded-xl font-bold overflow-hidden"
                        style={{
                          background: "linear-gradient(135deg, #FF4D00, #FF6B00)",
                          boxShadow: "0 4px 16px rgba(255,107,0,0.4)"
                        }}
                      >
                        <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                        <span className="relative z-10">Начать сканирование</span>
                      </button>
                    )}

                    {scanning && (
                      <div className="absolute inset-0 border-2 border-orange-500/50 rounded-2xl flex items-center justify-center pointer-events-none">
                        <div className="w-3/4 h-3/4 border-2 border-orange-400 rounded-lg animate-pulse" />
                      </div>
                    )}

                    {scanError && <div className="text-red-400 text-xs text-center p-4">{scanError}</div>}
                  </div>

                  {scanning && (
                    <button onClick={stopScan} className="text-xs text-white/40 hover:text-white mt-2">
                      Остановить
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label
}: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all relative rounded-t-xl",
        active ? "text-orange-400" : "text-white/40 hover:text-white/80"
      )}
    >
      {icon} {label}
      {active && (
        <motion.div
          layoutId="active-tab-indicator"
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-400"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
    </button>
  );
}
