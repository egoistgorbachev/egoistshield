import { randomBytes, createCipheriv, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const RESERVED_FIRST_BYTES = new Set([0xef]);
const RESERVED_STARTS = new Set([
  Buffer.from([0x48, 0x45, 0x41, 0x44]), // HEAD
  Buffer.from([0x50, 0x4f, 0x53, 0x54]), // POST
  Buffer.from([0x47, 0x45, 0x54, 0x20]), // GET
  Buffer.from([0xee, 0xee, 0xee, 0xee]),
  Buffer.from([0xdd, 0xdd, 0xdd, 0xdd]),
  Buffer.from([0x16, 0x03, 0x01, 0x02])
].map((value) => value.toString("hex")));
const RESERVED_CONTINUE = Buffer.from([0x00, 0x00, 0x00, 0x00]).toString("hex");

const DEFAULT_MANAGED_RUNTIME_PATH = path.join(
  process.env.APPDATA ?? "",
  "EgoistShield",
  "runtime",
  "tg-ws-proxy",
  "egoistshield-tg-ws-proxy.exe"
);
const DEFAULT_RUNTIME_PATH = path.join(projectRoot, "runtime", "tg-ws-proxy", "egoistshield-tg-ws-proxy.bin");
const DEFAULT_CURRENT_CONFIG = path.join(process.env.APPDATA ?? "", "EgoistShield", "telegram-proxy", "config.json");
const DEFAULT_CURRENT_LOG = path.join(process.env.APPDATA ?? "", "EgoistShield", "telegram-proxy", "proxy.log");
const DEFAULT_CFPROXY_DOMAIN = "virkgj.co.uk";
const DEFAULT_SECRET = "0123456789abcdef0123456789abcdef";
const PROTO_TAG_ABRIDGED = Buffer.from([0xef, 0xef, 0xef, 0xef]);

const PROBE_PLAN = [
  { dcId: 1, isMedia: false, repeat: 2 },
  { dcId: 203, isMedia: false, repeat: 2 },
  { dcId: 5, isMedia: false, repeat: 1 },
  { dcId: 2, isMedia: false, repeat: 1 },
  { dcId: 2, isMedia: true, repeat: 1 },
  { dcId: 4, isMedia: false, repeat: 1 },
  { dcId: 4, isMedia: true, repeat: 1 }
];

const CONFIG_CANDIDATES = [
  {
    name: "current_2-4_220_buf512_pool4",
    dcIp: ["2:149.154.167.220", "4:149.154.167.220"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "upstream_4_only_220_buf512_pool4",
    dcIp: ["4:149.154.167.220"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "hybrid_observed_1_2_4_5_203_buf512_pool4",
    dcIp: [
      "1:149.154.175.50",
      "2:149.154.167.220",
      "4:149.154.167.220",
      "5:149.154.171.5",
      "203:91.105.192.100"
    ],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "direct_observed_1_2_4_5_203_buf512_pool4",
    dcIp: [
      "1:149.154.175.50",
      "2:149.154.167.51",
      "4:149.154.167.91",
      "5:149.154.171.5",
      "203:91.105.192.100"
    ],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "hybrid_core_1_2_4_203_buf512_pool4",
    dcIp: ["1:149.154.175.50", "2:149.154.167.220", "4:149.154.167.220", "203:91.105.192.100"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "direct_core_1_2_4_203_buf512_pool4",
    dcIp: ["1:149.154.175.50", "2:149.154.167.51", "4:149.154.167.91", "203:91.105.192.100"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "hybrid_core_1_2_4_203_buf256_pool2",
    dcIp: ["1:149.154.175.50", "2:149.154.167.220", "4:149.154.167.220", "203:91.105.192.100"],
    bufKb: 256,
    poolSize: 2,
    cfproxy: true
  },
  {
    name: "hybrid_core_1_2_4_203_buf256_pool8",
    dcIp: ["1:149.154.175.50", "2:149.154.167.220", "4:149.154.167.220", "203:91.105.192.100"],
    bufKb: 256,
    poolSize: 8,
    cfproxy: true
  },
  {
    name: "hybrid_core_1_2_4_203_buf1024_pool4",
    dcIp: ["1:149.154.175.50", "2:149.154.167.220", "4:149.154.167.220", "203:91.105.192.100"],
    bufKb: 1024,
    poolSize: 4,
    cfproxy: true
  },
  {
    name: "hybrid_core_1_2_4_203_no_cfproxy",
    dcIp: ["1:149.154.175.50", "2:149.154.167.220", "4:149.154.167.220", "203:91.105.192.100"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: false
  },
  {
    name: "upstream_4_only_220_cfproxy_domain",
    dcIp: ["4:149.154.167.220"],
    bufKb: 512,
    poolSize: 4,
    cfproxy: true,
    cfproxyDomain: DEFAULT_CFPROXY_DOMAIN
  }
];

function parseArgs(argv) {
  const parsed = {
    runtimePath: DEFAULT_MANAGED_RUNTIME_PATH,
    currentConfigPath: DEFAULT_CURRENT_CONFIG,
    currentLogPath: DEFAULT_CURRENT_LOG,
    outputDir: path.join(projectRoot, "artifacts", "telegram-proxy-lab", createTimestampSlug()),
    host: "127.0.0.1",
    portBase: 19080,
    secret: DEFAULT_SECRET,
    lingerMs: 1400,
    settleMs: 2200
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--runtime" && next) {
      parsed.runtimePath = next;
      index += 1;
      continue;
    }
    if (arg === "--current-config" && next) {
      parsed.currentConfigPath = next;
      index += 1;
      continue;
    }
    if (arg === "--current-log" && next) {
      parsed.currentLogPath = next;
      index += 1;
      continue;
    }
    if (arg === "--out-dir" && next) {
      parsed.outputDir = next;
      index += 1;
      continue;
    }
    if (arg === "--host" && next) {
      parsed.host = next;
      index += 1;
      continue;
    }
    if (arg === "--port-base" && next) {
      parsed.portBase = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--secret" && next) {
      parsed.secret = next.trim().toLowerCase();
      index += 1;
      continue;
    }
    if (arg === "--linger-ms" && next) {
      parsed.lingerMs = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
    if (arg === "--settle-ms" && next) {
      parsed.settleMs = Number.parseInt(next, 10);
      index += 1;
      continue;
    }
  }

  parsed.runtimePath = path.resolve(parsed.runtimePath);
  parsed.currentConfigPath = path.resolve(parsed.currentConfigPath);
  parsed.currentLogPath = path.resolve(parsed.currentLogPath);
  parsed.outputDir = path.resolve(projectRoot, parsed.outputDir);

  return parsed;
}

function createTimestampSlug() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return stamp;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashSha256(buffer) {
  return createHash("sha256").update(buffer).digest();
}

function signedLittleEndian16(value) {
  const result = Buffer.alloc(2);
  result.writeInt16LE(value, 0);
  return result;
}

function normalizeDcKey(dcId, isMedia) {
  return `${dcId}${isMedia ? "m" : ""}`;
}

function extractDcKey(line) {
  const mediaMatch = line.match(/DC(\d+)\smedia\b/);
  if (mediaMatch) {
    return `${mediaMatch[1]}m`;
  }

  const compactMediaMatch = line.match(/DC(\d+)m\b/);
  if (compactMediaMatch) {
    return `${compactMediaMatch[1]}m`;
  }

  const plainMatch = line.match(/DC(\d+)\b/);
  if (plainMatch) {
    return plainMatch[1];
  }

  return null;
}

function isReservedHandshakePrefix(buffer) {
  if (RESERVED_FIRST_BYTES.has(buffer[0])) {
    return true;
  }
  if (RESERVED_STARTS.has(buffer.subarray(0, 4).toString("hex"))) {
    return true;
  }
  return buffer.subarray(4, 8).toString("hex") === RESERVED_CONTINUE;
}

function xorBuffers(left, right) {
  const result = Buffer.alloc(left.length);
  for (let index = 0; index < left.length; index += 1) {
    result[index] = left[index] ^ right[index];
  }
  return result;
}

function generateClientHandshake(secretHex, dcId, isMedia) {
  const secretBytes = Buffer.from(secretHex, "hex");
  const dcIndex = isMedia ? -dcId : dcId;

  let rndBytes = null;
  while (!rndBytes || isReservedHandshakePrefix(rndBytes)) {
    rndBytes = randomBytes(64);
  }

  const decPrekeyAndIv = rndBytes.subarray(8, 56);
  const decPrekey = decPrekeyAndIv.subarray(0, 32);
  const decIv = decPrekeyAndIv.subarray(32, 48);
  const decKey = hashSha256(Buffer.concat([decPrekey, secretBytes]));

  const encryptor = createCipheriv("aes-256-ctr", decKey, decIv);
  const encryptedFull = Buffer.concat([encryptor.update(rndBytes), encryptor.final()]);
  const keystreamTail = xorBuffers(encryptedFull.subarray(56, 64), rndBytes.subarray(56, 64));
  const tailPlain = Buffer.concat([PROTO_TAG_ABRIDGED, signedLittleEndian16(dcIndex), randomBytes(2)]);
  const encryptedTail = xorBuffers(tailPlain, keystreamTail);

  const result = Buffer.from(rndBytes);
  encryptedTail.copy(result, 56);
  return result;
}

async function readJsonIfExists(targetPath) {
  try {
    return JSON.parse(await fs.readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function readTextIfExists(targetPath) {
  try {
    return await fs.readFile(targetPath, "utf8");
  } catch {
    return "";
  }
}

async function waitForPort(host, port, timeoutMs) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const ready = await new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => {
        socket.destroy();
        resolve(false);
      });
    });

    if (ready) {
      return true;
    }

    await delay(150);
  }

  return false;
}

async function sendSyntheticProbe({ host, port, secret, dcId, isMedia, lingerMs }) {
  const handshake = generateClientHandshake(secret, dcId, isMedia);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.once("connect", () => {
      socket.write(handshake, (error) => {
        if (error) {
          finish({ ok: false, error: error.message });
          return;
        }

        setTimeout(() => {
          socket.end();
          finish({ ok: true });
        }, lingerMs);
      });
    });

    socket.once("error", (error) => {
      finish({ ok: false, error: error.message });
    });
  });
}

async function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      });
      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Ignore already-exited processes.
  }
}

function buildRuntimeArgs({ host, port, secret, bufKb, poolSize, logPath, logMaxMb, dcIp, cfproxy, cfproxyDomain }) {
  const args = [
    "--host",
    host,
    "--port",
    String(port),
    "--secret",
    secret,
    "--buf-kb",
    String(bufKb),
    "--pool-size",
    String(poolSize),
    "--log-file",
    logPath,
    "--log-max-mb",
    String(logMaxMb),
    "--verbose"
  ];

  for (const entry of dcIp) {
    args.push("--dc-ip", entry);
  }

  if (cfproxy === false) {
    args.push("--no-cfproxy");
  }

  if (cfproxyDomain) {
    args.push("--cfproxy-domain", cfproxyDomain);
  }

  return args;
}

function parseHistoricalLogSummary(logText) {
  const counts = new Map();
  const lines = logText.split(/\r?\n/);

  for (const line of lines) {
    const key = extractDcKey(line);
    if (!key) {
      continue;
    }

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([dcKey, count]) => ({ dcKey, count }))
    .sort((left, right) => right.count - left.count);
}

function ensureRunMetrics(metrics, dcKey) {
  if (!metrics.dc.has(dcKey)) {
    metrics.dc.set(dcKey, {
      dcKey,
      lines: 0,
      poolHits: 0,
      wsAttempts: 0,
      wsSuccess: 0,
      wsErrors: 0,
      cfAttempts: 0,
      cfErrors: 0,
      tcpAttempts: 0,
      tcpErrors: 0,
      missingConfig: 0,
      fallbackClosed: 0,
      noFallback: 0
    });
  }

  return metrics.dc.get(dcKey);
}

function analyzeRunLog(logText, probePlan) {
  const metrics = {
    dc: new Map(),
    totals: {
      poolHits: 0,
      wsAttempts: 0,
      wsSuccess: 0,
      wsErrors: 0,
      cfAttempts: 0,
      cfErrors: 0,
      tcpAttempts: 0,
      tcpErrors: 0,
      missingConfig: 0,
      fallbackClosed: 0,
      noFallback: 0
    }
  };
  const labelMap = new Map();

  for (const line of logText.split(/\r?\n/)) {
    const labelMatch = line.match(/\[([^\]]+)\]/);
    const label = labelMatch?.[1] ?? null;
    const explicitDcKey = extractDcKey(line);
    if (label && explicitDcKey) {
      labelMap.set(label, explicitDcKey);
    }
    const dcKey = explicitDcKey ?? (label ? labelMap.get(label) ?? null : null);
    if (!dcKey) {
      continue;
    }

    const current = ensureRunMetrics(metrics, dcKey);
    current.lines += 1;

    if (line.includes("pool hit via")) {
      current.poolHits += 1;
      current.wsAttempts += 1;
      metrics.totals.poolHits += 1;
      metrics.totals.wsAttempts += 1;
    }

    if (line.includes("-> wss://")) {
      current.wsAttempts += 1;
      metrics.totals.wsAttempts += 1;
    }

    if (line.includes("WS session closed")) {
      current.wsSuccess += 1;
      metrics.totals.wsSuccess += 1;
    }

    if (line.includes("WS connect failed") || line.includes("WS handshake") || line.includes("blacklisted")) {
      current.wsErrors += 1;
      metrics.totals.wsErrors += 1;
    }

    if (line.includes("-> trying CF proxy")) {
      current.cfAttempts += 1;
      metrics.totals.cfAttempts += 1;
    }

    if (line.includes("CF proxy failed")) {
      current.cfErrors += 1;
      metrics.totals.cfErrors += 1;
    }

    if (line.includes("-> TCP fallback to")) {
      current.tcpAttempts += 1;
      metrics.totals.tcpAttempts += 1;
    }

    if (line.includes("TCP fallback to") && line.includes("failed")) {
      current.tcpErrors += 1;
      metrics.totals.tcpErrors += 1;
    }

    if (line.includes("not in config")) {
      current.missingConfig += 1;
      metrics.totals.missingConfig += 1;
    }

    if (line.includes("fallback closed")) {
      current.fallbackClosed += 1;
      metrics.totals.fallbackClosed += 1;
    }

    if (line.includes("no fallback available")) {
      current.noFallback += 1;
      metrics.totals.noFallback += 1;
    }

    if (
      line.includes("WS session closed") ||
      line.includes("fallback closed") ||
      (line.includes("TCP fallback to") && line.includes("failed")) ||
      line.includes("no fallback available")
    ) {
      if (label) {
        labelMap.delete(label);
      }
    }
  }

  const expectedKeys = new Set();
  for (const probe of probePlan) {
    expectedKeys.add(normalizeDcKey(probe.dcId, probe.isMedia));
  }

  const successfulKeys = [...expectedKeys].filter((dcKey) => {
    const entry = metrics.dc.get(dcKey);
    if (!entry) {
      return false;
    }
    return entry.wsSuccess > 0 || entry.fallbackClosed > 0;
  });

  const failedKeys = [...expectedKeys].filter((dcKey) => {
    const entry = metrics.dc.get(dcKey);
    if (!entry) {
      return true;
    }
    return entry.wsSuccess === 0 && entry.fallbackClosed === 0;
  });

  const score =
    successfulKeys.length * 20 +
    metrics.totals.wsSuccess * 3 +
    metrics.totals.fallbackClosed * 4 +
    metrics.totals.poolHits -
    metrics.totals.noFallback * 25 -
    metrics.totals.tcpErrors * 8 -
    metrics.totals.wsErrors * 5 -
    metrics.totals.missingConfig * 3;

  return {
    expectedKeys: [...expectedKeys],
    successfulKeys,
    failedKeys,
    score,
    totals: metrics.totals,
    byDc: [...metrics.dc.values()].sort((left, right) => left.dcKey.localeCompare(right.dcKey))
  };
}

async function runConfiguration(config, options, index) {
  const port = options.portBase + index;
  const runDir = path.join(options.outputDir, config.name);
  const logPath = path.join(runDir, "proxy.log");
  const metaPath = path.join(runDir, "meta.json");
  await fs.mkdir(runDir, { recursive: true });

  const runtimeArgs = buildRuntimeArgs({
    host: options.host,
    port,
    secret: options.secret,
    bufKb: config.bufKb,
    poolSize: config.poolSize,
    logPath,
    logMaxMb: 8,
    dcIp: config.dcIp,
    cfproxy: config.cfproxy,
    cfproxyDomain: config.cfproxyDomain
  });

  const startedAt = new Date().toISOString();
  const processHandle = spawn(options.runtimePath, runtimeArgs, {
    cwd: path.dirname(options.runtimePath),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let stdoutBuffer = "";
  let stderrBuffer = "";
  processHandle.stdout?.on("data", (chunk) => {
    stdoutBuffer += chunk.toString();
    if (stdoutBuffer.length > 8000) {
      stdoutBuffer = stdoutBuffer.slice(-8000);
    }
  });
  processHandle.stderr?.on("data", (chunk) => {
    stderrBuffer += chunk.toString();
    if (stderrBuffer.length > 8000) {
      stderrBuffer = stderrBuffer.slice(-8000);
    }
  });

  const processExited = new Promise((resolve) => {
    processHandle.once("exit", (code, signal) => resolve({ code, signal }));
    processHandle.once("error", (error) => resolve({ code: null, signal: error.message }));
  });

  try {
    const ready = await waitForPort(options.host, port, 12_000);
    if (!ready) {
      const exitInfo = await Promise.race([processExited, delay(250)]);
      const summary = {
        ...config,
        port,
        ok: false,
        reason: "port_not_ready",
        exitInfo: exitInfo ?? null,
        stdout: stdoutBuffer || null,
        stderr: stderrBuffer || null
      };
      await fs.writeFile(metaPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return summary;
    }

    await delay(900);

    const probeResults = [];
    for (const probe of PROBE_PLAN) {
      for (let repeat = 0; repeat < probe.repeat; repeat += 1) {
        const result = await sendSyntheticProbe({
          host: options.host,
          port,
          secret: options.secret,
          dcId: probe.dcId,
          isMedia: probe.isMedia,
          lingerMs: options.lingerMs
        });
        probeResults.push({
          dcId: probe.dcId,
          isMedia: probe.isMedia,
          repeat: repeat + 1,
          ...result
        });
        await delay(240);
      }
    }

    await delay(options.settleMs);

    const logText = await readTextIfExists(logPath);
    const analysis = analyzeRunLog(logText, PROBE_PLAN);
    const summary = {
      ...config,
      port,
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      probes: probeResults,
      analysis
    };

    await fs.writeFile(metaPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    return summary;
  } finally {
    await killProcessTree(processHandle.pid);
  }
}

function classifyParameterImpact() {
  return {
    networkCritical: [
      "dcIp: determines which Telegram DCs use direct WS instead of fallback.",
      "cfproxy / cfproxyDomain: matters only when direct WS or plain TCP fallback is blocked.",
      "poolSize: affects concurrency and responsiveness under bursty Telegram load."
    ],
    mostlyOperational: [
      "host: changes where the local MTProto port is reachable. It does not improve bypass quality by itself.",
      "port: only matters for conflicts with another local process or manual client setup.",
      "secret: must stay valid 32-hex; it is auth, not acceleration.",
      "logMaxMb: only retention, not network behavior."
    ],
    tuning: [
      "bufKb: affects socket buffering and may help heavy transfers, but it is secondary to correct DC coverage.",
      "verbose: useful for diagnosis only."
    ]
  };
}

function formatMarkdownReport({ runtimePath, currentConfig, historicalSummary, results }) {
  const best = results[0] ?? null;
  const lines = [];
  lines.push("# Telegram Proxy Lab");
  lines.push("");
  lines.push(`- Runtime: \`${runtimePath}\``);
  lines.push(`- Current config path: \`${currentConfig.path}\``);
  lines.push(`- Current config: \`${JSON.stringify(currentConfig.value)}\``);
  lines.push("");
  lines.push("## Historical signal from the live EgoistShield log");
  lines.push("");
  lines.push("| DC key | Count |");
  lines.push("| --- | ---: |");
  for (const item of historicalSummary.slice(0, 10)) {
    lines.push(`| \`${item.dcKey}\` | ${item.count} |`);
  }
  lines.push("");
  lines.push("## Ranked matrix");
  lines.push("");
  lines.push("| Rank | Config | Score | Success keys | Failed keys | WS success | TCP errors | Missing config |");
  lines.push("| ---: | --- | ---: | --- | --- | ---: | ---: | ---: |");
  results.forEach((result, index) => {
    if (!result.ok) {
      lines.push(`| ${index + 1} | \`${result.name}\` | n/a | — | — | 0 | 0 | 0 |`);
      return;
    }
    lines.push(
      `| ${index + 1} | \`${result.name}\` | ${result.analysis.score} | \`${result.analysis.successfulKeys.join(", ") || "-"}\` | \`${result.analysis.failedKeys.join(", ") || "-"}\` | ${result.analysis.totals.wsSuccess} | ${result.analysis.totals.tcpErrors} | ${result.analysis.totals.missingConfig} |`
    );
  });
  lines.push("");

  if (best?.ok) {
    lines.push("## Best candidate");
    lines.push("");
    lines.push(`- Name: \`${best.name}\``);
    lines.push(`- DC->IP: \`${best.dcIp.join(", ")}\``);
    lines.push(`- bufKb=${best.bufKb}, poolSize=${best.poolSize}, cfproxy=${best.cfproxy === false ? "off" : "on"}`);
    lines.push(`- Success keys: \`${best.analysis.successfulKeys.join(", ") || "-"}\``);
    lines.push(`- Failed keys: \`${best.analysis.failedKeys.join(", ") || "-"}\``);
    lines.push("");
  }

  const impact = classifyParameterImpact();
  lines.push("## Parameter impact");
  lines.push("");
  lines.push("### Network-critical");
  for (const item of impact.networkCritical) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("### Mostly operational");
  for (const item of impact.mostlyOperational) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  lines.push("### Tuning");
  for (const item of impact.tuning) {
    lines.push(`- ${item}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await fs.mkdir(options.outputDir, { recursive: true });

  const runtimeExists = await fs
    .access(options.runtimePath)
    .then(() => true)
    .catch(() => false);

  if (!runtimeExists) {
    throw new Error(`Runtime not found: ${options.runtimePath}`);
  }

  if (!/^[a-f0-9]{32}$/i.test(options.secret)) {
    throw new Error("Secret must be exactly 32 hex chars for the synthetic probes.");
  }

  const currentConfigValue = await readJsonIfExists(options.currentConfigPath);
  const currentLogText = await readTextIfExists(options.currentLogPath);
  const historicalSummary = parseHistoricalLogSummary(currentLogText);

  const rawResults = [];
  for (let index = 0; index < CONFIG_CANDIDATES.length; index += 1) {
    const config = CONFIG_CANDIDATES[index];
    process.stdout.write(`[*] ${config.name}\n`);
    const result = await runConfiguration(config, options, index + 1);
    rawResults.push(result);
  }

  const rankedResults = [...rawResults].sort((left, right) => {
    if (!left.ok && !right.ok) {
      return left.name.localeCompare(right.name);
    }
    if (!left.ok) {
      return 1;
    }
    if (!right.ok) {
      return -1;
    }
    return right.analysis.score - left.analysis.score;
  });

  const report = {
    generatedAt: new Date().toISOString(),
    runtimePath: options.runtimePath,
    outputDir: options.outputDir,
    currentConfig: {
      path: options.currentConfigPath,
      value: currentConfigValue
    },
    currentLog: {
      path: options.currentLogPath,
      historicalSummary
    },
    probePlan: PROBE_PLAN,
    results: rankedResults
  };

  await fs.writeFile(path.join(options.outputDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(
    path.join(options.outputDir, "report.md"),
    formatMarkdownReport({
      runtimePath: options.runtimePath,
      currentConfig: report.currentConfig,
      historicalSummary,
      results: rankedResults
    }),
    "utf8"
  );

  process.stdout.write(`\n[+] Report written to ${options.outputDir}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
