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
import { type CSSProperties, type ChangeEvent, type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AddServerTab = "url" | "file" | "qr" | "clipboard";

const NO_DRAG_STYLE = { WebkitAppRegion: "no-drag" } as CSSProperties;

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

export function AddServerModal({ isOpen, onClose }: AddServerModalProps) {
  const [activeTab, setActiveTab] = useState<AddServerTab>("clipboard");
  const [urlInput, setUrlInput] = useState("");
  const [clipboardText, setClipboardText] = useState("");
  const [clipboardLoading, setClipboardLoading] = useState(false);
  const [clipboardDone, setClipboardDone] = useState(false);

  // QR Code Scanning State
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanningRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanSuccess, setScanSuccess] = useState<{ added: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      stopScan();
      setUrlInput("");
      setClipboardText("");
      setClipboardDone(false);
      setScanSuccess(null);
      setScanError("");
      setIsDragOver(false);
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

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    previousActiveRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return () => {
      previousActiveRef.current?.focus();
    };
  }, [isOpen]);

  const handleImportUrl = async () => {
    if (!urlInput.trim()) return;

    const api = getAPI();
    if (!api) {
      return;
    }

    try {
      await api.import.text(urlInput);
      await useAppStore.getState().syncWithBackend();
    } catch (error: unknown) {
      console.error(error);
    }
    onClose();
  };

  const handleImportFile = async () => {
    const api = getAPI();
    if (!api) return;

    const pickedFile = await api.system.pickFile([
      { name: "VPN Config files", extensions: ["json", "yaml", "txt", "conf"] }
    ]);
    if (pickedFile) {
      try {
        await api.import.file(pickedFile);
        await useAppStore.getState().syncWithBackend();
        onClose();
      } catch (error: unknown) {
        console.error("Failed to import server file", error);
      }
    }
  };

  const handleClipboardImport = useCallback(async () => {
    setClipboardLoading(true);
    setClipboardDone(false);
    try {
      const api = getAPI();
      let text = "";
      if (api?.system?.readClipboard) {
        text = await api.system.readClipboard();
      } else {
        text = await navigator.clipboard.readText();
      }
      if (!text.trim()) {
        setClipboardText("Буфер обмена пуст");
        setClipboardLoading(false);
        return;
      }
      setClipboardText(text.substring(0, 200) + (text.length > 200 ? "..." : ""));

      if (api) {
        try {
          const result = await api.import.text(text);
          await useAppStore.getState().syncWithBackend();
          if (result && (result.added > 0 || result.subscriptionsAdded > 0)) {
            setClipboardDone(true);
            setTimeout(() => onClose(), 800);
          } else {
            setClipboardText("Узлов не найдено. Убедитесь, что ссылка корректна.");
          }
        } catch (importError: unknown) {
          setClipboardText(`Ошибка импорта: ${getErrorMessage(importError, "не удалось обработать")}`);
        }
      } else {
        setClipboardDone(true);
        setTimeout(() => onClose(), 800);
      }
    } catch (error: unknown) {
      setClipboardText(`Ошибка: ${getErrorMessage(error, "не удалось прочитать")}`);
    } finally {
      setClipboardLoading(false);
    }
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
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab" || !modalRef.current) return;
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable.item(0);
      const last = focusable.item(focusable.length - 1);
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleTab);
    // Auto-focus the first interactive control, falling back to the dialog container.
    requestAnimationFrame(() => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
        'button, input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
        return;
      }

      modalRef.current?.focus();
    });
    return () => window.removeEventListener("keydown", handleTab);
  }, [isOpen, onClose]);

  const startScan = async () => {
    setScanError("");
    setScanSuccess(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        scanningRef.current = true;
        setScanning(true);
        requestAnimationFrame(scanLoop);
      }
    } catch (error: unknown) {
      console.error("Screen share error", error);
      setScanError("Не удалось получить доступ к экрану для сканирования QR-кода.");
      scanningRef.current = false;
      setScanning(false);
    }
  };

  const stopScan = () => {
    scanningRef.current = false;
    setScanning(false);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      for (const track of stream.getTracks()) {
        track.stop();
      }
      videoRef.current.srcObject = null;
    }
  };

  const handleQrDetected = async (data: string) => {
    const api = getAPI();
    if (!api) {
      setScanError("Импорт недоступен в текущем окружении.");
      return;
    }

    try {
      const result = await api.import.text(data);
      await useAppStore.getState().syncWithBackend();
      const added = (result?.added ?? 0) + (result?.subscriptionsAdded ?? 0);
      if (added > 0) {
        setScanSuccess({ added });
        setTimeout(() => onClose(), 1200);
      } else {
        setScanError("QR-код распознан, но VPN-конфигурация не найдена.");
      }
    } catch (error: unknown) {
      setScanError(`Ошибка импорта: ${getErrorMessage(error, "не удалось обработать")}`);
    }
  };

  const scanLoop = () => {
    if (!videoRef.current || !canvasRef.current || !scanningRef.current) return;

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
          stopScan();
          handleQrDetected(code.data);
          return;
        }
      }
    }

    if (scanningRef.current) {
      requestAnimationFrame(scanLoop);
    }
  };

  const handleQrFromFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanError("");
    setScanSuccess(null);
    const objectUrl = URL.createObjectURL(file);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: "attemptBoth"
      });
      if (code) {
        handleQrDetected(code.data);
      } else {
        setScanError("QR-код не найден на изображении. Попробуйте другое фото.");
      }
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setScanError("Не удалось загрузить изображение.");
    };
    img.src = objectUrl;

    // Reset file input
    e.target.value = "";
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          style={NO_DRAG_STYLE}
          onMouseDown={onClose}
        >
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-server-modal-title"
            aria-describedby="add-server-modal-description"
            tabIndex={-1}
            className="w-full max-w-sm bg-panel/95 backdrop-blur-md border border-white/5 rounded-[2rem] shadow-2xl overflow-hidden relative"
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-white/5 flex items-center justify-between">
              <h2 id="add-server-modal-title" className="text-xl font-bold text-white tracking-wide">
                Добавить Сервер
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть окно добавления сервера"
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p id="add-server-modal-description" className="sr-only">
              Импортируйте сервер или подписку через буфер обмена, ссылку, файл конфигурации либо QR-код.
            </p>

            {/* Tabs */}
            <div className="flex p-1 bg-surface rounded-lg mx-6 mb-4">
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
                  <label htmlFor="add-server-url" className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Ссылка или подписка
                  </label>
                  <input
                    id="add-server-url"
                    type="text"
                    placeholder="vless://..."
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/50 transition-all font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleImportUrl}
                    className="w-full py-3.5 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 mt-2 bg-brand hover:brightness-110"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Добавить сервер</span>
                  </button>
                </motion.div>
              )}

              {activeTab === "file" && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex flex-col gap-4 items-center justify-center py-6"
                  onDragOver={(e: DragEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(true);
                  }}
                  onDragLeave={(e: DragEvent) => {
                    e.preventDefault();
                    setIsDragOver(false);
                  }}
                  onDrop={async (e: DragEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsDragOver(false);
                    const file = e.dataTransfer.files.item(0);
                    const api = getAPI();
                    if (file) {
                      const text = await file.text();
                      try {
                        await api?.import.text(text);
                        await useAppStore.getState().syncWithBackend();
                        onClose();
                      } catch (error: unknown) {
                        console.error("DnD import error", error);
                      }
                    }
                  }}
                >
                  <div
                    className={cn(
                      "w-16 h-16 rounded-2xl border flex items-center justify-center mb-2 transition-all duration-300",
                      isDragOver ? "bg-brand/20 border-brand/40 scale-110" : "bg-brand/10 border-brand/20"
                    )}
                  >
                    <UploadCloud
                      className={cn("w-8 h-8 transition-colors", isDragOver ? "text-brand" : "text-brand/70")}
                    />
                  </div>
                  <p className="text-sm text-center text-muted mb-2">
                    {isDragOver ? "Отпустите файл для импорта" : "Перетащите файл сюда или выберите вручную"}
                  </p>
                  <p className="text-xs text-center text-white/20 mb-2">.json, .yaml, .txt, .conf</p>
                  <button
                    type="button"
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
                  <div className="w-16 h-16 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-1">
                    {clipboardDone ? (
                      <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                    ) : clipboardLoading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                      >
                        <Loader2 className="w-8 h-8 text-brand" />
                      </motion.div>
                    ) : (
                      <ClipboardPaste className="w-8 h-8 text-brand" />
                    )}
                  </div>
                  <p className="text-sm text-center text-muted mb-1">
                    Нажмите кнопку или <span className="text-brand font-bold">Ctrl+V</span> в любой момент
                  </p>
                  {clipboardText && (
                    <div aria-live="polite" className="w-full bg-white/[0.03] rounded-xl p-3 border border-white/[0.06]">
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
                      type="button"
                      onClick={handleClipboardImport}
                      disabled={clipboardLoading}
                      className="w-full py-3.5 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 bg-brand hover:brightness-110 disabled:opacity-50"
                    >
                      <ClipboardPaste className="w-5 h-5" />
                      <span>Вставить из буфера</span>
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
                  {scanSuccess ? (
                    <div className="flex flex-col items-center gap-3 py-6">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                      </div>
                      <p className="text-sm font-bold text-emerald-400">QR-код распознан!</p>
                      <p className="text-xs text-muted">Импортировано узлов: {scanSuccess.added}</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-center text-muted mb-2">
                        Сканируйте экран или загрузите изображение с QR-кодом
                      </p>

                      <div className="w-full aspect-[4/3] bg-black border border-white/10 rounded-2xl overflow-hidden relative flex items-center justify-center">
                        <video
                          ref={videoRef}
                          className="absolute inset-0 w-full h-full object-cover opacity-50"
                          muted
                          playsInline
                        />
                        <canvas ref={canvasRef} className="hidden" />

                        {!scanning && !scanError && (
                          <button
                            type="button"
                            onClick={startScan}
                            className="relative z-10 py-2.5 px-5 text-white rounded-xl font-bold overflow-hidden"
                            style={{
                              background: "linear-gradient(135deg, #E0401E, #FF4C29)",
                              boxShadow: "0 4px 16px rgba(255,76,41,0.4)"
                            }}
                          >
                            <div className="absolute top-0 left-0 right-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" />
                            <span className="relative z-10 flex items-center gap-2">
                              <QrCode className="w-4 h-4" /> Сканировать экран
                            </span>
                          </button>
                        )}

                        {scanning && (
                          <div className="absolute inset-0 border-2 border-brand/50 rounded-2xl flex items-center justify-center pointer-events-none">
                            <div className="w-3/4 h-3/4 border-2 border-brand rounded-lg animate-pulse" />
                          </div>
                        )}

                        {scanError && (
                          <div aria-live="assertive" className="text-red-400 text-xs text-center p-4">
                            {scanError}
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 w-full">
                        {scanning ? (
                          <button
                            type="button"
                            onClick={stopScan}
                            className="flex-1 py-2.5 text-white/60 hover:text-white text-sm font-bold rounded-xl transition-colors bg-white/[0.04] border border-white/[0.08] hover:border-white/[0.15]"
                          >
                            Остановить
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 py-2.5 text-white/80 hover:text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 bg-white/[0.04] border border-white/[0.08] hover:border-brand/30 hover:bg-brand/5"
                          >
                            <UploadCloud className="w-4 h-4" /> Загрузить изображение
                          </button>
                        )}
                      </div>

                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleQrFromFile}
                        className="hidden"
                      />
                    </>
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
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-all relative rounded-md z-10",
        active ? "text-white" : "text-white/40 hover:text-white/80"
      )}
    >
      {active && (
        <motion.div
          layoutId="active-tab-indicator"
          className="absolute inset-0 bg-brand/90 rounded-md -z-10"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      )}
      {icon} {label}
    </button>
  );
}
