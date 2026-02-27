import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Link as LinkIcon, FileJson, QrCode, UploadCloud, CheckCircle2 } from "lucide-react";
import { cn } from "../lib/cn";
import { useAppStore, ServerConfig } from "../store/useAppStore";
import jsQR from "jsqr";

interface AddServerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function AddServerModal({ isOpen, onClose }: AddServerModalProps) {
    const [activeTab, setActiveTab] = useState<'url' | 'file' | 'qr'>('url');
    const [urlInput, setUrlInput] = useState("");
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
            setActiveTab('url');
        }
    }, [isOpen]);

    useEffect(() => {
        if (activeTab === 'qr' && isOpen) {
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

        const pickedFile = await globalWindow.egoistAPI.system.pickFile([{ name: 'VPN Config files', extensions: ['json', 'yaml', 'txt', 'conf'] }]);
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

    const startScan = async () => {
        setScanError("");
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "browser",
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
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
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
                    inversionAttempts: "dontInvert",
                });

                if (code) {
                    console.log("Found QR code", code.data);
                    const gw = window as any;
                    if (gw.egoistAPI) {
                        gw.egoistAPI.import.text(code.data).then(() => {
                            useAppStore.getState().syncWithBackend();
                        }).catch((err: any) => console.error(err));
                    } else {
                        const newServer: ServerConfig = {
                            id: Math.random().toString(36).substring(7),
                            name: `QR Imported Node`,
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm" style={{ WebkitAppRegion: "no-drag" } as any}>
                    <motion.div
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
                                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex p-2 bg-surface-app">
                            <TabBtn active={activeTab === 'url'} onClick={() => setActiveTab('url')} icon={<LinkIcon className="w-4 h-4" />} label="Ссылка" />
                            <TabBtn active={activeTab === 'file'} onClick={() => setActiveTab('file')} icon={<FileJson className="w-4 h-4" />} label="Файл" />
                            <TabBtn active={activeTab === 'qr'} onClick={() => setActiveTab('qr')} icon={<QrCode className="w-4 h-4" />} label="QR Код" />
                        </div>

                        {/* Content */}
                        <div className="p-6">
                            {activeTab === 'url' && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4">
                                    <p className="text-sm text-white/50 mb-2">Вставьте ссылку vmess://, vless://, ss://, trojan:// или ссылку на подписку.</p>
                                    <input
                                        type="text"
                                        placeholder="vless://..."
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-white/20 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 transition-all font-mono text-sm"
                                    />
                                    <button
                                        onClick={handleImportUrl}
                                        className="w-full py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white font-bold rounded-xl shadow-[0_0_20px_rgba(249,115,22,0.3)] transition-all flex items-center justify-center gap-2 mt-2"
                                    >
                                        <CheckCircle2 className="w-5 h-5" /> Добавить сервер
                                    </button>
                                </motion.div>
                            )}

                            {activeTab === 'file' && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 items-center justify-center py-6">
                                    <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-2">
                                        <UploadCloud className="w-8 h-8 text-orange-400" />
                                    </div>
                                    <p className="text-sm text-center text-white/50 mb-2">Поддерживаются форматы .json, .yaml, .txt</p>
                                    <button
                                        onClick={handleImportFile}
                                        className="py-3 px-6 bg-white/5 hover:bg-orange-500/20 text-white hover:text-orange-400 border border-white/10 hover:border-orange-500/50 rounded-xl transition-all font-bold flex items-center gap-2"
                                    >
                                        <FileJson className="w-5 h-5" /> Выбрать файл
                                    </button>
                                </motion.div>
                            )}

                            {activeTab === 'qr' && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 items-center justify-center">
                                    <p className="text-sm text-center text-white/50 mb-2">Выберите окно с QR кодом для сканирования</p>

                                    <div className="w-full aspect-square bg-black border border-white/10 rounded-2xl overflow-hidden relative flex items-center justify-center">
                                        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover opacity-50" muted playsInline />
                                        <canvas ref={canvasRef} className="hidden" />

                                        {!scanning && !scanError && (
                                            <button onClick={startScan} className="relative z-10 py-2 px-4 bg-orange-500 hover:bg-orange-400 text-white rounded-lg font-bold">
                                                Начать сканирование
                                            </button>
                                        )}

                                        {scanning && (
                                            <div className="absolute inset-0 border-2 border-orange-500/50 rounded-2xl flex items-center justify-center pointer-events-none">
                                                <div className="w-3/4 h-3/4 border-2 border-orange-400 rounded-lg animate-pulse" />
                                            </div>
                                        )}

                                        {scanError && (
                                            <div className="text-red-400 text-xs text-center p-4">{scanError}</div>
                                        )}
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

function TabBtn({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
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
