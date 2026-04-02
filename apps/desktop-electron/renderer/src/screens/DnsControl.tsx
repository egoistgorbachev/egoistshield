import { motion } from "framer-motion";
import { CheckCircle2, Globe2, ShieldCheck, Sparkles, Wifi } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { parseDnsServers } from "../../../shared/system-dns";
import { PageHero } from "../components/PageHero";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";

const DNS_PRESETS = [
  {
    id: "cloudflare",
    title: "Cloudflare",
    caption: "Самый быстрый и нейтральный",
    servers: ["1.1.1.1", "1.0.0.1"],
    accent: "from-[#FF4C29]/20 via-[#FF7B4A]/10 to-transparent"
  },
  {
    id: "google",
    title: "Google DNS",
    caption: "Максимальная совместимость",
    servers: ["8.8.8.8", "8.8.4.4"],
    accent: "from-sky-500/20 via-sky-400/10 to-transparent"
  },
  {
    id: "quad9",
    title: "Quad9",
    caption: "Фокус на безопасности",
    servers: ["9.9.9.9", "149.112.112.112"],
    accent: "from-emerald-500/20 via-emerald-400/10 to-transparent"
  },
  {
    id: "adguard",
    title: "AdGuard",
    caption: "Блокировка рекламы и трекеров",
    servers: ["94.140.14.14", "94.140.15.15"],
    accent: "from-violet-500/20 via-fuchsia-500/10 to-transparent"
  }
] as const;

const DNS_TEXTAREA_MIN_HEIGHT = 100;
const DNS_TEXTAREA_MAX_HEIGHT = 360;

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function normalizeDnsServers(value: string): string[] {
  return parseDnsServers(value);
}

function splitDnsServers(value: string): string[] {
  try {
    return parseDnsServers(value);
  } catch {
    return value
      .split(/[\s,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function resizeDnsTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) {
    return;
  }

  textarea.style.height = "auto";

  const nextHeight = Math.min(Math.max(textarea.scrollHeight, DNS_TEXTAREA_MIN_HEIGHT), DNS_TEXTAREA_MAX_HEIGHT);
  const isCapped = textarea.scrollHeight > DNS_TEXTAREA_MAX_HEIGHT;

  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = isCapped ? "auto" : "hidden";
}

function getPresetId(serversValue: string): string | null {
  const normalized = splitDnsServers(serversValue).join("|");
  const preset = DNS_PRESETS.find((item) => item.servers.join("|") === normalized);
  return preset?.id ?? null;
}

export function DnsControl() {
  const systemDnsServers = useAppStore((state) => state.systemDnsServers);
  const fakeDns = useAppStore((state) => state.fakeDns);
  const updateSetting = useAppStore((state) => state.updateSetting);

  const [draft, setDraft] = useState(systemDnsServers);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(() => getPresetId(systemDnsServers));
  const [isApplying, setIsApplying] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const dnsTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(systemDnsServers);
    setSelectedPresetId(getPresetId(systemDnsServers));
  }, [systemDnsServers]);

  useEffect(() => {
    const api = getAPI();
    if (!api?.app?.isAdmin) {
      setIsAdmin(null);
      return;
    }

    void api.app
      .isAdmin()
      .then((value) => setIsAdmin(value))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    resizeDnsTextarea(dnsTextareaRef.current);
  }, [draft]);

  const validationMessage = useMemo(() => {
    if (!draft.trim()) {
      return null;
    }

    try {
      normalizeDnsServers(draft);
      return null;
    } catch (error: unknown) {
      return getErrorMessage(error, "Проверьте DNS-адреса.");
    }
  }, [draft]);

  const activeDnsServers = useMemo(() => splitDnsServers(systemDnsServers), [systemDnsServers]);
  const activeModeLabel = activeDnsServers.length > 0 ? "Пользовательский DNS" : "DNS по умолчанию";
  const activeDnsSummary =
    activeDnsServers.length > 0 ? activeDnsServers.join(" • ") : "Используется системный DNS Windows.";
  const applyStateSummary =
    isAdmin === false
      ? "Для реального применения нужен запуск приложения от имени администратора."
      : "Приложение готово применять DNS-конфигурацию сразу после нажатия.";

  const applySystemDns = async (): Promise<void> => {
    const api = getAPI();
    if (!api?.system?.setDnsServers) {
      toast.error("Управление системным DNS недоступно.");
      return;
    }

    let normalizedServers: string[];
    try {
      normalizedServers = normalizeDnsServers(draft);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Проверьте DNS-адреса."));
      return;
    }

    setIsApplying(true);
    try {
      const result = await api.system.setDnsServers(normalizedServers.join(", "));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      const normalizedValue = result.servers.join(", ");
      updateSetting("systemDnsServers", normalizedValue);
      setDraft(normalizedValue);
      setSelectedPresetId(getPresetId(normalizedValue));
      toast.success(result.message);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось применить системный DNS."));
    } finally {
      setIsApplying(false);
    }
  };

  const resetSystemDns = async (): Promise<void> => {
    const api = getAPI();
    if (!api?.system?.resetDnsServers) {
      toast.error("Сброс системного DNS недоступен.");
      return;
    }

    setIsResetting(true);
    try {
      const result = await api.system.resetDnsServers();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      updateSetting("systemDnsServers", "");
      setDraft("");
      setSelectedPresetId(null);
      toast.success(result.message);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Не удалось вернуть DNS по умолчанию."));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <main className="relative z-10 flex-1 h-full overflow-y-auto custom-scrollbar px-6 py-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
        <div className="pt-4">
          <PageHero
            eyebrow="Центр DNS"
            title="Управление DNS"
            icon={<Globe2 className="h-7 w-7 text-brand-light" />}
            description="Системный DNS, пресеты, ручной ввод и быстрый сброс в одном компактном экране."
            badgeLayout="balanced"
            badges={[
              {
                label: activeDnsServers.length > 0 ? "Свой DNS" : "DNS Windows",
                icon: <Sparkles className="h-3.5 w-3.5" />,
                tone: activeDnsServers.length > 0 ? "brand" : "neutral"
              },
              {
                label: isAdmin === false ? "Нужны права" : "Готово",
                icon: <ShieldCheck className="h-3.5 w-3.5" />,
                tone: isAdmin === false ? "warning" : "success"
              },
              {
                label: fakeDns ? "DNS в VPN" : "DNS в VPN выкл",
                icon: <Wifi className="h-3.5 w-3.5" />,
                tone: fakeDns ? "accent" : "neutral"
              }
            ]}
            actions={
              <div className="grid gap-3 sm:grid-cols-3 xl:max-w-[620px]">
                <HeroMetric label="Режим" value={activeModeLabel} />
                <HeroMetric
                  label="Серверы"
                  value={activeDnsServers.length > 0 ? activeDnsServers.join(" · ") : "DNS Windows"}
                />
                <HeroMetric label="Применение" value={isAdmin === false ? "Нужны права" : "Готово"} />
              </div>
            }
          />
        </div>

        <section className="grid gap-6">
          <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,32,50,0.95),rgba(12,36,54,0.88))] p-6 shadow-[0_18px_80px_rgba(0,0,0,0.28)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,76,41,0.14),transparent_42%)] pointer-events-none" />
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-white/45">Системный профиль</span>
                  <h2 className="text-xl font-display font-semibold text-white/95">{activeModeLabel}</h2>
                  <p className="max-w-xl text-sm leading-relaxed text-muted">
                    Настройка применяется ко всей системе Windows. Для защищённого DNS внутри самого VPN используйте
                    переключатель «Защищённый DNS» на экране настроек.
                  </p>
                </div>
                <div className="flex w-full max-w-[420px] flex-col gap-3 xl:items-end">
                  <div className="flex flex-nowrap gap-2 overflow-x-auto xl:justify-end [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <StatusChip
                      icon={<ShieldCheck className="h-3.5 w-3.5" />}
                      label={isAdmin === false ? "Нужен запуск от администратора" : "Готов к применению"}
                      tone={isAdmin === false ? "warning" : "success"}
                    />
                    <StatusChip
                      icon={<Wifi className="h-3.5 w-3.5" />}
                      label={fakeDns ? "DNS в VPN включён" : "DNS в VPN выключен"}
                      tone={fakeDns ? "success" : "neutral"}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[26px] border border-white/10 bg-black/10 p-4 backdrop-blur-xl">
                <label htmlFor="system-dns-input" className="mb-3 block text-sm font-semibold text-white/90">
                  DNS-серверы
                </label>
                <textarea
                  id="system-dns-input"
                  ref={dnsTextareaRef}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setSelectedPresetId(getPresetId(event.target.value));
                    resizeDnsTextarea(event.target);
                  }}
                  rows={3}
                  placeholder={"1.1.1.1, 1.0.0.1\n8.8.8.8"}
                  className="w-full resize-none overflow-hidden rounded-[24px] border border-white/10 bg-[#081B2B]/85 px-4 py-2.5 text-sm leading-[1.5] text-white/90 outline-none transition-all focus:border-brand/35 focus:ring-2 focus:ring-brand/20"
                />
                <div className="mt-2 flex items-center gap-3 rounded-full border border-white/8 bg-white/[0.035] px-3.5 py-2">
                  <div
                    className="min-w-0 flex-1 truncate text-[11px] leading-none text-muted"
                    title="Формат: IP-адреса DNS, `IP:port` или URL с IP-хостом через запятую, пробел или новую строку."
                  >
                    Формат: IP-адреса DNS, `IP:port` или URL с IP-хостом через запятую, пробел или новую строку.
                  </div>
                  {validationMessage ? (
                    <div className="shrink-0 truncate text-[11px] font-semibold text-amber-300" title={validationMessage}>
                      {validationMessage}
                    </div>
                  ) : (
                    <div className="shrink-0 text-[11px] font-semibold text-emerald-300">Формат ввода корректный</div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={applySystemDns}
                  disabled={isApplying || isResetting || !!validationMessage || !draft.trim()}
                  className="flex-1 rounded-3xl border border-brand/35 bg-[linear-gradient(135deg,rgba(255,76,41,0.22),rgba(255,123,74,0.1))] px-5 py-4 text-sm font-bold text-brand-light transition-all hover:border-brand/50 hover:shadow-[0_12px_30px_rgba(255,76,41,0.18)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isApplying ? "Применяем DNS..." : "Установить DNS в системе"}
                </button>
                <button
                  type="button"
                  onClick={resetSystemDns}
                  disabled={isApplying || isResetting}
                  className="flex-1 rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-white/80 transition-all hover:bg-white/8 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isResetting ? "Сбрасываем..." : "Сбросить по умолчанию"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {DNS_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <motion.button
                key={preset.id}
                type="button"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  const value = preset.servers.join(", ");
                  setSelectedPresetId(preset.id);
                  setDraft(value);
                }}
                className={cn(
                  "relative overflow-hidden rounded-[28px] border p-5 text-left transition-all",
                  isSelected
                    ? "border-brand/40 bg-white/8 shadow-[0_14px_34px_rgba(255,76,41,0.14)]"
                    : "border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.06]"
                )}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-100", preset.accent)} />
                <div className="relative flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white/95">{preset.title}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 text-brand-light" />}
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{preset.caption}</p>
                  <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-3 font-mono-metric text-xs text-white/75">
                    {preset.servers.join(" · ")}
                  </div>
                </div>
              </motion.button>
            );
          })}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,24,37,0.92),rgba(8,18,28,0.96))] px-5 py-5 shadow-[0_18px_44px_rgba(0,0,0,0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 pb-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/42">Важно</div>
              <div className="mt-1 text-sm font-semibold text-white/88">
                Ключевые ограничения и текущее состояние DNS
              </div>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-white/70">
              {activeModeLabel}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <BottomNote label="Активный набор" value={activeDnsSummary} />
            <BottomNote
              label="Область действия"
              value="Системный DNS влияет на весь интернет-трафик Windows, а не только на VPN-сессию."
            />
            <BottomNote label="Применение" value={applyStateSummary} />
          </div>
        </section>
      </div>
    </main>
  );
}

function HeroMetric({
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

function BottomNote({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/8 bg-black/10 px-4 py-4 backdrop-blur-xl">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">{label}</div>
      <p className="mt-2 text-sm leading-relaxed text-white/76">{value}</p>
    </div>
  );
}

function StatusChip({
  icon,
  label,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  tone: "neutral" | "success" | "warning";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em]",
        tone === "success" && "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
        tone === "warning" && "border-amber-400/20 bg-amber-400/10 text-amber-200",
        tone === "neutral" && "border-white/10 bg-white/5 text-white/70"
      )}
    >
      {icon}
      {label}
    </div>
  );
}
