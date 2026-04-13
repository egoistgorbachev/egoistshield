[CmdletBinding()]
param(
  [string]$ExePath = "",
  [int]$TimeoutSec = 25
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path
$defaultExePath = Join-Path $repoRoot "out\\dist\\win-unpacked\\EgoistShield.exe"
$resolvedExePath = if ([string]::IsNullOrWhiteSpace($ExePath)) { $defaultExePath } else { $ExePath }

if (-not (Test-Path -LiteralPath $resolvedExePath)) {
  throw "Packaged exe not found: $resolvedExePath"
}

if (-not $env:APPDATA) {
  throw "APPDATA is not available in the current environment."
}

$userDataDir = Join-Path $env:APPDATA "EgoistShield"
$logsDir = Join-Path $userDataDir "logs"
$mainLogPath = Join-Path $logsDir "main.log"
$initialLogLength = if (Test-Path -LiteralPath $mainLogPath) { (Get-Item -LiteralPath $mainLogPath).Length } else { 0 }

Write-Host ""
Write-Host "== EgoistShield packaged smoke =="
Write-Host "Exe:      $resolvedExePath"
Write-Host "UserData: $userDataDir"
Write-Host "Main log: $mainLogPath"
Write-Host ""

$existingProcess = Get-Process -Name "EgoistShield" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingProcess) {
  Write-Warning "EgoistShield is already running (PID $($existingProcess.Id)). Close it before packaged smoke for clean results."
  exit 1
}

$process = Start-Process -FilePath $resolvedExePath -PassThru
Write-Host "Launched PID $($process.Id). Waiting for production boot marker..."

$deadline = (Get-Date).AddSeconds($TimeoutSec)
$bootConfirmed = $false

while ((Get-Date) -lt $deadline) {
  $process.Refresh()
  if ($process.HasExited) {
    throw "Packaged exe exited early with code $($process.ExitCode)."
  }

  if (Test-Path -LiteralPath $mainLogPath) {
    $logSnapshot = Get-Content -LiteralPath $mainLogPath -Raw -ErrorAction SilentlyContinue
    if ($logSnapshot -match "\\[paths\\] Runtime=production") {
      $bootConfirmed = $true
      break
    }
  }

  Start-Sleep -Milliseconds 500
}

if ($bootConfirmed) {
  Write-Host "Production boot marker detected."
} else {
  Write-Warning "Boot marker was not detected within $TimeoutSec seconds. Continue only if the UI is clearly visible."
}

Write-Host ""
Write-Host "Manual smoke checklist:"
Write-Host "1. Dashboard: confirm the disconnected readiness block is visible and the shell feels immediate."
Write-Host "2. DNS Center: apply System DoH with https://1.1.1.1/dns-query and then reset it back."
Write-Host "3. Zapret: open the center and confirm the core version is shown without remote-method errors."
Write-Host "4. Telegram Proxy: open the screen and make sure its main actions render without layout breakage."
Write-Host "5. Exit the app normally after checks, then return to this console."
Write-Host ""

[void](Read-Host "Press Enter after the packaged smoke is finished")

$isStillRunning = $false
try {
  $process.Refresh()
  $isStillRunning = -not $process.HasExited
} catch {
  $isStillRunning = $false
}

if ($isStillRunning) {
  Write-Warning "EgoistShield is still running (PID $($process.Id)). Close it manually if this was not intentional."
} else {
  Write-Host "EgoistShield process has exited."
}

if (Test-Path -LiteralPath $mainLogPath) {
  $finalLogLength = (Get-Item -LiteralPath $mainLogPath).Length
  $logDelta = [Math]::Max(0, $finalLogLength - $initialLogLength)
  Write-Host ""
  Write-Host "Recent main.log tail:"
  Get-Content -LiteralPath $mainLogPath -Tail 40
  Write-Host ""
  Write-Host "Log delta during smoke: $logDelta bytes"
} else {
  Write-Warning "main.log was not found after smoke."
}
