/**
 * System/App IPC Handlers — state:get, state:set, system:geoip, app:is-first-run,
 * app:mark-first-run-done, app:is-admin, runtime:install-*, system:pick-file,
 * system:list-processes, system:get-app-icon, system:read-clipboard,
 * system:internet-fix, window:minimize, window:close
 */
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { Notification, app, clipboard, dialog, ipcMain } from "electron";
import log from "electron-log";
import { SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS } from "../../shared/system-doh";
import type { SystemDohStatus } from "../../shared/types";
import { updateTrayMenu } from "../main";
import type { PersistedState, RuntimeUpdateSummary } from "./contracts";
import { repairNetworkStack } from "./dns-cleanup";
import type { IpcContext } from "./ipc-context";
import {
	AppIconInputSchema,
	GeoipInputSchema,
	PersistedStateSchema,
	PickFileFilterSchema,
	SystemDohUrlInputSchema,
	SystemDnsServersInputSchema,
	UsageRecordSchema,
} from "./ipc-schemas";
import { KillSwitch } from "./kill-switch";
import logger, { formatRuntimeLogEvent } from "./logger";
import { syncWindowsLoginItemSettings } from "./login-item-settings";
import { resetSystemDnsServers, setSystemDnsServers } from "./system-dns";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

function createMockSystemDohStatus(options: {
	url?: string | null;
	localAddress?: string | null;
	running?: boolean;
	lastError?: string | null;
}): SystemDohStatus {
	const running = options.running ?? false;
	const preferredLocalAddress =
		typeof options.localAddress === "string" ? options.localAddress.trim() : "";
	const localAddress = running
		? preferredLocalAddress || SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS
		: null;

	return {
		available: true,
		running,
		pid: running ? 4242 : null,
		startedAt: running ? new Date().toISOString() : null,
		runtimePath: "mock://system-doh/xray-system-doh.exe",
		configPath: "mock://system-doh/config.json",
		logPath: "mock://system-doh/runtime.log",
		localAddress,
		localPort: running ? 53 : null,
		currentUrl: running ? options.url?.trim() || null : null,
		lastError: options.lastError ?? null,
		mocked: true,
	};
}

export function registerSystemHandlers({
	window,
	stateStore,
	runtimeManager,
	systemDohManager,
	zapretManager,
}: IpcContext): void {
	// ── State management ──
	ipcMain.handle("state:get", async () => {
		return stateStore.get();
	});

	ipcMain.handle("state:set", async (_event, rawState: unknown) => {
		const state = PersistedStateSchema.parse(rawState) as PersistedState;
		const persisted = await stateStore.set({
			...state,
			processRules: [],
			settings: {
				...state.settings,
				useTunMode: false,
				systemDnsServers: state.settings.systemDnsServers ?? "",
				customDnsUrl: state.settings.customDnsUrl ?? "",
				systemDohEnabled: state.settings.systemDohEnabled ?? false,
				systemDohUrl: state.settings.systemDohUrl ?? "",
				systemDohLocalAddress: state.settings.systemDohLocalAddress ?? "",
			},
		});
		try {
			syncWindowsLoginItemSettings({ app, settings: persisted.settings });
		} catch (error: unknown) {
			logger.warn("[system] Failed to update login item settings:", error);
		}
		return persisted;
	});

	ipcMain.handle("app:is-admin", async () => runtimeManager.isAdmin());

	// ── Usage History ──
	ipcMain.handle("usage:save-record", async (_event, rawRecord: unknown) => {
		const record = UsageRecordSchema.parse(rawRecord);
		const state = await stateStore.get();

		// Сохраняем максимум 1000 последних записей
		const history = state.usageHistory || [];
		const updatedHistory = [...history, record];
		if (updatedHistory.length > 1000) {
			updatedHistory.shift();
		}

		await stateStore.set({ ...state, usageHistory: updatedHistory });
		return true;
	});

	ipcMain.handle("usage:get-history", async () => {
		const state = await stateStore.get();
		return state.usageHistory || [];
	});

	// GeoIP
	ipcMain.handle(
		"system:geoip",
		async (
			_event,
			rawHost: unknown,
		): Promise<{ country: string; countryCode: string }> => {
			const host = GeoipInputSchema.parse(rawHost);
			try {
				const res = await fetch(
					`https://ipwho.is/${encodeURIComponent(host)}?fields=country,country_code,success`,
					{
						signal: AbortSignal.timeout(3000),
					},
				);
				const data = await res.json();
				if (data.success && data.country_code) {
					return {
						country: data.country || "",
						countryCode: data.country_code.toLowerCase(),
					};
				}
			} catch (error: unknown) {
				logger.debug("[system:geoip] Lookup failed for host", host, error);
			}
			return { country: "", countryCode: "un" };
		},
	);

	// First run management
	const firstRunMarker = path.join(app.getPath("userData"), ".first-run-done");

	ipcMain.handle("app:is-first-run", async () => {
		try {
			await fs.access(firstRunMarker);
			return false;
		} catch {
			return true;
		}
	});

	ipcMain.handle("app:mark-first-run-done", async () => {
		await fs.writeFile(firstRunMarker, new Date().toISOString(), "utf8");
	});

	// Runtime installation
	ipcMain.handle("runtime:install-xray", async () => {
		return runtimeManager.installXrayRuntime();
	});

	ipcMain.handle("runtime:install-all", async () => {
		const result: RuntimeUpdateSummary =
			await runtimeManager.installAllRuntimes();
		return result;
	});

	ipcMain.handle("runtime:check-updates", async () => {
		return runtimeManager.checkRuntimeUpdates();
	});

	// File picker
	ipcMain.handle("system:pick-file", async (_event, rawFilters: unknown) => {
		const filters = PickFileFilterSchema.parse(rawFilters);
		const result = await dialog.showOpenDialog(window, {
			properties: ["openFile"],
			filters,
		});
		return result.canceled ? null : (result.filePaths[0] ?? null);
	});

	// List running processes
	ipcMain.handle("system:list-processes", async () => {
		if (process.platform === "win32") {
			try {
				const script =
					"Get-Process | Where-Object { $_.Path } | Select-Object Name, Path | ConvertTo-Json -Compress";
				const { stdout } = await execFileAsync(
					resolveWindowsExecutable("powershell.exe"),
					["-NoProfile", "-Command", script],
					{
						maxBuffer: 1024 * 1024 * 10,
					},
				);
				let procs = JSON.parse(stdout);
				if (!Array.isArray(procs)) procs = [procs];

				const unique = new Map<string, { name: string; path: string }>();
				for (const p of procs) {
					const parsedName = `${p.Name.toLowerCase()}.exe`;
					if (!unique.has(parsedName)) {
						unique.set(parsedName, { name: `${p.Name}.exe`, path: p.Path });
					}
				}
				return Array.from(unique.values()).sort((a, b) =>
					a.name.localeCompare(b.name),
				);
			} catch (err) {
				log.error("List processes failed", err);
				return [];
			}
		}
		return [];
	});

	// App icon
	ipcMain.handle("system:get-app-icon", async (_event, rawExePath: unknown) => {
		const exePath = AppIconInputSchema.parse(rawExePath);
		try {
			const icon = await app.getFileIcon(exePath, { size: "normal" });
			return icon.toDataURL();
		} catch (error: unknown) {
			logger.debug(
				"[system:get-app-icon] Failed to resolve icon for",
				exePath,
				error,
			);
			return null;
		}
	});

	// Clipboard (rate-limited + URI-filtered)
	let lastClipboardRead = 0;
	const CLIPBOARD_COOLDOWN_MS = 1000;
	const CLIPBOARD_URI_PATTERN =
		/^(vmess|vless|trojan|ss|ssr|hysteria2?|tuic|wg|wireguard|socks[45]?|https?):\/\//i;
	const CLIPBOARD_BASE64_PATTERN = /^[A-Za-z0-9+/=\r\n]{20,}$/;
	const CLIPBOARD_SUB_URL_PATTERN = /^https?:\/\/.+/i;

	ipcMain.handle("system:read-clipboard", async () => {
		const now = Date.now();
		if (now - lastClipboardRead < CLIPBOARD_COOLDOWN_MS) {
			return ""; // rate-limited
		}
		lastClipboardRead = now;

		const text = clipboard.readText().trim();
		if (!text) return "";

		if (
			CLIPBOARD_URI_PATTERN.test(text) ||
			CLIPBOARD_SUB_URL_PATTERN.test(text) ||
			CLIPBOARD_BASE64_PATTERN.test(text)
		) {
			return text;
		}

		return "";
	});

	// Internet Fix (Network Lock Recovery)
	ipcMain.handle("system:internet-fix", async () => {
		// 1. Отключить kill-switch firewall rules
		const ks = new KillSwitch();
		await ks.disable().catch((error: unknown) => {
			logger.warn("[system:internet-fix] Kill Switch disable failed:", error);
		});

		// 2. Явный recovery-сценарий: очистка + Winsock reset.
		return repairNetworkStack();
	});

	ipcMain.handle(
		"system:set-dns-servers",
		async (_event, rawInput: unknown) => {
			const dnsServers = SystemDnsServersInputSchema.parse(rawInput);
			const mock = process.env.NODE_ENV === "test";
			const persistedState = stateStore.get();

			if (!mock) {
				const isAdmin = await runtimeManager.isAdmin();
				if (!isAdmin) {
					return {
						ok: false,
						message:
							"Для изменения системного DNS нужен запуск от имени администратора.",
						servers: [],
					};
				}
			}

			try {
				const result = await setSystemDnsServers(dnsServers, mock);
				await stateStore.patch({
					settings: {
						systemDnsServers: result.servers.join(", "),
						systemDohEnabled: false,
						systemDohLocalAddress: "",
					},
				});
				if (persistedState.settings.systemDohEnabled && !mock) {
					await systemDohManager.stop().catch((error: unknown) => {
						logger.warn(
							"[system-doh] Failed to stop runtime after manual DNS apply:",
							error,
						);
					});
				}
				return result;
			} catch (error: unknown) {
				return {
					ok: false,
					message:
						error instanceof Error
							? error.message
							: "Не удалось применить системный DNS.",
					servers: [],
				};
			}
		},
	);

	ipcMain.handle("system:reset-dns-servers", async () => {
		const mock = process.env.NODE_ENV === "test";
		const persistedState = stateStore.get();

		if (!mock) {
			const isAdmin = await runtimeManager.isAdmin();
			if (!isAdmin) {
				return {
					ok: false,
					message:
						"Для сброса системного DNS нужен запуск от имени администратора.",
					servers: [],
				};
			}
		}

		try {
			const result = await resetSystemDnsServers(mock);
			await stateStore.patch({
				settings: {
					systemDnsServers: "",
					systemDohEnabled: false,
					systemDohLocalAddress: "",
				},
			});
			if (persistedState.settings.systemDohEnabled && !mock) {
				await systemDohManager.stop().catch((error: unknown) => {
					logger.warn(
						"[system-doh] Failed to stop runtime after DNS reset:",
						error,
					);
				});
			}
			return result;
		} catch (error: unknown) {
			return {
				ok: false,
				message:
					error instanceof Error
						? error.message
						: "Не удалось сбросить системный DNS.",
				servers: [],
			};
		}
	});

	ipcMain.handle("system-doh:status", async () => {
		const persistedState = stateStore.get();
		if (process.env.NODE_ENV === "test") {
			return createMockSystemDohStatus({
				url: persistedState.settings.systemDohUrl ?? "",
				localAddress: persistedState.settings.systemDohLocalAddress ?? "",
				running: persistedState.settings.systemDohEnabled ?? false,
			});
		}

		return systemDohManager.status();
	});

	ipcMain.handle("system-doh:apply", async (_event, rawInput: unknown) => {
		const url = SystemDohUrlInputSchema.parse(rawInput);
		const mock = process.env.NODE_ENV === "test";
		const persistedState = stateStore.get();

		if (!mock) {
			const isAdmin = await runtimeManager.isAdmin();
			if (!isAdmin) {
				return {
					ok: false,
					message:
						"Для включения System DoH нужен запуск приложения от имени администратора.",
					status: await systemDohManager.status(),
				};
			}
		}

		try {
			const startedStatus = mock
				? createMockSystemDohStatus({
						url,
						localAddress:
							persistedState.settings.systemDohLocalAddress ??
							SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS,
						running: true,
					})
				: await systemDohManager.apply(
						url,
						persistedState.settings.systemDohLocalAddress,
					);

			if (!startedStatus.localAddress) {
				throw new Error("System DoH запустился без локального адреса.");
			}

			if (!mock) {
				try {
					await setSystemDnsServers(startedStatus.localAddress);
				} catch (error: unknown) {
					await systemDohManager.stop().catch((stopError: unknown) => {
						logger.warn(
							"[system-doh] Failed to stop runtime after DNS apply error:",
							stopError,
						);
					});
					throw error;
				}
			}

			const nextStatus = mock ? startedStatus : await systemDohManager.status();
			await stateStore.patch({
				settings: {
					systemDohEnabled: true,
					systemDohUrl: url,
					systemDohLocalAddress: nextStatus.localAddress ?? "",
				},
			});

			return {
				ok: true,
				message: `System DoH активирован через ${nextStatus.localAddress}:${nextStatus.localPort ?? 53}.`,
				status: nextStatus,
			};
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Не удалось включить System DoH.";

			return {
				ok: false,
				message,
				status: mock
					? createMockSystemDohStatus({
							url,
							localAddress:
								persistedState.settings.systemDohLocalAddress ?? "",
							running: false,
							lastError: message,
						})
					: await systemDohManager.status(),
			};
		}
	});

	ipcMain.handle("system-doh:reset", async () => {
		const mock = process.env.NODE_ENV === "test";
		const persistedState = stateStore.get();

		if (!mock) {
			const isAdmin = await runtimeManager.isAdmin();
			if (!isAdmin) {
				return {
					ok: false,
					message:
						"Для отключения System DoH нужен запуск приложения от имени администратора.",
					status: await systemDohManager.status(),
				};
			}
		}

		try {
			const manualDnsServers = persistedState.settings.systemDnsServers ?? "";
			const hasManualDns = manualDnsServers.trim().length > 0;
			let message = "System DoH отключён.";

			if (!mock) {
				if (hasManualDns) {
					await setSystemDnsServers(manualDnsServers);
					message = `System DoH отключён. Возвращён сохранённый DNS: ${manualDnsServers}.`;
				} else {
					await resetSystemDnsServers();
					message =
						"System DoH отключён. Системный DNS возвращён к настройкам по умолчанию.";
				}

				await systemDohManager.stop().catch((error: unknown) => {
					logger.warn(
						"[system-doh] Failed to stop runtime during reset:",
						error,
					);
				});
			} else if (hasManualDns) {
				message = `System DoH отключён. Возвращён сохранённый DNS: ${manualDnsServers}.`;
			} else {
				message =
					"System DoH отключён. Системный DNS возвращён к настройкам по умолчанию.";
			}

			await stateStore.patch({
				settings: {
					systemDohEnabled: false,
					systemDohLocalAddress: "",
				},
			});

			return {
				ok: true,
				message,
				status: mock
					? createMockSystemDohStatus({
							url: persistedState.settings.systemDohUrl ?? "",
							running: false,
						})
					: await systemDohManager.status(),
			};
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: "Не удалось отключить System DoH.";

			return {
				ok: false,
				message,
				status: mock
					? createMockSystemDohStatus({
							url: persistedState.settings.systemDohUrl ?? "",
							localAddress:
								persistedState.settings.systemDohLocalAddress ?? "",
							running: persistedState.settings.systemDohEnabled ?? false,
							lastError: message,
						})
					: await systemDohManager.status(),
			};
		}
	});

	// Window controls
	ipcMain.handle("window:minimize", async () => {
		window.minimize();
		return true;
	});

	ipcMain.handle("window:toggle-maximize", async () => {
		if (window.isMaximized()) {
			window.unmaximize();
		} else {
			window.maximize();
		}
		return window.isMaximized();
	});

	ipcMain.handle("window:is-maximized", async () => {
		return window.isMaximized();
	});

	ipcMain.handle("window:close", async () => {
		window.close();
		return true;
	});

	// Event listener for unexpected VPN exit
	runtimeManager.on("unexpected-exit", async (lastError) => {
		logger.warn("[vpn] unexpected exit:", lastError);
		const status = await runtimeManager.status();
		logger.warn(
			formatRuntimeLogEvent({
				timestamp: new Date().toISOString(),
				level: "warn",
				lifecycle: status.lifecycle,
				reason: status.diagnostic.reason,
				message: lastError || "VPN runtime exited unexpectedly.",
				nodeId: status.activeNodeId,
				runtimeKind: status.runtimeKind,
				proxyPort: status.proxyPort,
			}),
		);

		if (Notification.isSupported()) {
			new Notification({
				title: "EgoistShield: Соединение потеряно",
				body: lastError || "VPN-соединение разорвано.",
			}).show();
		}

		updateTrayMenu(false);

		const persistedState = stateStore.get();
		if (persistedState.settings.zapretSuspendDuringVpn) {
			try {
				await zapretManager.restoreAfterVpnIfNeeded(
					persistedState.settings.zapretSuspendDuringVpn,
					persistedState.settings.zapretProfile,
				);
			} catch (error: unknown) {
				logger.warn(
					"[zapret] Failed to restore service after unexpected VPN exit:",
					error,
				);
			}
		}
	});
}
