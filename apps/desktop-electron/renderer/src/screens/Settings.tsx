import { AnimatePresence, motion } from "framer-motion";
import {
	AlertTriangle,
	CheckCircle2,
	Download,
	FileText,
	Globe2,
	HelpCircle,
	Info,
	Loader2,
	Monitor,
	RefreshCw,
	Send,
	Settings as SettingsIcon,
	Shield,
	ShieldAlert,
	ShieldCheck,
	Wifi,
	Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { RuntimeUpdateInfo } from "../../../electron/ipc/contracts";
import {
	getEffectiveDnsMode,
	normalizeCustomDnsUrl,
	parseCustomDnsUrl,
} from "../../../shared/secure-dns";
import { ConnectionLogs } from "../components/ConnectionLogs";
import { Dialog } from "../components/Dialog";
import { PageHero } from "../components/PageHero";
import { SegmentedTabs } from "../components/SegmentedTabs";
import { getAPI } from "../lib/api";
import { cn } from "../lib/cn";
import { useAppStore } from "../store/useAppStore";

type SettingsTab = "general" | "network" | "advanced";

const TABS: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
	{ id: "general", label: "Основные", icon: <Monitor className="w-4 h-4" /> },
	{ id: "network", label: "Сеть", icon: <Wifi className="w-4 h-4" /> },
	{
		id: "advanced",
		label: "Расширенные",
		icon: <Wrench className="w-4 h-4" />,
	},
];

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message ? error.message : fallback;
}

function getCustomDnsValidationMessage(value: string): string | null {
	const normalizedValue = normalizeCustomDnsUrl(value, "");
	if (!normalizedValue) {
		return null;
	}

	try {
		parseCustomDnsUrl(normalizedValue);
		return null;
	} catch (error: unknown) {
		return getErrorMessage(error, "Проверьте DoH URL.");
	}
}

export function Settings() {
	const fakeDns = useAppStore((s) => s.fakeDns);
	const killSwitch = useAppStore((s) => s.killSwitch);
	const autoUpdate = useAppStore((s) => s.autoUpdate);
	const autoConnect = useAppStore((s) => s.autoConnect);
	const notifications = useAppStore((s) => s.notifications);
	const autoStart = useAppStore((s) => s.autoStart);
	const systemDnsServers = useAppStore((s) => s.systemDnsServers);
	const customDnsUrl = useAppStore((s) => s.customDnsUrl);
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
	const [updateCheckResult, setUpdateCheckResult] = useState<
		"idle" | "upToDate" | "available" | "ahead" | "error"
	>("idle");
	const [updateStatusMessage, setUpdateStatusMessage] = useState("");
	const [updateReleaseUrl, setUpdateReleaseUrl] = useState<string | null>(null);
	const [updateVersions, setUpdateVersions] = useState<{
		currentVersion: string;
		latestVersion: string | null;
	}>({
		currentVersion: __APP_VERSION__,
		latestVersion: null,
	});
	const [runtimeUpdates, setRuntimeUpdates] = useState<RuntimeUpdateInfo[]>([]);
	const [runtimeChecking, setRuntimeChecking] = useState(false);
	const [runtimeInstalling, setRuntimeInstalling] = useState(false);
	const [customDnsDraft, setCustomDnsDraft] = useState(customDnsUrl);

	useEffect(() => {
		setCustomDnsDraft(customDnsUrl);
	}, [customDnsUrl]);

	const customDnsValidationMessage =
		getCustomDnsValidationMessage(customDnsDraft);
	const savedCustomDnsUrl = normalizeCustomDnsUrl(customDnsUrl, "");
	const secureDnsMode = getEffectiveDnsMode({
		fakeDns,
		customDnsUrl: savedCustomDnsUrl,
	});
	const secureDnsModeLabel =
		secureDnsMode === "custom"
			? "Свой DoH"
			: secureDnsMode === "secure"
				? "Встроенный secure DNS"
				: "Выключен";
	const dnsHeroValue = savedCustomDnsUrl
		? fakeDns
			? "DoH свой"
			: "DoH сохранён"
		: systemDnsServers
			? "Системный свой"
			: fakeDns
				? "Secure DNS"
				: "DNS Windows";

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
			setRouteProbeResult({
				bypassDetected: false,
				directIp: null,
				vpnIp: null,
				error: "API недоступен",
			});
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
					customDnsUrl: "",
					subscriptionUserAgent: "auto",
					runtimePath: "",
					routeMode: "global",
					zapretProfile: "General",
					zapretSuspendDuringVpn: true,
				},
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
				<div className="mx-auto mt-4 flex max-w-6xl flex-col gap-6 pb-12">
					<PageHero
						eyebrow="Система"
						title="Настройки"
						icon={<SettingsIcon className="h-7 w-7 text-brand-light" />}
						description="Единый центр управления приложением, сетью, безопасностью и встроенными инструментами Windows."
						badgeLayout="balanced"
						badges={[
							{
								label: autoUpdate
									? "Автопроверка обновлений вкл"
									: "Автопроверка обновлений выкл",
								icon: <RefreshCw className="h-3.5 w-3.5" />,
								tone: autoUpdate ? "success" : "neutral",
							},
							{
								label: notifications ? "Уведомления вкл" : "Уведомления выкл",
								icon: <CheckCircle2 className="h-3.5 w-3.5" />,
								tone: notifications ? "accent" : "neutral",
							},
							{
								label: killSwitch ? "Блокировка без VPN" : "Без блокировки",
								icon: <Shield className="h-3.5 w-3.5" />,
								tone: killSwitch ? "warning" : "neutral",
							},
						]}
						actions={
							<div className="grid gap-3 sm:grid-cols-3 xl:max-w-[560px]">
								<HeroMetric label="Версия" value={`v${__APP_VERSION__}`} />
								<HeroMetric label="DNS" value={dnsHeroValue} />
								<HeroMetric
									label="Автозапуск"
									value={autoStart ? "Вкл" : "Выкл"}
								/>
							</div>
						}
					/>

					<SegmentedTabs
						label="Разделы настроек"
						activeId={activeTab}
						onChange={setActiveTab}
						className="max-w-[760px]"
						items={TABS.map((tab) => ({
							id: tab.id,
							label: tab.label,
							icon: tab.icon,
						}))}
					/>

					{/* Tab Content */}
					<AnimatePresence mode="wait">
						{activeTab === "general" && (
							<motion.div
								key="general"
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: -10 }}
								transition={{ duration: 0.2 }}
								className="w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start"
							>
								<SettingsCard
									title="Приложение"
									icon={<Monitor className="w-5 h-5 text-brand-light" />}
								>
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
										onChange={() =>
											updateSetting("notifications", !notifications)
										}
									/>
									<ToggleRow
										label="Автопроверка обновлений"
										description="Периодически проверять новые версии desktop-клиента."
										tooltip="Приложение будет автоматически проверять, появился ли новый релиз на GitHub. Установка остаётся ручной: вы сами открываете страницу релиза и скачиваете installer."
										enabled={autoUpdate}
										onChange={() => {
											const next = !autoUpdate;
											updateSetting("autoUpdate", next);
											const api = getAPI();
											api?.updater?.setAuto?.(next).catch((error: unknown) => {
												toast.error(
													getErrorMessage(
														error,
														"Не удалось обновить режим автопроверки",
													),
												);
											});
										}}
									/>

									{/* Проверить обновления */}
									<div className="flex items-center justify-between px-1 py-2">
										<div className="flex flex-col gap-0.5">
											<span className="text-sm font-semibold text-white/90">
												Обновления
											</span>
											<span className="text-xs text-muted">
												v{updateVersions.currentVersion}
												{updateVersions.latestVersion
													? ` · канал v${updateVersions.latestVersion}`
													: ""}
											</span>
										</div>
										<button
											type="button"
											onClick={async () => {
												setUpdateChecking(true);
												setUpdateCheckResult("idle");
												setUpdateStatusMessage("");
												setUpdateReleaseUrl(null);
												const api = getAPI();
												try {
													const result = await api?.updater?.check?.();
													setUpdateChecking(false);
													setUpdateVersions({
														currentVersion:
															result?.currentVersion || __APP_VERSION__,
														latestVersion: result?.latestVersion ?? null,
													});
													setUpdateReleaseUrl(
														result?.releaseUrl ?? result?.downloadUrl ?? null,
													);
													if (
														result?.status === "update-available" &&
														result?.version
													) {
														setUpdateCheckResult("available");
														setUpdateStatusMessage(
															result.ok
																? `Найдена версия v${result.version}. Скачайте обновление вручную со страницы релиза.`
																: `Найдена версия v${result.version}, но release metadata требует ручной проверки: ${result.error ?? "проверьте страницу релиза вручную"}.`,
														);
													} else if (
														result?.ok &&
														result?.status === "local-newer"
													) {
														setUpdateCheckResult("ahead");
														setUpdateStatusMessage(
															result?.latestVersion
																? `Локальная сборка опережает опубликованный канал: приложение уже на v${result.currentVersion ?? __APP_VERSION__}, а в релизах доступна только v${result.latestVersion}.`
																: "Локальная сборка опережает опубликованный релизный канал.",
														);
													} else if (result?.ok) {
														setUpdateCheckResult("upToDate");
														setUpdateStatusMessage(
															"Опубликованный релизный канал уже соответствует локальной версии.",
														);
													} else {
														setUpdateCheckResult("error");
														setUpdateStatusMessage(
															result?.error || "Неизвестная ошибка",
														);
													}
												} catch (error: unknown) {
													setUpdateChecking(false);
													setUpdateCheckResult("error");
													setUpdateStatusMessage(
														getErrorMessage(error, "Не удалось проверить"),
													);
												}
											}}
											disabled={updateChecking}
											className={cn(
												"px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
												updateCheckResult === "upToDate"
													? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
													: updateCheckResult === "available"
														? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
														: updateCheckResult === "ahead"
															? "bg-amber-500/10 text-amber-300 border border-amber-500/20"
															: updateCheckResult === "error"
																? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
																: "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10",
											)}
										>
											{updateChecking ? (
												<>
													<Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
													Проверяем...
												</>
											) : updateCheckResult === "upToDate" ? (
												<>
													<CheckCircle2 className="w-3.5 h-3.5" /> Актуальная
													версия
												</>
											) : updateCheckResult === "available" ? (
												<>
													<Download className="w-3.5 h-3.5" /> Есть обновление!
												</>
											) : updateCheckResult === "ahead" ? (
												<>
													<Info className="w-3.5 h-3.5" /> Канал отстаёт
												</>
											) : updateCheckResult === "error" ? (
												<>
													<AlertTriangle className="w-3.5 h-3.5" /> Ошибка
													проверки
												</>
											) : (
												<>
													<RefreshCw className="w-3.5 h-3.5" /> Проверить
												</>
											)}
										</button>
									</div>
									{updateStatusMessage ? (
										<div
											className={cn(
												"px-1 pt-1 text-xs leading-relaxed",
												updateCheckResult === "available"
													? "text-blue-200/80"
													: updateCheckResult === "upToDate"
														? "text-emerald-300/80"
														: updateCheckResult === "ahead"
															? "text-amber-300/80"
															: "text-amber-400/80",
											)}
										>
											{updateStatusMessage}
										</div>
									) : null}
									{updateCheckResult === "available" && updateReleaseUrl ? (
										<div className="px-1 pt-2">
											<button
												type="button"
												onClick={async () => {
													const api = getAPI();
													try {
														if (api?.updater?.openReleasePage) {
															await api.updater.openReleasePage();
															return;
														}
														await api?.updater?.install?.();
													} catch (error: unknown) {
														toast.error(
															getErrorMessage(
																error,
																"Не удалось открыть страницу релиза",
															),
														);
													}
												}}
												className="px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-blue-500/10 text-blue-200 border border-blue-400/20 hover:bg-blue-500/15"
											>
												<Download className="w-3.5 h-3.5" /> Открыть релиз
											</button>
										</div>
									) : null}
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
								className="w-full flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start"
							>
								<SettingsCard
									title="DNS-центр"
									icon={<Globe2 className="w-5 h-5 text-brand" />}
								>
									<div className="px-1 py-2 flex flex-col gap-4">
										<div className="space-y-1">
											<span className="text-sm font-semibold text-white/90">
												{systemDnsServers
													? "Активен пользовательский системный DNS"
													: "Используется системный DNS по умолчанию"}
											</span>
											<p className="text-xs text-muted leading-relaxed">
												Полное управление системным DNS вынесено на отдельный
												экран с пресетами, ручным вводом и быстрым сбросом до
												дефолтной конфигурации Windows.
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
										label="Блокировка без VPN"
										description="Блокировка трафика при обрыве VPN."
										tooltip="Если VPN неожиданно отключится, весь интернет-трафик будет заблокирован. Это не даст утечь вашему реальному IP. Полезно при работе с чувствительными данными."
										enabled={killSwitch}
										onChange={() => updateSetting("killSwitch", !killSwitch)}
									/>
									<ToggleRow
										label="Защищённый DNS"
										description="Встроенный secure DNS или ваш собственный DoH внутри VPN."
										tooltip="Когда включено, VPN использует встроенный secure DNS. Если ниже сохранён DoH URL, приложение переключается на него автоматически."
										enabled={fakeDns}
										onChange={() => updateSetting("fakeDns", !fakeDns)}
									/>
									<div className="px-1 py-3">
										<div className="rounded-[22px] border border-white/8 bg-void/55 p-4">
											<div className="flex flex-col gap-1">
												<span className="text-sm font-semibold text-white/92">
													Свой DoH URL
												</span>
												<p className="text-xs leading-relaxed text-muted">
													Поддерживается формат `https://host[:port]/dns-query`.
													Для кастомного пути и порта они тоже будут сохранены и
													переданы в runtime.
												</p>
											</div>

											<div className="mt-4 rounded-2xl border border-white/8 bg-black/10 px-3.5 py-3">
												<div className="mb-2 flex items-center justify-between gap-3">
													<span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/42">
														Режим
													</span>
													<span className="text-[11px] font-semibold text-white/72">
														{secureDnsModeLabel}
													</span>
												</div>
												<textarea
													rows={3}
													value={customDnsDraft}
													onChange={(event) =>
														setCustomDnsDraft(event.target.value)
													}
													placeholder="https://dns.example.com/dns-query"
													className="w-full resize-none rounded-[18px] border border-white/10 bg-[#081B2B]/85 px-3.5 py-3 text-sm leading-relaxed text-white/90 outline-none transition-all focus:border-brand/35 focus:ring-2 focus:ring-brand/20"
												/>
												<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
													<div
														className={cn(
															"text-[11px] leading-relaxed",
															customDnsValidationMessage
																? "font-semibold text-amber-300"
																: "text-muted",
														)}
													>
														{customDnsValidationMessage ??
															(savedCustomDnsUrl
																? fakeDns
																	? "Сейчас активен ваш custom DoH."
																	: "Custom DoH сохранён, но secure DNS выключен."
																: "Если поле пустое, при включении используется встроенный secure DNS.")}
													</div>
												</div>
											</div>

											<div className="mt-4 flex flex-col gap-2 sm:flex-row">
												<button
													type="button"
													disabled={
														!customDnsDraft.trim() ||
														!!customDnsValidationMessage
													}
													onClick={() => {
														try {
															const parsed = parseCustomDnsUrl(customDnsDraft);
															updateSetting("customDnsUrl", parsed.url);
															if (!fakeDns) {
																updateSetting("fakeDns", true);
															}
															toast.success(
																fakeDns
																	? "Custom DoH сохранён."
																	: "Custom DoH сохранён и включён.",
															);
														} catch (error: unknown) {
															toast.error(
																getErrorMessage(
																	error,
																	"Не удалось сохранить custom DoH.",
																),
															);
														}
													}}
													className="flex-1 rounded-2xl border border-brand/30 bg-brand/12 px-4 py-3 text-sm font-bold text-brand-light transition-colors hover:bg-brand/18 disabled:cursor-not-allowed disabled:opacity-60"
												>
													{fakeDns ? "Сохранить DoH" : "Сохранить и включить"}
												</button>
												<button
													type="button"
													disabled={
														!savedCustomDnsUrl && !customDnsDraft.trim()
													}
													onClick={() => {
														setCustomDnsDraft("");
														updateSetting("customDnsUrl", "");
														toast.success(
															fakeDns
																? "Возврат к встроенному secure DNS."
																: "Custom DoH очищен.",
														);
													}}
													className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/82 transition-colors hover:bg-white/9 disabled:cursor-not-allowed disabled:opacity-60"
												>
													Очистить custom DoH
												</button>
											</div>
										</div>
									</div>
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
											Приложение само выбирает и поднимает подходящее ядро под
											тип сервера:
										</p>
										<div className="rounded-2xl border border-white/8 bg-void/50 px-4 py-4 space-y-2 text-sm text-muted">
											<p>
												<span className="text-white/90 font-semibold">
													Xray
												</span>{" "}
												используется как основной вариант для `VLESS / VMess /
												Trojan / Shadowsocks`, где он обычно даёт лучший баланс
												стабильности и задержки.
											</p>
											<p>
												<span className="text-white/90 font-semibold">
													Sing-box
												</span>{" "}
												включается автоматически для `Hysteria2 / TUIC /
												WireGuard` и остаётся резервным вариантом там, где это
												реально полезно.
											</p>
											<p>
												Умное подключение теперь переключает серверы плавнее,
												без принудительного обрыва старой сессии перед подъёмом
												новой.
											</p>
										</div>
									</div>
								</SettingsCard>

								<SettingsCard
									title="Центр Zapret"
									className="h-full"
									icon={<ShieldCheck className="w-5 h-5 text-emerald-400" />}
								>
									<div className="px-1 py-2 flex flex-col gap-4">
										<div className="rounded-2xl border border-white/8 bg-void/55 px-4 py-4 text-sm text-white/82">
											Отдельный экран Zapret теперь полностью отвечает за
											службу, профили, автозапуск, диагностику,
											Flowseal-инструменты и очистку кешей. В настройках
											оставляем только входную точку, чтобы не было двух разных
											центров управления одной и той же системой.
										</div>
										<button
											type="button"
											onClick={() => setScreen("zapret")}
											className="w-full rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300 transition-colors hover:bg-emerald-500/16"
										>
											Открыть центр Zapret
										</button>
									</div>
								</SettingsCard>

								<SettingsCard
									title="Прокси Telegram"
									className="h-full"
									icon={<Send className="w-5 h-5 text-cyan-300" />}
								>
									<div className="px-1 py-2 flex flex-col gap-4">
										<div className="rounded-2xl border border-white/8 bg-void/55 px-4 py-4 text-sm text-white/82">
											Отдельный экран прокси Telegram управляет фоновым
											`tg-ws-proxy`, MTProto-конфигурацией, ссылкой подключения,
											логами и встроенным обновлением без отдельного окна в
											трее.
										</div>
										<button
											type="button"
											onClick={() => setScreen("telegram-proxy")}
											className="w-full rounded-2xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm font-bold text-cyan-300 transition-colors hover:bg-cyan-500/16"
										>
											Открыть прокси Telegram
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
								className="w-full flex flex-col gap-6"
							>
								<SettingsCard
									title="Диагностика"
									icon={<Shield className="w-5 h-5 text-accent" />}
								>
									{/* Route Probe */}
									<div className="flex items-center justify-between px-1 py-2">
										<div className="flex flex-col gap-0.5">
											<span className="text-sm font-semibold text-white/90">
												Проверка сетевого маршрута
											</span>
											<span className="text-xs text-muted">
												Быстрая проверка прямого и VPN-маршрута
											</span>
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
															: "bg-white/5 text-muted hover:text-white hover:bg-white/10 border border-white/10",
											)}
										>
											{routeProbeTesting ? (
												<>
													<Loader2 className="w-3.5 h-3.5 animate-spin" />{" "}
													Тестируем...
												</>
											) : routeProbeResult?.error ? (
												<>
													<AlertTriangle className="w-3.5 h-3.5" />{" "}
													{routeProbeResult.error}
												</>
											) : routeProbeResult &&
												!routeProbeResult.bypassDetected ? (
												<>
													<ShieldCheck className="w-3.5 h-3.5" /> Маршрут через
													VPN
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
											Прямой маршрут:{" "}
											{routeProbeResult.directIp ?? "неизвестно"} · VPN-маршрут:{" "}
											{routeProbeResult.vpnIp ?? "неизвестно"}
										</div>
									)}
									<div className="px-1 pt-1 text-xs leading-relaxed text-muted">
										Это быстрая проверка маршрута для поиска обхода VPN, а не
										лабораторная проверка утечки DNS по реальным DNS-серверам.
									</div>

									{/* Connection Logs */}
									<div className="flex items-center justify-between px-1 py-2 mt-2">
										<div className="flex flex-col gap-0.5">
											<span className="text-sm font-semibold text-white/90">
												Журнал подключений
											</span>
											<span className="text-xs text-muted">
												Диагностические логи работы ядер
											</span>
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

								<SettingsCard
									title="Обновления VPN-ядер"
									icon={<RefreshCw className="w-5 h-5 text-brand-light" />}
								>
									<div className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm text-white/82">
										При запуске приложения `Xray` и `Sing-box` всё ещё
										поднимаются автоматически, но здесь можно вручную проверить
										их новые версии и принудительно применить обновление.
									</div>

									{runtimeUpdates.length > 0 ? (
										<div className="grid gap-3">
											{runtimeUpdates.map((item) => (
												<div
													key={item.runtimeKind}
													className="rounded-2xl border border-white/8 bg-void/45 px-4 py-4 text-sm text-white/82"
												>
													<div className="font-semibold text-white/90">
														{item.displayName}
													</div>
													<div className="mt-2">
														Текущая версия: {item.currentVersion ?? "—"}
													</div>
													<div className="mt-1">
														Последняя версия: {item.latestVersion ?? "—"}
													</div>
													<div className="mt-2 text-xs text-muted leading-relaxed">
														{item.message}
													</div>
													{item.verificationMessage ? (
														<div className="mt-2 text-xs text-amber-300/80 leading-relaxed">
															Проверка архива: {item.verificationMessage}
														</div>
													) : null}
												</div>
											))}
										</div>
									) : null}

									<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
										<button
											type="button"
											disabled={runtimeChecking}
											onClick={async () => {
												setRuntimeChecking(true);
												try {
													const api = getAPI();
													const info = await api?.runtime?.checkUpdates?.();
													setRuntimeUpdates(info ?? []);
													toast.success("Проверка Xray и Sing-box завершена.");
												} catch (error: unknown) {
													toast.error(
														getErrorMessage(
															error,
															"Не удалось проверить версии Xray и Sing-box",
														),
													);
												} finally {
													setRuntimeChecking(false);
												}
											}}
											className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-white/85 hover:bg-white/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
										>
											{runtimeChecking ? (
												<Loader2 className="w-4 h-4 animate-spin" />
											) : (
												<RefreshCw className="w-4 h-4" />
											)}
											Проверить ядра
										</button>
										<button
											type="button"
											disabled={runtimeInstalling}
											onClick={async () => {
												setRuntimeInstalling(true);
												try {
													const api = getAPI();
													const result = await api?.runtime?.installAll?.();
													const updatedCount =
														result?.results?.filter((item) => item.updated)
															.length ?? 0;
													const firstFailure = result?.results?.find(
														(item) => !item.ok,
													);
													const info = await api?.runtime?.checkUpdates?.();
													setRuntimeUpdates(info ?? []);
													if (result?.ok) {
														toast.success(
															updatedCount > 0
																? `VPN-ядра обновлены (${updatedCount}).`
																: result?.message || "VPN-ядра уже актуальны.",
														);
													} else {
														toast.error(
															firstFailure?.message ||
																result?.message ||
																"Не удалось обновить Xray и Sing-box",
														);
													}
												} catch (error: unknown) {
													toast.error(
														getErrorMessage(
															error,
															"Не удалось обновить Xray и Sing-box",
														),
													);
												} finally {
													setRuntimeInstalling(false);
												}
											}}
											className="rounded-2xl border border-brand/20 bg-brand/10 px-4 py-3 text-sm font-bold text-brand-light hover:bg-brand/15 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
										>
											{runtimeInstalling ? (
												<Loader2 className="w-4 h-4 animate-spin" />
											) : (
												<Download className="w-4 h-4" />
											)}
											Обновить ядра
										</button>
									</div>
								</SettingsCard>

								<SettingsCard
									title="Опасная зона"
									icon={<AlertTriangle className="w-5 h-5 text-red-400" />}
								>
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
				</div>
			</main>

			{/* Модалка подтверждения сброса */}
			<Dialog
				isOpen={showResetModal}
				onClose={() => setShowResetModal(false)}
				title="Сброс данных"
			>
				<div className="flex items-center gap-3 mb-4">
					<div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
						<AlertTriangle className="w-5 h-5 text-red-400" />
					</div>
					<p className="text-sm text-muted leading-relaxed">
						Все настройки будут сброшены, импортированные серверы и подписки
						удалены. Это действие необратимо.
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
	className,
}: {
	title: string;
	icon: React.ReactNode;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 15 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: "-50px" }}
			className={cn(
				"group relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,26,39,0.94),rgba(7,21,31,0.96))] p-6 shadow-[0_20px_54px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-500",
				className,
			)}
		>
			{/* Corner glow */}
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,76,41,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.06),transparent_24%)] opacity-80" />
			<div className="absolute top-0 right-0 h-20 w-20 rounded-full bg-gradient-to-bl from-brand/6 to-transparent blur-[25px] pointer-events-none opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

			{/* Title with gradient underline */}
			<div className="mb-5 relative z-10">
				<h3 className="flex items-center gap-3 text-[13px] font-display font-semibold uppercase tracking-[0.15em] text-white/88">
					<div
						className="rounded-[14px] border border-white/10 p-2 transition-colors"
						style={{
							background:
								"linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
						}}
					>
						{icon}
					</div>
					{title}
				</h3>
				<div className="mt-3 h-px bg-gradient-to-r from-brand/20 via-white/6 to-transparent" />
			</div>
			<div className="flex flex-col gap-1 relative z-10">{children}</div>
		</motion.div>
	);
}

function HeroMetric({
	label,
	value,
}: {
	label: string;
	value: string;
}) {
	return (
		<div className="min-w-0 rounded-[20px] border border-white/10 bg-black/10 px-3.5 py-3 backdrop-blur-xl">
			<div className="text-[10px] font-bold uppercase tracking-[0.24em] text-white/42">
				{label}
			</div>
			<div
				className="mt-1.5 truncate text-sm font-semibold text-white/90"
				title={value}
			>
				{value}
			</div>
		</div>
	);
}

function ToggleRow({
	label,
	description,
	tooltip,
	enabled,
	onChange,
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
						<button
							type="button"
							onClick={onChange}
							className="flex-1 text-left"
						>
							<span
								className={cn(
									"text-base font-bold transition-colors",
									enabled
										? "text-white"
										: "text-white/85 group-hover:text-white",
								)}
							>
								{label}
							</span>
							<div
								className={cn(
									"text-sm font-medium mt-1.5 leading-relaxed transition-colors max-w-sm",
									enabled ? "text-white/60" : "text-muted",
								)}
							>
								{description}
							</div>
						</button>
						<button
							type="button"
							onClick={() => setShowTooltip(!showTooltip)}
							aria-label={`Подсказка: ${label}`}
							className={cn(
								"transition-colors shrink-0",
								showTooltip ? "text-brand" : "text-whisper hover:text-brand",
							)}
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
						enabled ? "border-brand/30" : "bg-white/[0.04] border-white/[0.06]",
					)}
					style={
						enabled
							? {
									background:
										"linear-gradient(135deg, rgba(38,201,154,0.9), rgba(4,120,87,0.85))",
									boxShadow:
										"0 0 20px rgba(38,201,154,0.25), inset 0 1px 0 rgba(255,255,255,0.1)",
								}
							: {}
					}
				>
					<motion.div
						layout
						className="w-5 h-5 bg-white rounded-full shadow-md z-10"
						style={{
							marginLeft: enabled ? "auto" : 0,
							marginRight: enabled ? 0 : "auto",
						}}
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
	variant = "default",
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
								variant === "danger" ? "text-red-400" : "text-white",
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
								showTooltip ? "text-brand" : "text-whisper hover:text-brand",
							)}
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
								: "bg-white/5 hover:bg-white/10 text-white border border-white/10",
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
