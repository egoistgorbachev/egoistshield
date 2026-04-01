import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Download,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Settings2,
  Shield,
  TestTube2,
  Trash2,
  Wrench,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ZapretAutoSelectResult,
  ZapretCommandResult,
  ZapretDiagnosticsReport,
  ZapretGameFilterMode,
  ZapretIpsetMode,
  ZapretStatus,
  ZapretUpdateInfo
} from "../../../electron/ipc/contracts";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { buildZapretProfileOptions, loadZapretBootstrapState } from "../lib/zapret-bootstrap";
import { useAppStore } from "../store/useAppStore";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function Zapret() {
  const zapretProfile = useAppStore((s) => s.zapretProfile);
  const zapretSuspendDuringVpn = useAppStore((s) => s.zapretSuspendDuringVpn);
  const updateSetting = useAppStore((s) => s.updateSetting);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ name: string; fileName: string }>>([]);
  const [status, setStatus] = useState<ZapretStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<ZapretDiagnosticsReport | null>(null);
  const [updates, setUpdates] = useState<ZapretUpdateInfo | null>(null);
  const [autoSelectResult, setAutoSelectResult] = useState<ZapretAutoSelectResult | null>(null);
  const [cacheCleanupResult, setCacheCleanupResult] = useState<ZapretCommandResult | null>(null);

  const api = getAPI();

  const load = async () => {
    setLoading(true);
    try {
      const nextState = await loadZapretBootstrapState(api);
      setStatus(nextState.status);
      setProfiles(nextState.profiles);
      setIsAdmin(nextState.isAdmin);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось загрузить Zapret"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runStatusAction = async (label: string, action: () => Promise<ZapretStatus>, successMessage: string) => {
    setBusy(label);
    try {
      const next = await action();
      setStatus(next);
      toast.success(successMessage);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Операция Zapret завершилась ошибкой"));
    } finally {
      setBusy(null);
    }
  };

  const runCommandAction = async <T extends { message: string }>(
    label: string,
    action: () => Promise<T>,
    successFallback: string,
    onSuccess?: (result: T) => void | Promise<void>
  ) => {
    setBusy(label);
    try {
      const result = await action();
      await onSuccess?.(result);
      toast.success(result.message || successFallback);
      await load();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Операция Zapret завершилась ошибкой"));
    } finally {
      setBusy(null);
    }
  };

  const handleProfileChange = async (nextProfile: string) => {
    updateSetting("zapretProfile", nextProfile);
    if (!api?.zapret || !status) return;

    try {
      if (status.standaloneRunning) {
        const next = await api.zapret.restartStandalone(nextProfile);
        setStatus(next);
        toast.success(`Standalone Zapret перезапущен на профиле ${nextProfile}.`);
      } else if (status.serviceRunning) {
        const next = await api.zapret.setServiceProfile(nextProfile);
        setStatus(next);
        toast.success(`Служба Zapret переведена на профиль ${nextProfile}.`);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось применить профиль Zapret"));
    }
  };

  const driverText = useMemo(
    () =>
      status?.drivers
        .map((driver) => `${driver.name}: ${driver.running ? "RUNNING" : driver.installed ? "INSTALLED" : "ABSENT"}`)
        .join(" · ") ?? "—",
    [status]
  );
  const profileOptions = useMemo(() => buildZapretProfileOptions(profiles, zapretProfile), [profiles, zapretProfile]);
  const statusActionsDisabled = loading || !api || !status;
  const commandActionsDisabled = loading || !api;
  const standaloneRunning = Boolean(status?.standaloneRunning);
  const serviceInstalled = Boolean(status?.serviceInstalled);
  const serviceRunning = Boolean(status?.serviceRunning);
  const runtimeAvailable = Boolean(status?.available);
  const maintenanceActionsDisabled = commandActionsDisabled || !runtimeAvailable;

  return (
    <main className="relative z-10 flex-1 p-6 h-full overflow-y-auto custom-scrollbar">
      <div className="mb-6 mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white/90 flex items-center gap-3">
            <Zap className="text-brand/70 w-7 h-7" />
            Zapret Control
          </h1>
          <p className="text-muted mt-2 text-sm font-medium tracking-wide">
            Отдельный центр управления Flowseal Core, `winws` и автозапускаемой службой.
          </p>
        </div>
        <div className={cn("rounded-2xl px-4 py-2 text-xs font-bold border", isAdmin ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300")}>
          {isAdmin ? "Администратор" : "Нужны права администратора"}
        </div>
      </div>

      <div className="grid gap-6 max-w-7xl mx-auto lg:grid-cols-2 pb-12">
        <Panel title="Состояние" icon={<Activity className="w-5 h-5 text-brand-light" />}>
          <StatusLine label="Профиль" value={zapretProfile} />
          <StatusLine label="Winws" value={status?.winwsRunning ? "Активен" : "Остановлен"} />
          <StatusLine label="Standalone" value={status?.standaloneRunning ? `PID ${status.standalonePid ?? "?"}` : "Нет"} />
          <StatusLine label="Служба" value={status?.serviceRunning ? "RUNNING" : status?.serviceInstalled ? "Установлена" : "Не установлена"} />
          <StatusLine label="Core" value={status?.coreVersion || "—"} />
          <StatusLine label="Драйверы" value={driverText} />
          <StatusLine label="Game Filter" value={status?.gameFilterMode || "disabled"} />
          <StatusLine label="IPSet" value={status?.ipsetMode || "loaded"} />
          {status?.lastError ? <ErrorBox>{status.lastError}</ErrorBox> : null}
        </Panel>

        <Panel title="Профиль И Запуск" icon={<Power className="w-5 h-5 text-emerald-300" />}>
          <label className="text-sm font-semibold text-white/90">Профиль Zapret</label>
          <select
            value={zapretProfile}
            onChange={(event) => void handleProfileChange(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
          >
            {profileOptions.map((profile) => (
              <option key={profile.fileName} value={profile.name} className="bg-slate-950 text-white">
                {profile.name}
              </option>
            ))}
          </select>
          {profiles.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-xs leading-relaxed text-muted">
              {status?.available
                ? `Список профилей ещё не успел прогрузиться. Пока используем сохранённый профиль: ${zapretProfile}.`
                : "Bundled runtime Zapret пока недоступен, поэтому показываем сохранённый профиль до полной инициализации."}
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <ActionButton
              busy={busy === "start-standalone"}
              disabled={statusActionsDisabled || serviceRunning}
              title={serviceRunning ? "Сначала остановите службу Zapret." : undefined}
              onClick={() => runStatusAction("start-standalone", () => api!.zapret.startStandalone(zapretProfile), "Standalone Zapret запущен.")}
            >
              <Play className="w-4 h-4" /> Запустить standalone
            </ActionButton>
            <ActionButton
              busy={busy === "stop-standalone"}
              tone="warning"
              disabled={statusActionsDisabled || !standaloneRunning}
              title={!standaloneRunning ? "Standalone сейчас не запущен." : undefined}
              onClick={() => runStatusAction("stop-standalone", () => api!.zapret.stopStandalone(), "Standalone Zapret остановлен.")}
            >
              <Power className="w-4 h-4" /> Остановить standalone
            </ActionButton>
            <ActionButton
              busy={busy === "auto-select"}
              tone="accent"
              disabled={statusActionsDisabled || serviceRunning}
              title={serviceRunning ? "Сначала остановите службу Zapret." : undefined}
              onClick={async () => {
                setBusy("auto-select");
                try {
                  const result = await api!.zapret.autoSelect();
                  setAutoSelectResult(result);
                  if (result.bestProfile) {
                    updateSetting("zapretProfile", result.bestProfile);
                    const next = await api!.zapret.startStandalone(result.bestProfile);
                    setStatus(next);
                    toast.success(`Лучший профиль найден: ${result.bestProfile}. Standalone перезапущен автоматически.`);
                  } else {
                    toast.warning("Автоподбор не нашёл рабочего профиля.");
                  }
                } catch (error: unknown) {
                  toast.error(getErrorMessage(error, "Автоподбор профилей Zapret завершился ошибкой"));
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Bot className="w-4 h-4" /> Автоподбор
            </ActionButton>
            <ActionButton
              busy={busy === "reset-network"}
              tone="danger"
              disabled={statusActionsDisabled}
              onClick={() => runStatusAction("reset-network", () => api!.zapret.resetNetworkState(), "Состояние Winws и служб Zapret сброшено.")}
            >
              <Trash2 className="w-4 h-4" /> Сбросить winws
            </ActionButton>
          </div>
          {autoSelectResult ? (
            <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-3">
              <div className="font-semibold text-white/90">Автоподбор</div>
              <div className="mt-2">Лучший профиль: {autoSelectResult.bestProfile ?? "не найден"}</div>
              <div className="mt-1 text-xs text-muted">Рабочие: {autoSelectResult.goodProfiles.join(", ") || "—"}</div>
            </div>
          ) : null}
        </Panel>

        <Panel title="Служба" icon={<Shield className="w-5 h-5 text-cyan-300" />}>
          <ToggleRow
            label="Приостанавливать во время VPN"
            enabled={zapretSuspendDuringVpn}
            disabled={statusActionsDisabled}
            onChange={() => updateSetting("zapretSuspendDuringVpn", !zapretSuspendDuringVpn)}
          />
          {standaloneRunning ? (
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/8 px-4 py-3 text-xs leading-relaxed text-cyan-100/85">
              Standalone сейчас активен. При установке или запуске службы приложение сначала аккуратно остановит
              standalone, а затем переключится в service-режим.
            </div>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
            <ActionButton
              busy={busy === "install-service"}
              disabled={statusActionsDisabled || !runtimeAvailable}
              title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
              onClick={() => runStatusAction("install-service", () => api!.zapret.installService(zapretProfile), "Служба Zapret установлена или переустановлена.")}
            >
              <Shield className="w-4 h-4" /> Установить службу
            </ActionButton>
            <ActionButton
              busy={busy === "start-service"}
              tone="success"
              disabled={statusActionsDisabled || !serviceInstalled || serviceRunning}
              title={!serviceInstalled ? "Сначала установите службу Zapret." : serviceRunning ? "Служба уже запущена." : undefined}
              onClick={() => runStatusAction("start-service", () => api!.zapret.startService(), "Служба Zapret запущена.")}
            >
              <Play className="w-4 h-4" /> Запустить службу
            </ActionButton>
            <ActionButton
              busy={busy === "stop-service"}
              tone="warning"
              disabled={statusActionsDisabled || !serviceRunning}
              title={!serviceInstalled ? "Служба ещё не установлена." : !serviceRunning ? "Служба уже остановлена." : undefined}
              onClick={() => runStatusAction("stop-service", () => api!.zapret.stopService(), "Служба Zapret остановлена.")}
            >
              <Power className="w-4 h-4" /> Остановить службу
            </ActionButton>
            <ActionButton
              busy={busy === "remove-service"}
              tone="danger"
              disabled={statusActionsDisabled || !serviceInstalled}
              title={!serviceInstalled ? "Служба ещё не установлена." : undefined}
              onClick={() => runStatusAction("remove-service", () => api!.zapret.removeService(), "Служба Zapret удалена.")}
            >
              <Trash2 className="w-4 h-4" /> Удалить службу
            </ActionButton>
          </div>
        </Panel>

        <Panel title="Тюнинг Flowseal" icon={<Settings2 className="w-5 h-5 text-fuchsia-300" />}>
          <div className="grid sm:grid-cols-2 gap-3">
            <SelectField
              label="Game Filter"
              value={status?.gameFilterMode || "disabled"}
              options={["disabled", "all", "tcp", "udp"]}
              disabled={statusActionsDisabled}
              onChange={(value) => runStatusAction("game-filter", () => api!.zapret.setGameFilterMode(value as ZapretGameFilterMode), "Game Filter обновлён.")}
            />
            <SelectField
              label="IPSet"
              value={status?.ipsetMode || "loaded"}
              options={["loaded", "none", "any"]}
              disabled={statusActionsDisabled}
              onChange={(value) => runStatusAction("ipset-mode", () => api!.zapret.setIpsetMode(value as ZapretIpsetMode), "Режим IPSet обновлён.")}
            />
          </div>
          <ToggleRow
            label="Проверка обновлений Flowseal"
            enabled={Boolean(status?.updateChecksEnabled)}
            disabled={statusActionsDisabled}
            onChange={() => runStatusAction("update-checks", () => api!.zapret.setUpdateChecksEnabled(!status?.updateChecksEnabled), "Режим проверки обновлений Flowseal обновлён.")}
          />
          <ActionButton
            busy={busy === "update-ipset"}
            tone="accent"
            disabled={statusActionsDisabled}
            onClick={() => runStatusAction("update-ipset", () => api!.zapret.updateIpsetList(), "Список IPSet обновлён из Flowseal.")}
          >
            <RefreshCw className="w-4 h-4" /> Обновить IPSet list
          </ActionButton>
        </Panel>

        <Panel title="Обслуживание" icon={<Wrench className="w-5 h-5 text-amber-300" />}>
          <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-xs leading-relaxed text-muted">
            Внешние инструменты Flowseal открываются в отдельном окне Windows. `Service menu` это legacy-консоль
            для ручного обслуживания, а основные операции уже доступны прямо на этом экране.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <ActionButton
              busy={busy === "check-updates"}
              tone="accent"
              disabled={maintenanceActionsDisabled}
              title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
              onClick={async () => {
                setBusy("check-updates");
                try {
                  const info = await api!.zapret.checkUpdates();
                  setUpdates(info);
                  toast.success(info.message);
                } catch (error: unknown) {
                  toast.error(getErrorMessage(error, "Не удалось проверить обновления Flowseal"));
                } finally {
                  setBusy(null);
                }
              }}
            >
              <Download className="w-4 h-4" /> Проверить Core updates
            </ActionButton>
            <ActionButton
              busy={busy === "run-core-updater"}
              disabled={maintenanceActionsDisabled}
              title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
              onClick={() => runCommandAction("run-core-updater", () => api!.zapret.runCoreUpdater(), "Открыта консоль обновления Flowseal Core.")}
            >
              <RefreshCw className="w-4 h-4" /> Открыть updater
            </ActionButton>
            <ActionButton
              busy={busy === "open-service-menu"}
              disabled={maintenanceActionsDisabled}
              title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
              onClick={() => runCommandAction("open-service-menu", () => api!.zapret.openServiceMenu(), "Открыто меню Flowseal Service.")}
            >
              <Settings2 className="w-4 h-4" /> Service menu
            </ActionButton>
            <ActionButton
              busy={busy === "run-flowseal-tests"}
              tone="warning"
              disabled={maintenanceActionsDisabled}
              title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
              onClick={() => runCommandAction("run-flowseal-tests", () => api!.zapret.runFlowsealTests(), "Открыта консоль Flowseal tests.")}
            >
              <TestTube2 className="w-4 h-4" /> Flowseal tests
            </ActionButton>
          </div>
          {updates ? (
            <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-3">
              <div className="font-semibold text-white/90">Обновления Core</div>
              <div className="mt-2">Текущая версия: {updates.currentVersion ?? "—"}</div>
              <div className="mt-1">Последняя версия: {updates.latestVersion ?? "—"}</div>
              <div className="mt-1 text-xs text-muted">{updates.message}</div>
            </div>
          ) : null}
        </Panel>

        <Panel title="Discord И Кеш" icon={<Trash2 className="w-5 h-5 text-amber-300" />} className="lg:col-span-2">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
            <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm leading-relaxed text-white/80">
              <div className="font-semibold text-white/90">Массовая очистка Discord-кеша</div>
              <div className="mt-2 text-muted">
                Кнопка сразу закрывает `Discord`, `Discord PTB`, `Discord Canary` и `Vesktop`, затем очищает только
                их Electron-кеш: `Cache`, `Code Cache`, `GPUCache`, `Network/Cache`, `Service Worker` и
                `discord_voice`.
              </div>
              <div className="mt-2 text-xs text-muted">
                Учётки, токены, Local Storage и пользовательские настройки не затрагиваются.
              </div>
            </div>

            <ActionButton
              busy={busy === "clean-discord-cache-all"}
              tone="warning"
              disabled={commandActionsDisabled}
              onClick={() =>
                runCommandAction(
                  "clean-discord-cache-all",
                  () => api!.zapret.cleanDiscordCache("all"),
                  "Кеш всех Discord-клиентов очищен.",
                  (result) => {
                    setCacheCleanupResult(result);
                  }
                )
              }
            >
              <Trash2 className="w-4 h-4" /> Очистить кеш всех клиентов
            </ActionButton>
          </div>

          {cacheCleanupResult ? (
            <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-1">
              <div className="font-semibold text-white/90">{cacheCleanupResult.message}</div>
              {cacheCleanupResult.output ? (
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted font-mono">
                  {cacheCleanupResult.output}
                </pre>
              ) : null}
            </div>
          ) : null}
        </Panel>

        <Panel title="Диагностика" icon={<AlertTriangle className="w-5 h-5 text-red-300" />} className="lg:col-span-2">
          <ActionButton
            busy={busy === "diagnostics"}
            tone="warning"
            disabled={maintenanceActionsDisabled}
            title={!runtimeAvailable ? "Bundled runtime Zapret пока недоступен." : undefined}
            onClick={async () => {
              setBusy("diagnostics");
              try {
                const report = await api!.zapret.diagnostics();
                setDiagnostics(report);
                toast.success("Диагностика Zapret завершена.");
              } catch (error: unknown) {
                toast.error(getErrorMessage(error, "Не удалось выполнить диагностику Zapret"));
              } finally {
                setBusy(null);
              }
            }}
          >
            <AlertTriangle className="w-4 h-4" /> Запустить диагностику
          </ActionButton>
          {diagnostics ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 md:col-span-2">
                <div className="font-semibold text-white/90">{diagnostics.summary}</div>
              </div>
              {diagnostics.items.map((item) => (
                <div key={item.key} className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white/90">
                    {item.state === "ok" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : item.state === "warn" ? <AlertTriangle className="w-4 h-4 text-amber-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}
                    {item.title}
                  </div>
                  <div className="mt-2 text-xs text-muted leading-relaxed">{item.details}</div>
                </div>
              ))}
            </div>
          ) : null}
        </Panel>
      </div>

      {loading ? <div className="fixed inset-0 pointer-events-none flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-light" /></div> : null}
    </main>
  );
}

function Panel({ title, icon, children, className }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("glass-panel rounded-[22px] p-6", className)}><div className="mb-4 flex items-center gap-3 text-[13px] font-display font-semibold tracking-[0.15em] uppercase text-white/85"><div className="p-2 rounded-xl border border-brand/10 bg-brand/5">{icon}</div>{title}</div><div className="flex flex-col gap-3">{children}</div></motion.section>;
}

function ActionButton({
  children,
  onClick,
  busy,
  disabled = false,
  tone = "default",
  title
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  tone?: "default" | "success" | "warning" | "danger" | "accent";
  title?: string;
}) {
  const toneClass = tone === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : tone === "warning" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : tone === "danger" ? "border-red-500/20 bg-red-500/10 text-red-300" : tone === "accent" ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300" : "border-white/10 bg-white/5 text-white/85";
  return <button type="button" title={title} disabled={busy || disabled} onClick={onClick} className={cn("rounded-2xl px-4 py-3 text-sm font-bold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 flex items-center justify-center gap-2 border", toneClass)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}{children}</button>;
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-sm"><span className="text-muted">{label}</span><span className="font-semibold text-white/90 text-right">{value}</span></div>;
}

function ToggleRow({ label, enabled, onChange, disabled = false }: { label: string; enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return <button type="button" disabled={disabled} onClick={onChange} className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"><span className="text-white/90 font-semibold">{label}</span><span className={cn("rounded-full px-3 py-1 text-xs font-bold border", enabled ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-white/5 text-white/60")}>{enabled ? "Вкл" : "Выкл"}</span></button>;
}

function SelectField({ label, value, options, onChange, disabled = false }: { label: string; value: string; options: string[]; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="flex flex-col gap-2 text-sm font-semibold text-white/90"><span>{label}</span><select disabled={disabled} value={value} onChange={(event) => void onChange(event.target.value)} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none disabled:cursor-not-allowed disabled:opacity-60">{options.map((option) => <option key={option} value={option} className="bg-slate-950 text-white">{option}</option>)}</select></label>;
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-200">{children}</div>;
}
