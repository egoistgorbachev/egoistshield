param(
  [Parameter(Mandatory = $true)][string]$LauncherExe,
  [Parameter(Mandatory = $true)][string]$RuntimeZip,
  [Parameter(Mandatory = $true)][string]$OutExe
)

$ErrorActionPreference = "Stop"

$marker = [System.Text.Encoding]::ASCII.GetBytes("EGOISTSHIELD_EMBEDDED_ZIP_V1")
$launcherBytes = [System.IO.File]::ReadAllBytes($LauncherExe)
$zipBytes = [System.IO.File]::ReadAllBytes($RuntimeZip)
$sizeBytes = [System.BitConverter]::GetBytes([Int64]$zipBytes.Length)

$outDir = Split-Path -Parent $OutExe
if (!(Test-Path $outDir)) {
  New-Item -ItemType Directory -Force $outDir | Out-Null
}

$stream = [System.IO.File]::Open($OutExe, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
try {
  $stream.Write($launcherBytes, 0, $launcherBytes.Length)
  $stream.Write($zipBytes, 0, $zipBytes.Length)
  $stream.Write($sizeBytes, 0, $sizeBytes.Length)
  $stream.Write($marker, 0, $marker.Length)
}
finally {
  $stream.Dispose()
}

Write-Host "[append-zip] Created $OutExe"
