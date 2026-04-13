import { execFile, spawn } from "node:child_process";
import { createSocket } from "node:dgram";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { SystemDohStatus } from "../../shared/types";
import {
	SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS,
	SYSTEM_DOH_LOCAL_PORT,
	buildSystemDohLoopbackCandidates,
	buildXrayLocalDohServerUrl,
	normalizeSystemDohLocalAddress,
	normalizeSystemDohUrl,
} from "../../shared/system-doh";
import { readVersionFile } from "./github-release";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);

const SYSTEM_DOH_EXE_NAME = "xray-system-doh.exe";
const XRAY_SOURCE_EXE_NAME = "xray.exe";
const VERSION_FILE_NAME = "VERSION.txt";
const READY_TIMEOUT_MS = 12_000;
const READY_POLL_INTERVAL_MS = 250;
const QUERY_TIMEOUT_MS = 2_000;

interface ManagedState {
	pid: number | null;
	startedAt: string;
	localAddress: string;
	localPort: number;
	url: string;
}

interface RuntimeInfo {
	sourceDir: string;
	runtimePath: string;
	version: string | null;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function createExampleComQuery(): Buffer {
	const header = Buffer.from([
		0x12,
		0x34,
		0x01,
		0x00,
		0x00,
		0x01,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
		0x00,
	]);
	const labels = ["example", "com"];
	const parts: Buffer[] = [header];

	for (const label of labels) {
		const encoded = Buffer.from(label, "ascii");
		parts.push(Buffer.from([encoded.length]));
		parts.push(encoded);
	}

	parts.push(Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01]));
	return Buffer.concat(parts);
}

function hasDnsResponseFlag(buffer: Buffer): boolean {
	if (buffer.length < 12) {
		return false;
	}

	const flags = buffer.readUInt16BE(2);
	return (flags & 0x8000) === 0x8000;
}

async function queryDnsServer(
	address: string,
	port: number,
): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const socket = createSocket("udp4");
		const cleanup = (): void => {
			try {
				socket.close();
			} catch {
				// noop
			}
		};

		const timer = setTimeout(() => {
			cleanup();
			reject(new Error("DNS readiness probe timed out."));
		}, QUERY_TIMEOUT_MS);

		socket.once("error", (error) => {
			clearTimeout(timer);
			cleanup();
			reject(error);
		});

		socket.once("message", (message) => {
			clearTimeout(timer);
			cleanup();
			if (!hasDnsResponseFlag(message)) {
				reject(new Error("Local DNS service returned an invalid packet."));
				return;
			}

			resolve(true);
		});

		socket.send(createExampleComQuery(), port, address, (error) => {
			if (!error) {
				return;
			}

			clearTimeout(timer);
			cleanup();
			reject(error);
		});
	});
}

export function buildSystemDohXrayConfig(options: {
	url: string;
	localAddress: string;
	localPort?: number;
	logPath: string;
}): string {
	const localPort = options.localPort ?? SYSTEM_DOH_LOCAL_PORT;

	return `${JSON.stringify(
		{
			log: {
				loglevel: "info",
				error: options.logPath,
			},
			inbounds: [
				{
					tag: "dns-in",
					listen: options.localAddress,
					port: localPort,
					protocol: "dokodemo-door",
					settings: {
						address: "1.1.1.1",
						port: 53,
						network: "tcp,udp",
					},
				},
			],
			outbounds: [
				{ tag: "dns-out", protocol: "dns" },
				{ tag: "direct", protocol: "freedom" },
			],
			routing: {
				domainStrategy: "AsIs",
				rules: [
					{
						type: "field",
						inboundTag: ["dns-in"],
						outboundTag: "dns-out",
					},
				],
			},
			dns: {
				servers: [buildXrayLocalDohServerUrl(options.url)],
			},
		},
		null,
		2,
	)}\n`;
}

export class SystemDohManager {
	private readonly runtimeDir: string;
	private readonly workDir: string;
	private readonly configPath: string;
	private readonly logPath: string;
	private readonly statePath: string;
	private readonly versionPath: string;
	private lastError: string | null = null;

	public constructor(
		private readonly resourcesPath: string,
		private readonly appPath: string,
		private readonly userDataDir: string,
	) {
		this.runtimeDir = path.join(this.userDataDir, "runtime", "system-doh");
		this.workDir = path.join(this.userDataDir, "system-doh");
		this.configPath = path.join(this.workDir, "config.json");
		this.logPath = path.join(this.workDir, "runtime.log");
		this.statePath = path.join(this.workDir, "state.json");
		this.versionPath = path.join(this.runtimeDir, VERSION_FILE_NAME);
	}

	public async status(): Promise<SystemDohStatus> {
		const state = await this.readManagedState();
		const running = await this.isStateRunning(state);
		if (!running && state) {
			await this.clearManagedState();
		}

		const runtime = await this.getManagedRuntimeInfo();
		return {
			available: Boolean(runtime),
			running,
			pid: running ? state?.pid ?? null : null,
			startedAt: running ? state?.startedAt ?? null : null,
			runtimePath: runtime?.runtimePath ?? null,
			configPath: this.configPath,
			logPath: this.logPath,
			localAddress:
				normalizeSystemDohLocalAddress(state?.localAddress, "") || null,
			localPort: state?.localPort ?? null,
			currentUrl: state?.url ?? null,
			lastError: this.lastError,
		};
	}

	public async apply(
		url: string,
		preferredLocalAddress?: string | null,
	): Promise<SystemDohStatus> {
		const normalizedUrl = normalizeSystemDohUrl(url, "");
		if (!normalizedUrl) {
			throw new Error("Укажите DoH URL.");
		}

		const currentStatus = await this.status();
		if (
			currentStatus.running &&
			currentStatus.currentUrl === normalizedUrl &&
			currentStatus.localAddress
		) {
			return currentStatus;
		}

		if (currentStatus.running) {
			await this.stop();
		}

		const runtime = await this.ensureManagedRuntimeInstalled();
		const candidates = buildSystemDohLoopbackCandidates(preferredLocalAddress);
		let lastBindError: string | null = null;

		for (const candidate of candidates) {
			await this.prepareConfig(normalizedUrl, candidate);

			const child = spawn(runtime.runtimePath, ["run", "-c", this.configPath], {
				cwd: path.dirname(runtime.runtimePath),
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			child.unref();

			const nextState: ManagedState = {
				pid: child.pid ?? null,
				startedAt: new Date().toISOString(),
				localAddress: candidate,
				localPort: SYSTEM_DOH_LOCAL_PORT,
				url: normalizedUrl,
			};
			await this.writeManagedState(nextState);

			const isReady = await this.waitUntilReady(nextState);
			if (isReady) {
				this.lastError = null;
				return this.status();
			}

			const logTail = await this.readLogTail();
			if (await this.isStateRunning(nextState)) {
				await this.stop();
			} else {
				await this.clearManagedState();
			}

			const message =
				logTail ||
				`System DoH не ответил на ${candidate}:${SYSTEM_DOH_LOCAL_PORT}.`;
			this.lastError = message;

			if (
				/bind:|forbidden by its access permissions|Only one usage of each socket address/i.test(
					message,
				)
			) {
				lastBindError = message;
				continue;
			}

			throw new Error(message);
		}

		throw new Error(
			lastBindError ??
				"Не удалось найти свободный loopback-адрес для System DoH.",
		);
	}

	public async stop(): Promise<SystemDohStatus> {
		const state = await this.readManagedState();
		if (state?.pid && (await this.isPidRunning(state.pid))) {
			try {
				await execFileAsync(
					resolveWindowsExecutable("taskkill.exe"),
					["/PID", String(state.pid), "/T", "/F"],
					{
						windowsHide: true,
						timeout: 8_000,
					},
				);
			} catch (error) {
				this.lastError =
					error instanceof Error ? error.message : String(error);
			}
		}

		await this.clearManagedState();
		return this.status();
	}

	public async recover(options: {
		enabled?: boolean;
		url?: string | null;
		localAddress?: string | null;
	}): Promise<SystemDohStatus | null> {
		if (!options.enabled || !normalizeSystemDohUrl(options.url, "")) {
			return null;
		}

		try {
			return await this.apply(options.url ?? "", options.localAddress);
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : String(error);
			return this.status();
		}
	}

	private async ensureManagedRuntimeInstalled(): Promise<RuntimeInfo> {
		const sourceRuntime =
			(await this.getSourceRuntimeInfo()) ?? (await this.getManagedRuntimeInfo());
		if (!sourceRuntime) {
			throw new Error(
				"Bundled runtime Xray для System DoH не найден.",
			);
		}

		await fs.mkdir(this.runtimeDir, { recursive: true });
		const managedRuntimePath = path.join(this.runtimeDir, SYSTEM_DOH_EXE_NAME);
		const installedVersion = await readVersionFile(this.versionPath);
		const sourceVersion = sourceRuntime.version ?? "bundled";
		const shouldCopy =
			!(await this.pathExists(managedRuntimePath)) ||
			(sourceRuntime.sourceDir !== this.runtimeDir &&
				installedVersion !== sourceVersion);

		if (shouldCopy) {
			await fs.copyFile(sourceRuntime.runtimePath, managedRuntimePath);
			await fs.writeFile(this.versionPath, `${sourceVersion}\n`, "utf8");
		}

		return {
			sourceDir: this.runtimeDir,
			runtimePath: managedRuntimePath,
			version: sourceVersion,
		};
	}

	private async getSourceRuntimeInfo(): Promise<RuntimeInfo | null> {
		const candidates = [
			path.join(this.userDataDir, "runtime", "xray"),
			path.join(this.resourcesPath, "runtime", "xray"),
			path.join(this.appPath, "runtime", "xray"),
			path.join(process.cwd(), "runtime", "xray"),
		];

		for (const candidate of candidates) {
			const runtimePath = path.join(candidate, XRAY_SOURCE_EXE_NAME);
			if (await this.pathExists(runtimePath)) {
				return {
					sourceDir: candidate,
					runtimePath,
					version: await readVersionFile(
						path.join(candidate, VERSION_FILE_NAME),
					),
				};
			}
		}

		return null;
	}

	private async getManagedRuntimeInfo(): Promise<RuntimeInfo | null> {
		const runtimePath = path.join(this.runtimeDir, SYSTEM_DOH_EXE_NAME);
		if (!(await this.pathExists(runtimePath))) {
			return null;
		}

		return {
			sourceDir: this.runtimeDir,
			runtimePath,
			version: await readVersionFile(this.versionPath),
		};
	}

	private async prepareConfig(
		url: string,
		localAddress: string,
	): Promise<void> {
		await fs.mkdir(this.workDir, { recursive: true });
		await fs.writeFile(
			this.configPath,
			buildSystemDohXrayConfig({
				url,
				localAddress,
				localPort: SYSTEM_DOH_LOCAL_PORT,
				logPath: this.logPath,
			}),
			"utf8",
		);
	}

	private async waitUntilReady(state: ManagedState): Promise<boolean> {
		const startedAt = Date.now();
		while (Date.now() - startedAt < READY_TIMEOUT_MS) {
			if (state.pid && !(await this.isPidRunning(state.pid))) {
				return false;
			}

			try {
				await queryDnsServer(state.localAddress, state.localPort);
				return true;
			} catch {
				await delay(READY_POLL_INTERVAL_MS);
			}
		}

		return false;
	}

	private async readLogTail(): Promise<string | null> {
		try {
			const raw = await fs.readFile(this.logPath, "utf8");
			const lines = raw
				.split(/\r?\n/)
				.map((line) => line.trim())
				.filter(Boolean);

			if (lines.length === 0) {
				return null;
			}

			return lines.slice(-6).join(" | ");
		} catch {
			return null;
		}
	}

	private async readManagedState(): Promise<ManagedState | null> {
		try {
			const raw = JSON.parse(
				await fs.readFile(this.statePath, "utf8"),
			) as Partial<ManagedState>;
			return {
				pid: typeof raw.pid === "number" ? raw.pid : null,
				startedAt:
					typeof raw.startedAt === "string"
						? raw.startedAt
						: new Date().toISOString(),
				localAddress:
					normalizeSystemDohLocalAddress(raw.localAddress, "") ||
					SYSTEM_DOH_DEFAULT_LOCAL_ADDRESS,
				localPort:
					typeof raw.localPort === "number"
						? raw.localPort
						: SYSTEM_DOH_LOCAL_PORT,
				url: normalizeSystemDohUrl(raw.url, ""),
			};
		} catch {
			return null;
		}
	}

	private async writeManagedState(state: ManagedState): Promise<void> {
		await fs.mkdir(this.workDir, { recursive: true });
		await fs.writeFile(
			this.statePath,
			`${JSON.stringify(state, null, 2)}\n`,
			"utf8",
		);
	}

	private async clearManagedState(): Promise<void> {
		await fs.rm(this.statePath, { force: true });
	}

	private async isStateRunning(state: ManagedState | null): Promise<boolean> {
		if (!state?.pid) {
			return false;
		}

		return this.isPidRunning(state.pid);
	}

	private async isPidRunning(pid: number): Promise<boolean> {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	}

	private async pathExists(targetPath: string): Promise<boolean> {
		try {
			await fs.access(targetPath);
			return true;
		} catch {
			return false;
		}
	}
}
