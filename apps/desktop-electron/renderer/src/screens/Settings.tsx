import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  HelpCircle,
  Loader2,
  Monitor,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";
import { Dialog } from "../components/Dialog";

export function Settings() {
  const tunMode = useAppStore((s) => s.tunMode);
  const fakeDns = useAppStore((s) => s.fakeDns);
  const killSwitch = useAppStore((s) => s.killSwitch);
  const autoConnect = useAppStore((s) => s.autoConnect);
  const notifications = useAppStore((s) => s.notifications);
  const autoStart = useAppStore((s) => s.autoStart);
  const hwAccel = useAppStore((s) => s.hwAccel);
  const protocol = useAppStore((s) => s.protocol);
  const updateSetting = useAppStore((s) => s.updateSetting);

  const [showResetModal, setShowResetModal] = useState(false);
  const [dnsLeakTesting, setDnsLeakTesting] = useState(false);
  const [dnsLeakResult, setDnsLeakResult] = useState<{ leaked: boolean; vpnIp: string | null; error: string | null } | null>(null);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateCheckResult, setUpdateCheckResult] = useState<"idle" | "upToDate" | "available" | "error">("idle");
  const [updateErrorMsg, setUpdateErrorMsg] = useState("");

  const runDnsLeakTest = async () => {
    setDnsLeakTesting(true);
    setDnsLeakResult(null);
    const api = getAPI();
    if (api?.system?.dnsLeakTest) {
      const result = await api.system.dnsLeakTest();
      setDnsLeakResult(result);
    } else {
      setDnsLeakResult({ leaked: false, vpnIp: null, error: "АPI недоступен" });
    }
    setDnsLeakTesting(false);
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
      <main className="relative z-10 flex-1 p-6 h-full overflow-y-auto custom-scrollbar">
        <div className="mb-8 mt-4">
          <h1 className="text-2xl font-display font-bold text-white/90 flex items-center gap-3">
            <SettingsIcon className="text-brand/60 w-7 h-7" />
            Настройки
          </h1>
          <p className="text-muted mt-2 text-sm font-medium tracking-wide">
            VPN ядро, безопасность и параметры приложения.
          </p>
        </div>

        <div className="max-w-6xl mx-auto w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start pb-12">
          <SettingsCard title="Системное ядро" icon={<Server className="w-5 h-5 text-brand" />}>
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
              label="Авто-подключение"
              description="VPN включается при запуске."
              tooltip="При старте приложения VPN автоматически подключится к последнему использованному серверу. Защита 24/7."
              enabled={autoConnect}
              onChange={() => updateSetting("autoConnect", !autoConnect)}
            />
            <ToggleRow
              label="Уведомления"
              description="Системные оповещения о статусе."
              tooltip="Показывать системные уведомления при подключении, отключении и ошибках VPN."
              enabled={notifications}
              onChange={() => updateSetting("notifications", !notifications)}
            />

            {/* DNS Leak Test */}
            <div className="flex items-center justify-between px-1 py-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-white/90">Проверка DNS</span>
                <span className="text-xs text-muted">Проверить утечку DNS запросов</span>
              </div>
              <button
                type="button"
                onClick={runDnsLeakTest}
                disabled={dnsLeakTesting}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  dnsLeakResult?.error ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : dnsLeakResult && !dnsLeakResult.leaked ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : dnsLeakResult?.leaked ? "bg-red-500/10 text-red-400 border border-red-500/20"
                    : "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10"
                )}
              >
                {dnsLeakTesting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Тестируем...</>
                ) : dnsLeakResult?.error ? (
                  <><AlertTriangle className="w-3.5 h-3.5" /> {dnsLeakResult.error}</>
                ) : dnsLeakResult && !dnsLeakResult.leaked ? (
                  <><ShieldCheck className="w-3.5 h-3.5" /> DNS защищён</>
                ) : dnsLeakResult?.leaked ? (
                  <><ShieldAlert className="w-3.5 h-3.5" /> Утечка DNS!</>
                ) : (
                  <><Shield className="w-3.5 h-3.5" /> Проверить</>
                )}
              </button>
            </div>

          </SettingsCard>

          <SettingsCard title="Транспортное ядро" className="h-full" icon={<Shield className="w-5 h-5 text-accent" />}>
            <div className="p-1.5 bg-void/60 rounded-2xl border border-white/5 flex gap-2 text-base mt-2 shadow-inner">
              <button
                type="button"
                onClick={() => updateSetting("protocol", "xray")}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold transition-all duration-300",
                  protocol === "xray"
                    ? "bg-gradient-to-r from-brand/15 to-accent/10 text-brand-light border border-brand/25 shadow-glow-brand"
                    : "bg-transparent text-muted hover:text-white/80 hover:bg-white/5 border border-transparent"
                )}
              >
                Xray
              </button>
              <button
                type="button"
                onClick={() => updateSetting("protocol", "singbox")}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold transition-all duration-300",
                  protocol === "singbox"
                    ? "bg-gradient-to-r from-brand/15 to-accent/10 text-brand-light border border-brand/25 shadow-glow-brand"
                    : "bg-transparent text-muted hover:text-white/80 hover:bg-white/5 border border-transparent"
                )}
              >
                Sing-box
              </button>
            </div>
            <p className="text-sm text-subtle px-2 mt-3 leading-relaxed">
              <b className="text-muted">Xray</b> — стабильнее для VLESS. Без TUN.{" "}
              <b className="text-muted">Sing-box</b> — поддерживает TUN, сплит-туннель, TUIC и WireGuard.
            </p>
          </SettingsCard>

          <SettingsCard title="Приложение" className="h-full" icon={<Monitor className="w-5 h-5 text-brand-light" />}>
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

            <ToggleRow
              label="Автообновление"
              description="Скачивать новые версии автоматически."
              tooltip="Приложение будет автоматически проверять и скачивать новые версии при запуске. Обновление установится при следующем перезапуске."
              enabled={autoUpdate}
              onChange={() => {
                const next = !autoUpdate;
                setAutoUpdate(next);
                const api = getAPI();
                api?.updater?.setAuto?.(next);
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
                  } catch (err: any) {
                    setUpdateChecking(false);
                    setUpdateCheckResult("error");
                    setUpdateErrorMsg(err?.message || "Не удалось проверить");
                    setTimeout(() => setUpdateCheckResult("idle"), 5000);
                  }
                }}
                disabled={updateChecking}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  updateCheckResult === "upToDate" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                    : updateCheckResult === "available" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    : updateCheckResult === "error" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    : "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10"
                )}
              >
                {updateChecking ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Проверяем...</>
                ) : updateCheckResult === "upToDate" ? (
                  <><CheckCircle2 className="w-3.5 h-3.5" /> Актуальная версия</>
                ) : updateCheckResult === "available" ? (
                  <><Download className="w-3.5 h-3.5" /> Есть обновление!</>
                ) : updateCheckResult === "error" ? (
                  <><AlertTriangle className="w-3.5 h-3.5" /> {updateErrorMsg || "Ошибка проверки"}</>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" /> Проверить</>
                )}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowResetModal(true)}
              className="mt-3 py-3.5 px-4 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-sm font-bold border border-red-500/20 hover:border-red-500/40 transition-all flex items-center justify-center gap-2"
            >
              Сбросить данные
            </button>
          </SettingsCard>
        </div>
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
      className={cn("glass-panel group rounded-[22px] p-6 transition-all duration-500 relative overflow-hidden", className)}
    >
      {/* Corner glow */}
      <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-bl from-brand/4 to-transparent rounded-full blur-[25px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

      {/* Title with gradient underline */}
      <div className="mb-5 relative z-10">
        <h3 className="text-[13px] font-display font-semibold text-white/85 flex items-center gap-3 tracking-[0.15em] uppercase">
          <div
            className="p-2 rounded-xl border border-brand/10 transition-colors"
            style={{ background: "rgba(255,107,0,0.06)" }}
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
      <div
        onClick={onChange}
        className="flex items-center justify-between py-4 border-b border-white/5 last:border-0 hover:bg-white/[0.03] -mx-6 px-6 transition-colors cursor-pointer group rounded-xl"
      >
        <div className="pr-4 py-1 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-base font-bold transition-colors",
                enabled ? "text-white" : "text-white/85 group-hover:text-white"
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
              className={cn(
                "transition-colors shrink-0",
                showTooltip ? "text-brand" : "text-whisper hover:text-brand"
              )}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
          <div
            className={cn(
              "text-sm font-medium mt-1.5 leading-relaxed transition-colors max-w-sm",
              enabled ? "text-white/60" : "text-muted"
            )}
          >
            {description}
          </div>
        </div>

        <div
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onChange();
            }
          }}
          className={cn(
            "relative w-12 h-[26px] flex items-center shrink-0 rounded-full p-[3px] cursor-pointer transition-all duration-400 border focus-visible:ring-2 focus-visible:ring-brand/50 outline-none",
            enabled ? "border-brand/30" : "bg-white/[0.04] border-white/[0.06]"
          )}
          style={
            enabled
              ? {
                  background: "linear-gradient(135deg, rgba(255,107,0,0.9), rgba(204,85,0,0.85))",
                  boxShadow: "0 0 20px rgba(255,107,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1)"
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
            <div className="mx-0 mb-2 p-3 rounded-xl bg-brand/5 border border-brand/15">
              <p className="text-sm text-muted leading-relaxed">💡 {tooltip}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
