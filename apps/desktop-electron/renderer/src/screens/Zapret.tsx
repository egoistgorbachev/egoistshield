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
  Shield,
  TestTube2,
  Trash2,
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
import { PageHero } from "../components/PageHero";
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
  const [didRetryUnavailableBootstrap, setDidRetryUnavailableBootstrap] = useState(false);

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

  useEffect(() => {
    if (loading || didRetryUnavailableBootstrap || status?.available !== false) {
      return;
    }

    const retryTimer = window.setTimeout(() => {
      setDidRetryUnavailableBootstrap(true);
      void load();
    }, 700);

    return () => window.clearTimeout(retryTimer);
  }, [didRetryUnavailableBootstrap, loading, status?.available]);

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
        toast.success(`Отдельный режим Zapret перезапущен на профиле ${nextProfile}.`);
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
        .map(
          (driver) => `${driver.name}: ${driver.running ? "Работает" : driver.installed ? "Установлен" : "Отсутствует"}`
        )
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
  const gameFilterLabels: Record<string, string> = {
    disabled: "Выключен",
    all: "Все",
    tcp: "TCP",
    udp: "UDP"
  };
  const ipsetLabels: Record<string, string> = {
    loaded: "Загружен",
    none: "Отключён",
    any: "Любой"
  };

  return (
    <main className="relative z-10 flex-1 p-6 h-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto mt-4 flex max-w-7xl flex-col gap-6 pb-12">
        <PageHero
          eyebrow="Центр управления"
          title="Центр Zapret"
          icon={<Zap className="h-7 w-7 text-brand-light" />}
          description="Единый экран для Flowseal Core, `winws`, драйверов, службы, диагностики и встроенного обновления без старых bat-меню."
          badgeLayout="balanced"
          badges={[
            {
              label: isAdmin ? "Сессия администратора" : "Нужны права",
              icon: <Shield className="h-3.5 w-3.5" />,
              tone: isAdmin ? "success" : "warning"
            },
            {
              label: runtimeAvailable ? "Ядро готово" : "Ядро недоступно",
              icon: <Activity className="h-3.5 w-3.5" />,
              tone: runtimeAvailable ? "accent" : "warning"
            },
            {
              label: serviceRunning ? "Служба активна" : standaloneRunning ? "Отдельный режим" : "Ожидание",
              icon: <Power className="h-3.5 w-3.5" />,
              tone: serviceRunning || standaloneRunning ? "success" : "neutral"
            }
          ]}
          actions={
            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-[620px]">
              <HeroStat label="Профиль" value={zapretProfile} />
              <HeroStat label="Версия" value={status?.coreVersion || "—"} />
              <HeroStat label="Драйверы" value={driverText || "—"} />
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Состояние" icon={<Activity className="w-5 h-5 text-brand-light" />}>
            <StatusLine label="Профиль" value={zapretProfile} />
            <StatusLine label="Winws" value={status?.winwsRunning ? "Активен" : "Остановлен"} />
            <StatusLine
              label="Отдельный режим"
              value={status?.standaloneRunning ? `PID ${status.standalonePid ?? "?"}` : "Нет"}
            />
            <StatusLine
              label="Служба"
              value={status?.serviceRunning ? "Работает" : status?.serviceInstalled ? "Установлена" : "Не установлена"}
            />
            <StatusLine label="Версия" value={status?.coreVersion || "—"} />
            <StatusLine label="Драйверы" value={driverText} />
            <StatusLine
              label="Игровой фильтр"
              value={gameFilterLabels[status?.gameFilterMode || "disabled"] ?? (status?.gameFilterMode || "disabled")}
            />
            <StatusLine
              label="Набор IP"
              value={ipsetLabels[status?.ipsetMode || "loaded"] ?? (status?.ipsetMode || "loaded")}
            />
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
                  : "Встроенный Zapret пока недоступен, поэтому показываем сохранённый профиль до полной инициализации."}
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <ActionButton
                busy={busy === "start-standalone"}
                disabled={statusActionsDisabled || serviceRunning}
                title={serviceRunning ? "Сначала остановите службу Zapret." : undefined}
                onClick={() =>
                  runStatusAction(
                    "start-standalone",
                    () => api!.zapret.startStandalone(zapretProfile),
                    "Запущен отдельный режим Zapret."
                  )
                }
              >
                <Play className="w-4 h-4" /> Запустить отдельно
              </ActionButton>
              <ActionButton
                busy={busy === "stop-standalone"}
                tone="warning"
                disabled={statusActionsDisabled || !standaloneRunning}
                title={!standaloneRunning ? "Отдельный режим сейчас не запущен." : undefined}
                onClick={() =>
                  runStatusAction(
                    "stop-standalone",
                    () => api!.zapret.stopStandalone(),
                    "Отдельный режим Zapret остановлен."
                  )
                }
              >
                <Power className="w-4 h-4" /> Остановить отдельно
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
                      toast.success(
                        `Лучший профиль найден: ${result.bestProfile}. Отдельный режим перезапущен автоматически.`
                      );
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
                onClick={() =>
                  runStatusAction(
                    "reset-network",
                    () => api!.zapret.resetNetworkState(),
                    "Состояние Winws и служб Zapret сброшено."
                  )
                }
              >
                <Trash2 className="w-4 h-4" /> Сбросить winws
              </ActionButton>
            </div>
            {autoSelectResult ? (
              <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-3">
                <div className="font-semibold text-white/90">Автоподбор</div>
                <div className="mt-2">Лучший профиль: {autoSelectResult.bestProfile ?? "не найден"}</div>
                <div className="mt-1 text-xs text-muted">
                  Рабочие: {autoSelectResult.goodProfiles.join(", ") || "—"}
                </div>
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
                Отдельный режим сейчас активен. При установке или запуске службы приложение сначала аккуратно остановит
                этот процесс, а затем переключится в режим службы.
              </div>
            ) : null}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              <ActionButton
                busy={busy === "install-service"}
                disabled={statusActionsDisabled || !runtimeAvailable}
                title={!runtimeAvailable ? "Встроенный Zapret пока недоступен." : undefined}
                onClick={() =>
                  runStatusAction(
                    "install-service",
                    () => api!.zapret.installService(zapretProfile),
                    "Служба Zapret установлена или переустановлена."
                  )
                }
              >
                <Shield className="w-4 h-4" /> Установить службу
              </ActionButton>
              <ActionButton
                busy={busy === "start-service"}
                tone="success"
                disabled={statusActionsDisabled || !serviceInstalled || serviceRunning}
                title={
                  !serviceInstalled
                    ? "Сначала установите службу Zapret."
                    : serviceRunning
                      ? "Служба уже запущена."
                      : undefined
                }
                onClick={() =>
                  runStatusAction("start-service", () => api!.zapret.startService(), "Служба Zapret запущена.")
                }
              >
                <Play className="w-4 h-4" /> Запустить службу
              </ActionButton>
              <ActionButton
                busy={busy === "stop-service"}
                tone="warning"
                disabled={statusActionsDisabled || !serviceRunning}
                title={
                  !serviceInstalled
                    ? "Служба ещё не установлена."
                    : !serviceRunning
                      ? "Служба уже остановлена."
                      : undefined
                }
                onClick={() =>
                  runStatusAction("stop-service", () => api!.zapret.stopService(), "Служба Zapret остановлена.")
                }
              >
                <Power className="w-4 h-4" /> Остановить службу
              </ActionButton>
              <ActionButton
                busy={busy === "remove-service"}
                tone="danger"
                disabled={statusActionsDisabled || !serviceInstalled}
                title={!serviceInstalled ? "Служба ещё не установлена." : undefined}
                onClick={() =>
                  runStatusAction("remove-service", () => api!.zapret.removeService(), "Служба Zapret удалена.")
                }
              >
                <Trash2 className="w-4 h-4" /> Удалить службу
              </ActionButton>
            </div>
          </Panel>

          <Panel title="Тюнинг Flowseal" icon={<RefreshCw className="w-5 h-5 text-fuchsia-300" />}>
            <div className="grid sm:grid-cols-2 gap-3">
              <SelectField
                label="Игровой фильтр"
                value={status?.gameFilterMode || "disabled"}
                options={[
                  { value: "disabled", label: "Выключен" },
                  { value: "all", label: "Все" },
                  { value: "tcp", label: "TCP" },
                  { value: "udp", label: "UDP" }
                ]}
                disabled={statusActionsDisabled}
                onChange={(value) =>
                  runStatusAction(
                    "game-filter",
                    () => api!.zapret.setGameFilterMode(value as ZapretGameFilterMode),
                    "Игровой фильтр обновлён."
                  )
                }
              />
              <SelectField
                label="Набор IP"
                value={status?.ipsetMode || "loaded"}
                options={[
                  { value: "loaded", label: "Загружен" },
                  { value: "none", label: "Отключён" },
                  { value: "any", label: "Любой" }
                ]}
                disabled={statusActionsDisabled}
                onChange={(value) =>
                  runStatusAction(
                    "ipset-mode",
                    () => api!.zapret.setIpsetMode(value as ZapretIpsetMode),
                    "Режим IPSet обновлён."
                  )
                }
              />
            </div>
            <ToggleRow
              label="Проверка обновлений Flowseal"
              enabled={Boolean(status?.updateChecksEnabled)}
              disabled={statusActionsDisabled}
              onChange={() =>
                runStatusAction(
                  "update-checks",
                  () => api!.zapret.setUpdateChecksEnabled(!status?.updateChecksEnabled),
                  "Режим проверки обновлений Flowseal обновлён."
                )
              }
            />
            <ActionButton
              busy={busy === "update-ipset"}
              tone="accent"
              disabled={statusActionsDisabled}
              onClick={() =>
                runStatusAction(
                  "update-ipset",
                  () => api!.zapret.updateIpsetList(),
                  "Список IPSet обновлён из Flowseal."
                )
              }
            >
              <RefreshCw className="w-4 h-4" /> Обновить IPSet
            </ActionButton>
          </Panel>

          <Panel title="Flowseal Core" icon={<Download className="w-5 h-5 text-amber-300" />}>
            <div className="rounded-2xl border border-emerald-500/14 bg-[linear-gradient(180deg,rgba(16,185,129,0.08),rgba(8,26,39,0.62))] px-4 py-4 text-sm leading-relaxed text-white/82">
              Текущая версия ядра теперь считывается напрямую из установленного `VERSION.txt`, а обновление применяется
              встроенно без запуска классического обновлятора и сервисного меню.
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ActionButton
                busy={busy === "check-updates"}
                tone="accent"
                disabled={maintenanceActionsDisabled}
                title={!runtimeAvailable ? "Встроенный Zapret пока недоступен." : undefined}
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
                <Download className="w-4 h-4" /> Проверить обновления
              </ActionButton>
              <ActionButton
                busy={busy === "install-core-update"}
                tone="success"
                disabled={maintenanceActionsDisabled || !updates?.updateAvailable}
                title={!updates?.updateAvailable ? "Сначала выполните проверку обновлений ядра Flowseal." : undefined}
                onClick={() =>
                  runStatusAction(
                    "install-core-update",
                    async () => {
                      const next = await api!.zapret.installCoreUpdate();
                      const nextUpdates = await api!.zapret.checkUpdates();
                      setUpdates(nextUpdates);
                      return next;
                    },
                    "Ядро Flowseal обновлено и применено."
                  )
                }
              >
                <RefreshCw className="w-4 h-4" /> Установить обновление
              </ActionButton>
              <ActionButton
                busy={busy === "run-flowseal-tests"}
                tone="warning"
                disabled={maintenanceActionsDisabled}
                title={!runtimeAvailable ? "Встроенный Zapret пока недоступен." : undefined}
                onClick={() =>
                  runCommandAction(
                    "run-flowseal-tests",
                    () => api!.zapret.runFlowsealTests(),
                    "Открыта консоль тестов Flowseal."
                  )
                }
              >
                <TestTube2 className="w-4 h-4" /> Тесты Flowseal
              </ActionButton>
            </div>
            {updates ? (
              <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-3">
                <div className="font-semibold text-white/90">Обновления ядра</div>
                <div className="mt-2">Текущая версия: {updates.currentVersion ?? "—"}</div>
                <div className="mt-1">Последняя версия: {updates.latestVersion ?? "—"}</div>
                <div className="mt-1 text-xs text-muted">{updates.message}</div>
              </div>
            ) : status?.coreVersion ? (
              <div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 text-sm text-white/80 mt-3">
                <div className="font-semibold text-white/90">Текущая версия Core</div>
                <div className="mt-2 text-base font-semibold text-white/92">{status.coreVersion}</div>
                <div className="mt-1 text-xs text-muted">
                  Проверка обновлений и установка выполняются прямо из приложения, без отдельных bat-окон.
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel title="Discord И Кеш" icon={<Trash2 className="w-5 h-5 text-amber-300" />} className="lg:col-span-2">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
              <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm leading-relaxed text-white/80">
                <div className="font-semibold text-white/90">Массовая очистка Discord-кеша</div>
                <div className="mt-2 text-muted">
                  Кнопка сразу закрывает `Discord`, `Discord PTB`, `Discord Canary` и `Vesktop`, затем очищает только их
                  Electron-кеш: `Cache`, `Code Cache`, `GPUCache`, `Network/Cache`, `Service Worker` и `discord_voice`.
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

          <Panel
            title="Диагностика"
            icon={<AlertTriangle className="w-5 h-5 text-red-300" />}
            className="lg:col-span-2"
          >
            <ActionButton
              busy={busy === "diagnostics"}
              tone="warning"
              disabled={maintenanceActionsDisabled}
              title={!runtimeAvailable ? "Встроенный Zapret пока недоступен." : undefined}
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
                      {item.state === "ok" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      ) : item.state === "warn" ? (
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                      )}
                      {item.title}
                    </div>
                    <div className="mt-2 text-xs text-muted leading-relaxed">{item.details}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>

      {loading ? (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-light" />
        </div>
      ) : null}
    </main>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-[20px] border border-white/10 bg-black/10 px-3.5 py-3 backdrop-blur-xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/42">{label}</div>
      <div className="mt-1.5 truncate text-sm font-semibold text-white/90" title={value}>
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
  className
}: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10, scale: 0.988 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,26,39,0.94),rgba(7,21,31,0.96))] p-6 shadow-[0_20px_54px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,76,41,0.1),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.06),transparent_22%)]" />
      <div className="mb-4 flex items-center gap-3 text-[13px] font-display font-semibold tracking-[0.15em] uppercase text-white/85">
        <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-2">
          {icon}
        </div>
        {title}
      </div>
      <div className="relative z-10 flex flex-col gap-3">{children}</div>
    </motion.section>
  );
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
  const toneClass =
    tone === "success"
      ? "border-emerald-500/22 bg-[linear-gradient(180deg,rgba(16,185,129,0.16),rgba(16,185,129,0.08))] text-emerald-200 shadow-[0_12px_28px_rgba(16,185,129,0.08)]"
      : tone === "warning"
        ? "border-amber-500/22 bg-[linear-gradient(180deg,rgba(245,158,11,0.16),rgba(245,158,11,0.08))] text-amber-200 shadow-[0_12px_28px_rgba(245,158,11,0.08)]"
        : tone === "danger"
          ? "border-red-500/22 bg-[linear-gradient(180deg,rgba(239,68,68,0.16),rgba(239,68,68,0.08))] text-red-200 shadow-[0_12px_28px_rgba(239,68,68,0.08)]"
          : tone === "accent"
            ? "border-cyan-500/22 bg-[linear-gradient(180deg,rgba(34,211,238,0.16),rgba(34,211,238,0.08))] text-cyan-200 shadow-[0_12px_28px_rgba(34,211,238,0.08)]"
            : "border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] text-white/88 shadow-[0_12px_28px_rgba(0,0,0,0.14)]";
  return (
    <button
      type="button"
      title={title}
      disabled={busy || disabled}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition-all duration-300 hover:-translate-y-[1px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        toneClass
      )}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="inline-block max-w-[62%] truncate text-right font-semibold text-white/90" title={value}>
        {value}
      </span>
    </div>
  );
}

function ToggleRow({
  label,
  enabled,
  onChange,
  disabled = false
}: { label: string; enabled: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onChange}
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="text-white/90 font-semibold">{label}</span>
      <span
        className={cn(
          "rounded-full px-3 py-1 text-xs font-bold border",
          enabled
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-white/10 bg-white/5 text-white/60"
        )}
      >
        {enabled ? "Вкл" : "Выкл"}
      </span>
    </button>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false
}: {
  label: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-semibold text-white/90">
      <span>{label}</span>
      <select
        disabled={disabled}
        value={value}
        onChange={(event) => void onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((option) => {
          const normalized = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={normalized.value} value={normalized.value} className="bg-slate-950 text-white">
              {normalized.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-red-500/15 bg-red-500/8 px-4 py-3 text-sm text-red-200">{children}</div>
  );
}
