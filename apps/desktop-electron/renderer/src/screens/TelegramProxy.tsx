import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Bot,
  ClipboardCopy,
  ExternalLink,
  FileText,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Save,
  Send,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { TelegramProxyConfig, TelegramProxyStatus, TelegramProxyUpdateInfo } from "../../../shared/types";
import { PageHero } from "../components/PageHero";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function configToTextarea(config: TelegramProxyConfig): string {
  return config.dcIp.join("\n");
}

function textareaToDcIp(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function TelegramProxy() {
  const api = getAPI();
  const shouldReduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<TelegramProxyStatus | null>(null);
  const [updates, setUpdates] = useState<TelegramProxyUpdateInfo | null>(null);
  const [form, setForm] = useState<TelegramProxyConfig | null>(null);
  const [dcIpText, setDcIpText] = useState("");

  const load = async () => {
    if (!api?.telegramProxy) {
      return;
    }

    setLoading(true);
    try {
      const nextStatus = await api.telegramProxy.status();
      setStatus(nextStatus);
      setForm(nextStatus.config);
      setDcIpText(configToTextarea(nextStatus.config));
    } catch (error) {
      toast.error(getErrorMessage(error, "Не удалось загрузить прокси Telegram"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const connectionUrl = status?.connectionUrl ?? null;
  const runtimeAvailable = Boolean(status?.available);

  const formReady = useMemo(() => {
    if (!form) {
      return null;
    }

    return {
      ...form,
      secret: form.secret.trim(),
      dcIp: textareaToDcIp(dcIpText)
    } satisfies TelegramProxyConfig;
  }, [dcIpText, form]);

  const persistConfig = async () => {
    if (!api?.telegramProxy || !formReady) {
      throw new Error("API прокси Telegram недоступно.");
    }

    const nextStatus = await api.telegramProxy.saveConfig(formReady);
    setStatus(nextStatus);
    setForm(nextStatus.config);
    setDcIpText(configToTextarea(nextStatus.config));
    return nextStatus;
  };

  const runStatusAction = async (
    label: string,
    action: () => Promise<TelegramProxyStatus>,
    successMessage: string,
    options?: { persistBefore?: boolean }
  ) => {
    setBusy(label);
    try {
      if (options?.persistBefore) {
        await persistConfig();
      }
      const next = await action();
      setStatus(next);
      toast.success(successMessage);
    } catch (error) {
      toast.error(getErrorMessage(error, "Операция прокси Telegram завершилась ошибкой"));
    } finally {
      setBusy(null);
    }
  };

  const runSimpleAction = async (label: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusy(label);
    try {
      await action();
      toast.success(successMessage);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Операция прокси Telegram завершилась ошибкой"));
    } finally {
      setBusy(null);
    }
  };

  const runCommandAction = async (
    label: string,
    action: () => Promise<{ message: string }>,
    successFallback: string
  ) => {
    setBusy(label);
    try {
      const result = await action();
      toast.success(result.message || successFallback);
      await load();
    } catch (error) {
      toast.error(getErrorMessage(error, "Операция прокси Telegram завершилась ошибкой"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="relative z-10 flex-1 p-6 h-full overflow-y-auto custom-scrollbar">
      <div className="mx-auto mt-4 flex max-w-7xl flex-col gap-6 pb-12">
        <PageHero
          eyebrow="Фоновый режим"
          title="Прокси Telegram"
          icon={<Send className="h-7 w-7 text-brand-light" />}
          description="Фоновый `tg-ws-proxy`, которым полностью управляет EgoistShield: конфиг, ссылка, логи и встроенный hidden headless runtime без отдельного окна, консоли и значка в трее."
          badgeLayout="balanced"
          badges={[
            {
              label: status?.running ? "В фоне" : "Остановлен",
              icon: <Power className="h-3.5 w-3.5" />,
              tone: status?.running ? "success" : "neutral"
            },
            {
              label: runtimeAvailable ? "Компонент готов" : "Компонент не найден",
              icon: <ShieldCheck className="h-3.5 w-3.5" />,
              tone: runtimeAvailable ? "accent" : "warning"
            },
            {
              label: "Без окна в трее",
              icon: <Bot className="h-3.5 w-3.5" />,
              tone: "brand"
            }
          ]}
          actions={
            <div className="grid gap-3 sm:grid-cols-3 xl:max-w-[620px]">
              <HeroStat label="Версия" value={status?.currentVersion || "—"} />
              <HeroStat label="Адрес" value={`${form?.host || "127.0.0.1"}:${form?.port || 1443}`} />
              <HeroStat
                label="Статус"
                value={status?.running ? `В фоне${status.pid ? ` · PID ${status.pid}` : ""}` : "Остановлен"}
              />
            </div>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Состояние" icon={<ShieldCheck className="w-5 h-5 text-emerald-300" />}>
            <StatusLine label="Версия" value={status?.currentVersion || "—"} />
            <StatusLine label="Режим" value="Фоновый" />
            <StatusLine label="Хост" value={form?.host || "127.0.0.1"} />
            <StatusLine label="Порт" value={String(form?.port || 1443)} />
            <StatusLine label="Лог" value={status?.logPath || "—"} />
            {!runtimeAvailable ? (
              <ErrorBox>
                Встроенный `tg-ws-proxy` не найден. В релизной сборке должен присутствовать каталог
                `runtime/tg-ws-proxy`.
              </ErrorBox>
            ) : null}
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/6 px-4 py-3 text-xs leading-relaxed text-cyan-100/85">
              Прокси запускается как скрытый фоновый процесс без отдельного окна в трее. Конфиг, лог и обновления
              хранятся во внутреннем хранилище EgoistShield.
            </div>
            <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm text-white/82">
              <div className="font-semibold text-white/90">Ссылка подключения</div>
              <div
                className="mt-2 truncate font-mono text-xs leading-relaxed text-muted"
                title={connectionUrl ?? "Будет сгенерирована после сохранения конфигурации"}
              >
                {connectionUrl ?? "Будет сгенерирована после сохранения конфигурации"}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <ActionButton
                  busy={busy === "copy-link"}
                  disabled={!connectionUrl}
                  onClick={() =>
                    runSimpleAction(
                      "copy-link",
                      async () => {
                        if (!connectionUrl) {
                          throw new Error("Ссылка подключения ещё не готова.");
                        }
                        await navigator.clipboard.writeText(connectionUrl);
                      },
                      "Ссылка прокси Telegram скопирована."
                    )
                  }
                >
                  <ClipboardCopy className="w-4 h-4" /> Копировать
                </ActionButton>
                <ActionButton
                  busy={busy === "open-link"}
                  tone="accent"
                  disabled={!connectionUrl || !api?.telegramProxy}
                  onClick={() =>
                    runCommandAction(
                      "open-link",
                      () => api!.telegramProxy.openLink(),
                      "Ссылка прокси Telegram открыта."
                    )
                  }
                >
                  <ExternalLink className="w-4 h-4" /> Открыть
                </ActionButton>
                <ActionButton
                  busy={busy === "open-logs"}
                  tone="warning"
                  disabled={!api?.telegramProxy}
                  onClick={() =>
                    runCommandAction(
                      "open-logs",
                      () => api!.telegramProxy.openLogs(),
                      "Открыта папка с логами прокси Telegram."
                    )
                  }
                >
                  <FileText className="w-4 h-4" /> Логи
                </ActionButton>
              </div>
            </div>
          </Panel>

          <Panel title="Конфигурация" icon={<Bot className="w-5 h-5 text-cyan-300" />}>
            <Field label="IP-адрес">
              <input
                value={form?.host ?? ""}
                onChange={(event) =>
                  setForm((current) => (current ? { ...current, host: event.target.value } : current))
                }
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Порт">
                <input
                  type="number"
                  min={1}
                  max={65535}
                  value={form?.port ?? 1443}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            port: Number.parseInt(event.target.value || "1443", 10) || 1443
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
                />
              </Field>
              <Field label="Секрет">
                <input
                  value={form?.secret ?? ""}
                  onChange={(event) =>
                    setForm((current) => (current ? { ...current, secret: event.target.value.trim() } : current))
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-white/90 outline-none"
                />
              </Field>
            </div>
            <Field label="Адреса дата-центров Telegram">
              <textarea
                value={dcIpText}
                onChange={(event) => setDcIpText(event.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-white/90 outline-none resize-none"
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Буфер, KB">
                <input
                  type="number"
                  min={1}
                  value={form?.bufKb ?? 256}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            bufKb: Number.parseInt(event.target.value || "256", 10) || 256
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
                />
              </Field>
              <Field label="Пул WebSocket">
                <input
                  type="number"
                  min={1}
                  value={form?.poolSize ?? 4}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            poolSize: Number.parseInt(event.target.value || "4", 10) || 4
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
                />
              </Field>
              <Field label="Макс. лог, MB">
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={form?.logMaxMb ?? 5}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            logMaxMb: Number.parseFloat(event.target.value || "5") || 5
                          }
                        : current
                    )
                  }
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white/90 outline-none"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ToggleRow
                label="Подробный лог"
                enabled={Boolean(form?.verbose)}
                onChange={() => setForm((current) => (current ? { ...current, verbose: !current.verbose } : current))}
              />
              <ToggleRow
                label="Встроенные обновления"
                enabled={Boolean(form?.checkUpdates)}
                onChange={() =>
                  setForm((current) => (current ? { ...current, checkUpdates: !current.checkUpdates } : current))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ActionButton
                busy={busy === "save-config"}
                disabled={!api?.telegramProxy || !formReady}
                onClick={() =>
                  runStatusAction(
                    "save-config",
                    async () => {
                      return persistConfig();
                    },
                    "Конфигурация прокси Telegram сохранена."
                  )
                }
              >
                <Save className="w-4 h-4" /> Сохранить
              </ActionButton>
              <ActionButton
                busy={busy === "start"}
                tone="success"
                disabled={!api?.telegramProxy || !runtimeAvailable}
                onClick={() =>
                  runStatusAction("start", () => api!.telegramProxy.start(), "Прокси Telegram запущен.", {
                    persistBefore: true
                  })
                }
              >
                <Play className="w-4 h-4" /> Запустить
              </ActionButton>
              <ActionButton
                busy={busy === "restart"}
                tone="accent"
                disabled={!api?.telegramProxy || !runtimeAvailable}
                onClick={() =>
                  runStatusAction("restart", () => api!.telegramProxy.restart(), "Прокси Telegram перезапущен.", {
                    persistBefore: true
                  })
                }
              >
                <RefreshCw className="w-4 h-4" /> Перезапустить
              </ActionButton>
              <ActionButton
                busy={busy === "stop"}
                tone="warning"
                disabled={!api?.telegramProxy}
                onClick={() => runStatusAction("stop", () => api!.telegramProxy.stop(), "Прокси Telegram остановлен.")}
              >
                <Power className="w-4 h-4" /> Остановить
              </ActionButton>
            </div>
            <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-xs leading-relaxed text-muted">
              Если в `IP-адресе` стоит `127.0.0.1`, ссылка работает только на этом же устройстве. Для телефона или
              другого ПК нужен внешний IP либо домен сервера.
            </div>
          </Panel>

          <Panel title="Обновления" icon={<RefreshCw className="w-5 h-5 text-brand-light" />} className="lg:col-span-2">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-start">
              <div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm text-white/82">
                <div className="font-semibold text-white/90">Прокси Telegram</div>
                <div className="mt-2">Текущая версия: {status?.currentVersion ?? "—"}</div>
                <div className="mt-1">Последняя версия: {updates?.latestVersion ?? "—"}</div>
                <div className="mt-2 text-xs text-muted leading-relaxed">
                  {updates?.message ??
                    "EgoistShield проверяет upstream TG WS Proxy на GitHub, скачивает более новый Windows runtime и применяет его локально. Если сеть недоступна, остаётся встроенный bundled runtime."}
                </div>
              </div>
              <ActionButton
                busy={busy === "check-updates"}
                tone="accent"
                disabled={!api?.telegramProxy}
                onClick={async () => {
                  setBusy("check-updates");
                  try {
                    const info = await api!.telegramProxy.checkUpdates();
                    setUpdates(info);
                    toast.success(info.message);
                  } catch (error) {
                    toast.error(getErrorMessage(error, "Не удалось проверить обновления прокси Telegram"));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <RefreshCw className="w-4 h-4" /> Проверить
              </ActionButton>
              <ActionButton
                busy={busy === "install-update"}
                tone="success"
                disabled={!api?.telegramProxy || !updates?.updateAvailable}
                onClick={() =>
                  runStatusAction(
                    "install-update",
                    async () => {
                      const next = await api!.telegramProxy.installUpdate();
                      const info = await api!.telegramProxy.checkUpdates();
                      setUpdates(info);
                      return next;
                    },
                    "Прокси Telegram обновлён и применён."
                  )
                }
              >
                <Save className="w-4 h-4" /> Применить обновление
              </ActionButton>
            </div>
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

function Panel({
  title,
  icon,
  children,
  className
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10, scale: 0.985 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={cn(
        "relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,26,39,0.94),rgba(7,21,31,0.96))] p-6 shadow-[0_20px_54px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,76,41,0.1),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.06),transparent_22%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.035] to-transparent" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-brand/8 blur-3xl" />
      <div className="mb-4 flex items-center gap-3 text-[13px] font-display font-semibold tracking-[0.15em] uppercase text-white/85">
        <div className="rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] p-2">
          {icon}
        </div>
        {title}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </motion.section>
  );
}

function HeroStat({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-[20px] border border-white/10 bg-black/10 px-3.5 py-3 backdrop-blur-xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/42">{label}</div>
      <div className="mt-1.5 truncate text-sm font-semibold text-white/90" title={value}>
        {value}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-white/90">{label}</span>
      {children}
    </label>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  disabled = false,
  tone = "default"
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  disabled?: boolean;
  tone?: "default" | "success" | "warning" | "accent";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
      : tone === "warning"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
        : tone === "accent"
          ? "border-cyan-500/20 bg-cyan-500/10 text-cyan-300"
          : "border-white/10 bg-white/5 text-white/85";

  return (
    <motion.button
      type="button"
      disabled={busy || disabled}
      onClick={onClick}
      whileHover={busy || disabled ? undefined : { scale: 1.015, y: -1.5 }}
      whileTap={busy || disabled ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      className={cn(
        "group/button relative flex w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-2xl border px-3.5 py-3 text-sm font-bold transition-[filter,box-shadow] shadow-[0_8px_24px_rgba(4,8,13,0.16)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60",
        toneClass
      )}
    >
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover/button:opacity-100 bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.08),transparent)]" />
      <span className="relative z-10 flex items-center justify-center gap-2">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {children}
      </span>
    </motion.button>
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
  onChange
}: {
  label: string;
  enabled: boolean;
  onChange: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onChange}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-void/45 px-4 py-3 text-sm"
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
    </motion.button>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200/90 flex gap-3">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
