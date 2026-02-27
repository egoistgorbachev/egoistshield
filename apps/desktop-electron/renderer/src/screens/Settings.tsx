import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings as SettingsIcon, Server, Shield, Monitor, ShieldAlert, HelpCircle, AlertTriangle } from "lucide-react";
import { cn } from "../lib/cn";
import { getAPI } from "../lib/api";
import { useAppStore } from "../store/useAppStore";

export function Settings() {
    const tunMode = useAppStore(s => s.tunMode);
    const fakeDns = useAppStore(s => s.fakeDns);
    const killSwitch = useAppStore(s => s.killSwitch);
    const multihop = useAppStore(s => s.multihop);
    const autoStart = useAppStore(s => s.autoStart);
    const hwAccel = useAppStore(s => s.hwAccel);
    const protocol = useAppStore(s => s.protocol);
    const updateSetting = useAppStore(s => s.updateSetting);


    const [showResetModal, setShowResetModal] = useState(false);

    const handleReset = async () => {
        setShowResetModal(false);
        localStorage.removeItem("egoist-storage");
        const api = getAPI();
        if (api) {
            await api.state.set({
                nodes: [],
                activeNodeId: null,
                subscriptions: [],
                processRules: [],
                domainRules: [],
                settings: {
                    autoStart: false,
                    startMinimized: false,
                    autoUpdate: true,
                    useTunMode: false,
                    killSwitch: false,
                    allowTelemetry: false,
                    dnsMode: "auto",
                    subscriptionUserAgent: "auto",
                    runtimePath: "",
                    routeMode: "global"
                }
            });
        }
        window.location.reload();
    };

    return (
        <>
            <main className="relative z-10 flex-1 p-6 h-full pb-28 overflow-y-auto custom-scrollbar">
                <div className="mb-8 mt-4">
                    <h1 className="text-4xl font-bold text-white flex items-center gap-3 drop-shadow-md">
                        <SettingsIcon className="text-white/80 w-9 h-9" />
                        Настройки
                    </h1>
                    <p className="text-white/50 mt-2 text-lg font-medium">
                        VPN ядро, безопасность и параметры приложения.
                    </p>
                </div>

                <div className="max-w-6xl mx-auto w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start pb-12">
                    <SettingsCard title="Системное ядро" icon={<Server className="w-6 h-6 text-orange-400" />}>
                        <ToggleRow
                            label="TUN режим"
                            description="Виртуальный адаптер (только Sing-box)."
                            tooltip="Перенаправляет ВЕСЬ трафик через VPN-адаптер. Работает ТОЛЬКО с ядром Sing-box (не Xray). Необходим для сплит-туннеля — например, Chrome через VPN, а игры напрямую."
                            enabled={tunMode}
                            onChange={() => {
                                const newTun = !tunMode;
                                updateSetting("tunMode", newTun);
                                // TUN работает только с Sing-box → автопереключение
                                if (newTun && protocol !== "singbox") {
                                    updateSetting("protocol", "singbox");
                                }
                            }}
                        />
                        <ToggleRow
                            label="Secure DNS"
                            description="Защищённые DNS-запросы."
                            tooltip="Когда включено, DNS-запросы шифруются и не видны провайдеру. Полезно для обхода блокировок по DNS. Рекомендуется держать включённым."
                            enabled={fakeDns}
                            onChange={() => updateSetting("fakeDns", !fakeDns)}
                        />
                    </SettingsCard>

                    <SettingsCard title="Безопасность" className="h-full" icon={<ShieldAlert className="w-6 h-6 text-red-500" />}>
                        <ToggleRow
                            label="Kill Switch"
                            description="Блокировка трафика при обрыве VPN."
                            tooltip="Если VPN неожиданно отключится, весь интернет-трафик будет заблокирован. Это не даст утечь вашему реальному IP. Полезно при работе с чувствительными данными."
                            enabled={killSwitch}
                            onChange={() => updateSetting("killSwitch", !killSwitch)}
                        />
                        <ToggleRow
                            label="Мультихоп"
                            description="Двойная маршрутизация трафика."
                            tooltip="Трафик проходит через 2 сервера вместо одного. Повышает анонимность, но замедляет соединение. Включайте, если нужна максимальная приватность, а скорость не критична."
                            enabled={multihop}
                            onChange={() => updateSetting("multihop", !multihop)}
                        />
                    </SettingsCard>

                    <SettingsCard title="Транспортное ядро" className="h-full" icon={<Shield className="w-6 h-6 text-yellow-500" />}>
                        <div className="p-1.5 bg-black/40 rounded-2xl border border-white/5 flex gap-2 text-base mt-2 shadow-inner">
                            <button
                                onClick={() => updateSetting("protocol", "xray")}
                                className={cn(
                                    "flex-1 py-3 rounded-xl font-bold transition-all duration-300",
                                    protocol === "xray"
                                        ? "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                                        : "bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent"
                                )}
                            >
                                Xray
                            </button>
                            <button
                                onClick={() => updateSetting("protocol", "singbox")}
                                className={cn(
                                    "flex-1 py-3 rounded-xl font-bold transition-all duration-300",
                                    protocol === "singbox"
                                        ? "bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-400 border border-orange-500/30 shadow-[0_0_20px_rgba(249,115,22,0.15)]"
                                        : "bg-transparent text-white/40 hover:text-white/80 hover:bg-white/5 border border-transparent"
                                )}
                            >
                                Sing-box
                            </button>
                        </div>
                        <p className="text-sm text-white/30 px-2 mt-3 leading-relaxed">
                            <b className="text-white/50">Xray</b> — стабильнее для VLESS. Без TUN.{" "}
                            <b className="text-white/50">Sing-box</b> — поддерживает TUN, сплит-туннель, TUIC и WireGuard.
                        </p>
                    </SettingsCard>

                    <SettingsCard title="Приложение" className="h-full" icon={<Monitor className="w-6 h-6 text-blue-400" />}>
                        <ToggleRow
                            label="Автозапуск"
                            description="Запуск при входе в Windows."
                            tooltip="Приложение автоматически запустится при загрузке системы. Удобно, если вы хотите всегда быть под защитой VPN без ручного запуска."
                            enabled={autoStart}
                            onChange={() => updateSetting("autoStart", !autoStart)}
                        />
                        <ToggleRow
                            label="Аппаратное ускорение"
                            description="GPU-рендеринг интерфейса."
                            tooltip="Использует видеокарту для отрисовки интерфейса. Включите для плавных анимаций. Выключите, если приложение мерцает или потребляет много GPU."
                            enabled={hwAccel}
                            onChange={() => updateSetting("hwAccel", !hwAccel)}
                        />


                        <button
                            onClick={() => setShowResetModal(true)}
                            className="mt-3 py-3.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-bold border border-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center gap-2"
                        >
                            Сбросить данные
                        </button>
                    </SettingsCard>
                </div>
            </main>

            {/* Модалка подтверждения сброса */}
            <AnimatePresence>
                {showResetModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowResetModal(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="bg-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                    <AlertTriangle className="w-5 h-5 text-red-400" />
                                </div>
                                <h3 className="text-lg font-bold text-white">Сброс данных</h3>
                            </div>
                            <p className="text-sm text-white/60 mb-6 leading-relaxed">
                                Все настройки будут сброшены, импортированные серверы и подписки удалены. Это действие необратимо.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowResetModal(false)}
                                    className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm font-bold hover:bg-white/10 transition-colors"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors"
                                >
                                    Сбросить
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function SettingsCard({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            className={cn(
                "group bg-black/20 border border-white/5 hover:border-white/10 rounded-3xl p-6 backdrop-blur-xl shadow-lg transition-colors duration-500 relative",
                className
            )}
        >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-[40px] pointer-events-none" />
            <h3 className="text-base font-black text-white flex items-center gap-3 mb-6 opacity-90 tracking-widest uppercase">
                <div className="p-2 bg-white/5 rounded-xl border border-white/10">{icon}</div>
                {title}
            </h3>
            <div className="flex flex-col gap-2 relative z-10">{children}</div>
        </motion.div>
    );
}

function ToggleRow({ label, description, tooltip, enabled, onChange }: {
    label: string;
    description: string;
    tooltip: string;
    enabled: boolean;
    onChange: () => void;
}) {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <div>
            <div
                onClick={onChange}
                className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] -mx-6 px-6 transition-colors cursor-pointer group rounded-xl"
            >
                <div className="pr-4 py-1 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={cn("text-base font-bold transition-colors", enabled ? "text-white" : "text-white/80 group-hover:text-white")}>
                            {label}
                        </span>
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowTooltip(!showTooltip); }}
                            className={cn(
                                "transition-colors shrink-0",
                                showTooltip ? "text-orange-400" : "text-white/20 hover:text-orange-400"
                            )}
                        >
                            <HelpCircle className="w-4 h-4" />
                        </button>
                    </div>
                    <div
                        className={cn(
                            "text-sm font-medium mt-1.5 leading-relaxed transition-colors max-w-sm",
                            enabled ? "text-white/60" : "text-white/40"
                        )}
                    >
                        {description}
                    </div>
                </div>

                <div
                    className={cn(
                        "relative w-14 h-7 flex items-center shrink-0 rounded-full p-1 cursor-pointer transition-colors duration-300 border",
                        enabled ? "bg-orange-500 border-orange-400/50 shadow-[0_0_15px_rgba(249,115,22,0.4)]" : "bg-black/50 border-white/10"
                    )}
                >
                    <motion.div
                        layout
                        className="w-5 h-5 bg-white rounded-full shadow-md z-10"
                        style={{ marginLeft: enabled ? "auto" : 0, marginRight: enabled ? 0 : "auto" }}
                        transition={{ type: "spring", stiffness: 600, damping: 28 }}
                    />
                </div>
            </div>

            {/* Инлайн-подсказка — раскрывается внутри карточки */}
            <AnimatePresence>
                {showTooltip && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <div className="mx-0 mb-2 p-3 rounded-xl bg-orange-500/5 border border-orange-500/15">
                            <p className="text-sm text-white/70 leading-relaxed">
                                💡 {tooltip}
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
