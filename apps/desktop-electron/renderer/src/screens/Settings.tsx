import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Globe2,
  HelpCircle,
  Loader2,
  Monitor,
  RefreshCw,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  Wrench
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConnectionLogs } from "../components/ConnectionLogs";
import { Dialog } from "../components/Dialog";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";

type SettingsTab = "general" | "network" | "advanced";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "Основные", icon: <Monitor className="w-4 h-4" /> },
  { id: "network", label: "Сеть", icon: <Wifi className="w-4 h-4" /> },
  { id: "advanced", label: "Расширенные", icon: <Wrench className="w-4 h-4" /> }
];

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function Settings() {
  const fakeDns = useAppStore((s) => s.fakeDns);
  const killSwitch = useAppStore((s) => s.killSwitch);
  const autoUpdate = useAppStore((s) => s.autoUpdate);
  const autoConnect = useAppStore((s) => s.autoConnect);
  const notifications = useAppStore((s) => s.notifications);
  const autoStart = useAppStore((s) => s.autoStart);
  const systemDnsServers = useAppStore((s) => s.systemDnsServers);
  const setScreen = useAppStore((s) => s.setScreen);
  const updateSetting = useAppStore((s) => s.updateSetting);

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [showResetModal, setShowResetModal] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [routeProbeTesting, setRouteProbeTesting] = useState(false);
  const [routeProbeResult, setRouteProbeResult] = useState<{
    bypassDetected: boolean;
    directIp: string | null;
    vpnIp: string | null;
    error: string | null;
  } | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<"idle" | "upToDate" | "available" | "error">("idle");
  const [updateErrorMsg, setUpdateErrorMsg] = useState("");

  const runRouteProbe = async () => {
    setRouteProbeTesting(true);
    setRouteProbeResult(null);
    const api = getAPI();
    if (api?.system?.routeProbe) {
      const result = await api.system.routeProbe();
      setRouteProbeResult(result);
    } else if (api?.system?.dnsLeakTest) {
      const result = await api.system.dnsLeakTest();
      setRouteProbeResult(result);
    } else {
      setRouteProbeResult({ bypassDetected: false, directIp: null, vpnIp: null, error: "API недоступен" });
    }
    setRouteProbeTesting(false);
  };

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
        usageHistory: [],
        settings: {
          autoStart: false,
          startMinimized: false,
          autoUpdate: true,
          autoConnect: false,
          notifications: true,
          useTunMode: false,
          killSwitch: false,
          allowTelemetry: false,
          dnsMode: "auto",
          systemDnsServers: "",
          subscriptionUserAgent: "auto",
          runtimePath: "",
          routeMode: "global",
          zapretProfile: "General",
          zapretSuspendDuringVpn: true
        }
      });
    }
    toast.success("Настройки успешно сброшены. Приложение перезапустится...");
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  return (
    <>
      <main className="relative z-10 flex-1 p-6 h-full overflow-y-auto custom-scrollbar">
        <div className="mb-6 mt-4">
          <h1 className="text-2xl font-display font-bold text-white/90 flex items-center gap-3">
            <SettingsIcon className="text-brand/60 w-7 h-7" />
            Настройки
          </h1>
          <p className="text-muted mt-2 text-sm font-medium tracking-wide">
            Сеть, безопасность и системные параметры приложения.
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex p-1 rounded-2xl mb-6 glass-panel relative max-w-xl">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 z-10",
                activeTab === tab.id ? "text-brand" : "text-subtle hover:text-white/60"
              )}
            >
              {activeTab === tab.id && (
                <motion.div
                  layoutId="settings-tab-bg"
                  className="absolute inset-0 bg-brand/10 border border-brand/15 rounded-xl shadow-md"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                {tab.icon}
                {tab.label}
              </span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === "general" && (
            <motion.div
              key="general"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start pb-12"
            >
              <SettingsCard title="Приложение" icon={<Monitor className="w-5 h-5 text-brand-light" />}>
                <ToggleRow
                  label="Автозапуск"
                  description="Запуск при входе в Windows."
                  tooltip="Приложение автоматически запустится при загрузке системы. Удобно, если вы хотите всегда быть под защитой VPN без ручного запуска."
                  enabled={autoStart}
                  onChange={() => updateSetting("autoStart", !autoStart)}
                />
                <ToggleRow
                  label="Уведомления"
                  description="Системные оповещения о статусе."
                  tooltip="Показывать системные уведомления при подключении, отключении и ошибках VPN."
                  enabled={notifications}
                  onChange={() => updateSetting("notifications", !notifications)}
                />
                <ToggleRow
                  label="Автообновление"
                  description="Скачивать новые версии автоматически."
                  tooltip="Приложение будет автоматически проверять и скачивать новые версии при запуске. Обновление установится при следующем перезапуске."
                  enabled={autoUpdate}
                  onChange={() => {
                    const next = !autoUpdate;
                    updateSetting("autoUpdate", next);
                    const api = getAPI();
                    api?.updater?.setAuto?.(next).catch((error: unknown) => {
                      toast.error(getErrorMessage(error, "Не удалось обновить режим автообновления"));
                    });
                  }}
                />

                {/* Проверить обновления */}
                <div className="flex items-center justify-between px-1 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white/90">Обновления</span>
                    <span className="text-xs text-muted">v{__APP_VERSION__}</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      setUpdateChecking(true);
                      setUpdateCheckResult("idle");
                      const api = getAPI();
                      try {
                        const result = await api?.updater?.check?.();
                        setUpdateChecking(false);
                        if (result?.ok && result?.version) {
                          setUpdateCheckResult("available");
                        } else if (result?.ok) {
                          setUpdateCheckResult("upToDate");
                        } else {
                          setUpdateCheckResult("error");
                          setUpdateErrorMsg(result?.error || "Неизвестная ошибка");
                        }
                        setTimeout(() => setUpdateCheckResult("idle"), 5000);
                      } catch (error: unknown) {
                        setUpdateChecking(false);
                        setUpdateCheckResult("error");
                        setUpdateErrorMsg(getErrorMessage(error, "Не удалось проверить"));
                        setTimeout(() => setUpdateCheckResult("idle"), 5000);
                      }
                    }}
                    disabled={updateChecking}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                      updateCheckResult === "upToDate"
                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        : updateCheckResult === "available"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : updateCheckResult === "error"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10"
                    )}
                  >
                    {updateChecking ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Проверяем...
                      </>
                    ) : updateCheckResult === "upToDate" ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Актуальная версия
                      </>
                    ) : updateCheckResult === "available" ? (
                      <>
                        <Download className="w-3.5 h-3.5" /> Есть обновление!
                      </>
                    ) : updateCheckResult === "error" ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" /> {updateErrorMsg || "Ошибка проверки"}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" /> Проверить
                      </>
                    )}
                  </button>
                </div>
              </SettingsCard>
            </motion.div>
          )}

          {activeTab === "network" && (
            <motion.div
              key="network"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start pb-12"
            >
              <SettingsCard title="DNS-центр" icon={<Globe2 className="w-5 h-5 text-brand" />}>
                <div className="px-1 py-2 flex flex-col gap-4">
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-white/90">
                      {systemDnsServers
                        ? "Активен пользовательский системный DNS"
                        : "Используется системный DNS по умолчанию"}
                    </span>
                    <p className="text-xs text-muted leading-relaxed">
                      Полное управление системным DNS вынесено на отдельный экран с пресетами, ручным вводом и быстрым
                      сбросом до дефолтной конфигурации Windows.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-void/55 px-4 py-4 text-sm text-white/80">
                    {systemDnsServers || "По умолчанию Windows"}
                  </div>

                  <button
                    type="button"
                    onClick={() => setScreen("dns")}
                    className="w-full py-3 rounded-2xl bg-brand/15 border border-brand/30 text-brand-light text-sm font-bold hover:bg-brand/20 transition-colors"
                  >
                    Открыть DNS-центр
                  </button>
                </div>
              </SettingsCard>

              <SettingsCard
                title="Безопасность"
                className="h-full"
                icon={<ShieldAlert className="w-5 h-5 text-neon-red" />}
              >
                <ToggleRow
                  label="Kill Switch"
                  description="Блокировка трафика при обрыве VPN."
                  tooltip="Если VPN неожиданно отключится, весь интернет-трафик будет заблокирован. Это не даст утечь вашему реальному IP. Полезно при работе с чувствительными данными."
                  enabled={killSwitch}
                  onChange={() => updateSetting("killSwitch", !killSwitch)}
                />
                <ToggleRow
                  label="Secure DNS"
                  description="DNS через защищённый туннель VPN."
                  tooltip="Когда включено, DNS-запросы внутри VPN-конфига идут через защищённые резолверы вместо обычного системного DNS."
                  enabled={fakeDns}
                  onChange={() => updateSetting("fakeDns", !fakeDns)}
                />
                <ToggleRow
                  label="Авто-подключение"
                  description="VPN включается при запуске."
                  tooltip="При старте приложения VPN автоматически подключится к последнему использованному серверу. Защита 24/7."
                  enabled={autoConnect}
                  onChange={() => updateSetting("autoConnect", !autoConnect)}
                />
              </SettingsCard>

              <SettingsCard
                title="Автоподбор ядра"
                className="h-full"
                icon={<Shield className="w-5 h-5 text-accent" />}
              >
                <div className="px-1 py-2 flex flex-col gap-3">
                  <p className="text-sm text-white/85 leading-relaxed">
                    Приложение само выбирает и поднимает подходящее ядро под тип сервера:
                  </p>
                  <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 space-y-2 text-sm text-muted">
                    <p>
                      <span className="text-white/90 font-semibold">Xray</span> используется как основной вариант для
                      `VLESS / VMess / Trojan / Shadowsocks`, где он обычно даёт лучший баланс стабильности и задержки.
                    </p>
                    <p>
                      <span className="text-white/90 font-semibold">Sing-box</span> включается автоматически для
                      `Hysteria2 / TUIC / WireGuard` и остаётся fallback-вариантом там, где это реально полезно.
                    </p>
                    <p>
                      Smart Connect теперь переключает серверы плавнее, без принудительного обрыва старой сессии перед
                      подъёмом новой.
                    </p>
                  </div>
                </div>
              </SettingsCard>

              <SettingsCard
                title="Zapret Center"
                className="h-full"
                icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
              >
                <div className="px-1 py-2 flex flex-col gap-4">
                  <div className="rounded-2xl border border-white/8 bg-void/55 px-4 py-4 text-sm text-white/82">
                    Отдельный экран Zapret теперь полностью отвечает за службу, профили, автозапуск, диагностику,
                    Flowseal-инструменты и очистку кешей. В настройках оставляем только входную точку, чтобы не было
                    двух разных центров управления одной и той же системой.
                  </div>
                  <button
                    type="button"
                    onClick={() => setScreen("zapret")}
                    className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/16"
                  >
                    Открыть Zapret Center
                  </button>
                </div>
              </SettingsCard>
            </motion.div>
          )}

          {activeTab === "advanced" && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="max-w-6xl mx-auto w-full flex flex-col gap-6 pb-12"
            >
              <SettingsCard title="Диагностика" icon={<Shield className="w-5 h-5 text-accent" />}>
                {/* Route Probe */}
                <div className="flex items-center justify-between px-1 py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white/90">Проверка сетевого маршрута</span>
                    <span className="text-xs text-muted">Быстрый probe прямого и VPN egress-маршрута</span>
                  </div>
                  <button
                    type="button"
                    onClick={runRouteProbe}
                    disabled={routeProbeTesting}
                    className={cn(
                      "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                      routeProbeResult?.error
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                        : routeProbeResult && !routeProbeResult.bypassDetected
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : routeProbeResult?.bypassDetected
                            ? "bg-red-500/10 text-red-400 border border-red-500/20"
                            : "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10"
                    )}
                  >
                    {routeProbeTesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Тестируем...
                      </>
                    ) : routeProbeResult?.error ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5" /> {routeProbeResult.error}
                      </>
                    ) : routeProbeResult && !routeProbeResult.bypassDetected ? (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" /> Маршрут через VPN
                      </>
                    ) : routeProbeResult?.bypassDetected ? (
                      <>
                        <ShieldAlert className="w-3.5 h-3.5" /> Есть обход VPN
                      </>
                    ) : (
                      <>
                        <Shield className="w-3.5 h-3.5" /> Проверить
                      </>
                    )}
                  </button>
                </div>
                {routeProbeResult && !routeProbeResult.error && (
                  <div className="px-1 pt-1 text-xs leading-relaxed text-muted">
                    Прямой egress: {routeProbeResult.directIp ?? "неизвестно"} · VPN egress:{" "}
                    {routeProbeResult.vpnIp ?? "неизвестно"}
                  </div>
                )}
                <div className="px-1 pt-1 text-xs leading-relaxed text-muted">
                  Это быстрый egress-probe для поиска обхода VPN, а не лабораторный DNS leak test по реальным
                  resolver-серверам.
                </div>

                {/* Connection Logs */}
                <div className="flex items-center justify-between px-1 py-2 mt-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-white/90">Журнал подключений</span>
                    <span className="text-xs text-muted">Диагностические логи работы ядер</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowLogsModal(true)}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10"
                  >
                    <FileText className="w-3.5 h-3.5" /> Открыть
                  </button>
                </div>
              </SettingsCard>

              <SettingsCard title="Опасная зона" icon={<AlertTriangle className="w-5 h-5 text-red-400" />}>
                <ActionRow
                  label="Сброс настроек"
                  description="Вернуть приложение к заводскому состоянию."
                  tooltip="Удаляет все ваши настройки, профили, подписки и импортированные серверы. Приложение будет полностью очищено. Это действие нельзя отменить."
                  buttonText="Сбросить"
                  buttonIcon={<AlertTriangle className="w-4 h-4" />}
                  onClick={() => setShowResetModal(true)}
                  variant="danger"
                />
              </SettingsCard>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Модалка подтверждения сброса */}
      <Dialog isOpen={showResetModal} onClose={() => setShowResetModal(false)} title="Сброс данных">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <p className="text-sm text-muted leading-relaxed">
            Все настройки будут сброшены, импортированные серверы и подписки удалены. Это действие необратимо.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowResetModal(false)}
            className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/10 text-muted text-sm font-bold hover:bg-white/10 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors"
          >
            Сбросить
          </button>
        </div>
      </Dialog>

      {/* Модалка логов */}
      <Dialog
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        title="Журнал подключений"
        maxWidth="max-w-4xl w-full"
      >
        <div className="h-[65vh]">
          <ConnectionLogs />
        </div>
      </Dialog>
    </>
  );
}

function SettingsCard({
  title,
  icon,
  children,
  className
}: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      className={cn(
        "glass-panel group rounded-[22px] p-6 transition-all duration-500 relative overflow-hidden",
        className
      )}
    >
      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-brand/4 to-transparent rounded-full blur-[25px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      {/* Title with gradient underline */}
      <div className="mb-5 relative z-10">
        <h3 className="text-[13px] font-display font-semibold text-white/85 flex items-center gap-3 tracking-[0.15em] uppercase">
          <div
            className="p-2 rounded-xl border border-brand/10 transition-colors"
            style={{ background: "rgba(38,201,154,0.06)" }}
          >
            {icon}
          </div>
          {title}
        </h3>
        <div className="mt-3 h-px bg-gradient-to-r from-brand/15 via-brand/5 to-transparent" />
      </div>
      <div className="flex flex-col gap-1 relative z-10">{children}</div>
    </motion.div>
  );
}

function ToggleRow({
  label,
  description,
  tooltip,
  enabled,
  onChange
}: {
  label: string;
  description: string;
  tooltip: string;
  enabled: boolean;
  onChange: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] -mx-6 px-6 transition-colors group rounded-xl">
        <div className="pr-4 py-1 flex-1">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onChange} className="flex-1 text-left">
              <span
                className={cn(
                  "text-base font-bold transition-colors",
                  enabled ? "text-white" : "text-white/85 group-hover:text-white"
                )}
              >
                {label}
              </span>
              <div
                className={cn(
                  "text-sm font-medium mt-1.5 leading-relaxed transition-colors max-w-sm",
                  enabled ? "text-white/60" : "text-muted"
                )}
              >
                {description}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setShowTooltip(!showTooltip)}
              aria-label={`Подсказка: ${label}`}
              className={cn("transition-colors shrink-0", showTooltip ? "text-brand" : "text-whisper hover:text-brand")}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          onClick={onChange}
          className={cn(
            "relative w-12 h-[26px] flex items-center shrink-0 rounded-full p-[3px] cursor-pointer transition-all duration-400 border focus-visible:ring-2 focus-visible:ring-brand/50 outline-none",
            enabled ? "border-brand/30" : "bg-white/[0.04] border-white/[0.06]"
          )}
          style={
            enabled
              ? {
                  background: "linear-gradient(135deg, rgba(38,201,154,0.9), rgba(4,120,87,0.85))",
                  boxShadow: "0 0 20px rgba(38,201,154,0.25), inset 0 1px 0 rgba(255,255,255,0.1)"
                }
              : {}
          }
        >
          <motion.div
            layout
            className="w-5 h-5 bg-white rounded-full shadow-md z-10"
            style={{ marginLeft: enabled ? "auto" : 0, marginRight: enabled ? 0 : "auto" }}
            transition={{ type: "spring", stiffness: 600, damping: 28 }}
          />
        </button>
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
            <div className="mx-0 mb-2 p-3 rounded-xl bg-brand/5 border border-brand/15">
              <p className="text-sm text-muted leading-relaxed">💡 {tooltip}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ActionRow({
  label,
  description,
  tooltip,
  buttonText,
  buttonIcon,
  onClick,
  variant = "default"
}: {
  label: string;
  description: string;
  tooltip: string;
  buttonText: string;
  buttonIcon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] -mx-6 px-6 transition-colors group rounded-xl">
        <div className="pr-4 py-1 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-base font-bold transition-colors",
                variant === "danger" ? "text-red-400" : "text-white"
              )}
            >
              {label}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowTooltip(!showTooltip);
              }}
              className={cn("transition-colors shrink-0", showTooltip ? "text-brand" : "text-whisper hover:text-brand")}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div className="text-sm font-medium mt-1.5 leading-relaxed transition-colors max-w-sm text-muted">
            {description}
          </div>
        </div>

        <div className="shrink-0 flex items-center">
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2",
              variant === "danger"
                ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/40"
                : "bg-white/5 hover:bg-white/10 text-white border border-white/10"
            )}
          >
            {buttonIcon}
            {buttonText}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-0 mb-2 p-3 rounded-xl bg-brand/5 border border-brand/15">
              <p className="text-sm text-muted leading-relaxed">💡 {tooltip}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
