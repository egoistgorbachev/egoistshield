import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type ParsedDnsServers, parseDnsServers, splitDnsServersByFamily } from "../../shared/system-dns";
import { resolveWindowsExecutable } from "./windows-system-binaries";

const execFileAsync = promisify(execFile);
const WINDOWS_SCRIPT_TIMEOUT_MS = 20_000;
const CONNECTED_INTERFACE_FILTER =
  "$_.ConnectionState -eq 'Connected' -and $_.InterfaceAlias -notmatch 'Loopback|isatap|Teredo|Pseudo|Npcap|Bluetooth'";

export interface SystemDnsResult {
  ok: boolean;
  message: string;
  servers: string[];
  mocked?: boolean;
}

interface WindowsDnsScriptOptions {
  reset: boolean;
  servers: ParsedDnsServers;
}

function toPowerShellArray(values: string[]): string {
  if (values.length === 0) {
    return "@()";
  }

  return `@(${values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")})`;
}

function toPowerShellBoolean(value: boolean): string {
  return value ? "$true" : "$false";
}

export function createWindowsDnsScript(options: WindowsDnsScriptOptions): string {
  const { reset, servers } = options;

  return `
$ErrorActionPreference = 'Stop'
$dnsServers = ${toPowerShellArray(servers.servers)}
$ipv4Servers = ${toPowerShellArray(servers.ipv4Servers)}
$ipv6Servers = ${toPowerShellArray(servers.ipv6Servers)}
$resetMode = ${toPowerShellBoolean(reset)}
$routeInterfaceIndexes = @(
  Get-NetRoute -DestinationPrefix '0.0.0.0/0' -State Alive -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InterfaceIndex
  Get-NetRoute -DestinationPrefix '::/0' -State Alive -ErrorAction SilentlyContinue | Select-Object -ExpandProperty InterfaceIndex
) | Sort-Object -Unique
$connectedInterfaces =
  if ($routeInterfaceIndexes.Count -gt 0) {
    Get-NetIPInterface | Where-Object {
      $_.InterfaceIndex -in $routeInterfaceIndexes -and ${CONNECTED_INTERFACE_FILTER}
    } | Group-Object InterfaceIndex | ForEach-Object { $_.Group | Sort-Object InterfaceMetric | Select-Object -First 1 }
  } else {
    Get-NetIPInterface | Where-Object { ${CONNECTED_INTERFACE_FILTER} } |
      Group-Object InterfaceIndex | ForEach-Object { $_.Group | Sort-Object InterfaceMetric | Select-Object -First 1 }
  }
if (-not $connectedInterfaces) { throw 'Не найден ни один активный сетевой интерфейс Windows с маршрутом по умолчанию.' }
$appliedCount = 0
$errors = New-Object System.Collections.Generic.List[string]
function Apply-NetshDnsList {
  param(
    [string]$Family,
    [int]$InterfaceIndex,
    [string[]]$Addresses,
    [bool]$ResetToDhcp
  )
  if ($Family -eq 'ipv4') {
    if ($ResetToDhcp) {
      & netsh interface ipv4 set dnsservers name=$InterfaceIndex source=dhcp validate=no | Out-Null
      return
    }
    if ($Addresses.Count -eq 0) { return }
    & netsh interface ipv4 set dnsservers name=$InterfaceIndex source=static address=$Addresses[0] validate=no | Out-Null
    for ($i = 1; $i -lt $Addresses.Count; $i++) {
      & netsh interface ipv4 add dnsservers name=$InterfaceIndex address=$Addresses[$i] index=($i + 1) validate=no | Out-Null
    }
    return
  }
  if ($ResetToDhcp) {
    & netsh interface ipv6 set dnsservers name=$InterfaceIndex source=dhcp validate=no | Out-Null
    return
  }
  if ($Addresses.Count -eq 0) { return }
  & netsh interface ipv6 set dnsservers name=$InterfaceIndex source=static address=$Addresses[0] validate=no | Out-Null
  for ($i = 1; $i -lt $Addresses.Count; $i++) {
    & netsh interface ipv6 add dnsservers name=$InterfaceIndex address=$Addresses[$i] index=($i + 1) validate=no | Out-Null
  }
}
function Test-DnsAddressesApplied {
  param(
    [object[]]$Configs,
    [string[]]$Expected,
    [string]$Family
  )
  if ($Expected.Count -eq 0) { return $true }
  foreach ($config in $Configs) {
    $matchesFamily =
      ($Family -eq 'IPv4' -and ($config.AddressFamily -eq 2 -or $config.AddressFamily -eq 'IPv4')) -or
      ($Family -eq 'IPv6' -and ($config.AddressFamily -eq 23 -or $config.AddressFamily -eq 'IPv6'))
    if (-not $matchesFamily) { continue }
    $configured = @($config.ServerAddresses)
    $allFound = $true
    foreach ($expectedServer in $Expected) {
      if ($configured -notcontains $expectedServer) {
        $allFound = $false
        break
      }
    }
    if ($allFound) { return $true }
  }
  return $false
}
foreach ($iface in $connectedInterfaces) {
  $ifaceIndex = [int]$iface.InterfaceIndex
  try {
    if ($resetMode) {
      Set-DnsClientServerAddress -InterfaceIndex $ifaceIndex -ResetServerAddresses -ErrorAction Stop | Out-Null
    } else {
      Set-DnsClientServerAddress -InterfaceIndex $ifaceIndex -ServerAddresses $dnsServers -ErrorAction Stop | Out-Null
    }
    $appliedCount++
    continue
  } catch {
    try {
      Apply-NetshDnsList -Family 'ipv4' -InterfaceIndex $ifaceIndex -Addresses $ipv4Servers -ResetToDhcp:$resetMode
      Apply-NetshDnsList -Family 'ipv6' -InterfaceIndex $ifaceIndex -Addresses $ipv6Servers -ResetToDhcp:$resetMode
      $appliedCount++
      continue
    } catch {
      $errors.Add(("Интерфейс #{0}: {1}" -f $ifaceIndex, $_.Exception.Message))
    }
  }
}
if ($appliedCount -eq 0) {
  $details = if ($errors.Count -gt 0) { ' ' + ($errors -join ' | ') } else { '' }
  throw ('Не удалось применить DNS ни к одному сетевому интерфейсу.' + $details)
}
$verifyIndices = @($connectedInterfaces | Select-Object -ExpandProperty InterfaceIndex)
$verifyConfigs = @(Get-DnsClientServerAddress -InterfaceIndex $verifyIndices -ErrorAction SilentlyContinue)
if (-not $resetMode) {
  if (-not (Test-DnsAddressesApplied -Configs $verifyConfigs -Expected $ipv4Servers -Family 'IPv4')) {
    throw 'Windows не подтвердил применение IPv4 DNS.'
  }
  if (-not (Test-DnsAddressesApplied -Configs $verifyConfigs -Expected $ipv6Servers -Family 'IPv6')) {
    throw 'Windows не подтвердил применение IPv6 DNS.'
  }
}
`.trim();
}

async function flushDnsCache(): Promise<void> {
  await execFileAsync(resolveWindowsExecutable("ipconfig"), ["/flushdns"], {
    windowsHide: true,
    timeout: 5000
  });
}

async function runWindowsPowerShell(script: string): Promise<void> {
  await execFileAsync(
    resolveWindowsExecutable("powershell.exe"),
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    {
      windowsHide: true,
      timeout: WINDOWS_SCRIPT_TIMEOUT_MS
    }
  );
}

async function applyWindowsDnsScript(options: WindowsDnsScriptOptions): Promise<void> {
  await runWindowsPowerShell(createWindowsDnsScript(options));
  await flushDnsCache();
}

export { parseDnsServers };

export async function setSystemDnsServers(rawInput: string, mock = false): Promise<SystemDnsResult> {
  const servers = parseDnsServers(rawInput);

  if (mock || process.platform !== "win32") {
    return {
      ok: true,
      message: `DNS обновлён: ${servers.join(", ")}`,
      servers,
      mocked: true
    };
  }

  await applyWindowsDnsScript({
    reset: false,
    servers: splitDnsServersByFamily(servers)
  });

  return {
    ok: true,
    message: `DNS обновлён: ${servers.join(", ")}`,
    servers
  };
}

export async function resetSystemDnsServers(mock = false): Promise<SystemDnsResult> {
  if (mock || process.platform !== "win32") {
    return {
      ok: true,
      message: "Системный DNS возвращён к настройкам по умолчанию.",
      servers: [],
      mocked: true
    };
  }

  await applyWindowsDnsScript({
    reset: true,
    servers: splitDnsServersByFamily([])
  });

  return {
    ok: true,
    message: "Системный DNS возвращён к настройкам по умолчанию.",
    servers: []
  };
}
