param(
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$runtimeDir = Join-Path $projectRoot "runtime\xray"
$runtimeExe = Join-Path $runtimeDir "xray.exe"
$versionFile = Join-Path $runtimeDir "VERSION.txt"
$tempDir = Join-Path $projectRoot "packaging\build\runtime-download"
$packageJsonPath = Join-Path $projectRoot "package.json"
$releaseVersion = if (Test-Path $packageJsonPath) { ((Get-Content $packageJsonPath -Raw) | ConvertFrom-Json).version } else { $null }
$buildUserAgent = "EgoistShield-Build/" + $(if ($releaseVersion) { $releaseVersion } else { "dev" })

function Get-LatestRelease {
  return Invoke-RestMethod -Uri "https://api.github.com/repos/XTLS/Xray-core/releases/latest" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "application/vnd.github+json"
  }
}

function Resolve-AssetUrl($release) {
  $asset = $release.assets | Where-Object { $_.name -match "windows-64.*\.zip$" } | Select-Object -First 1
  if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -match "windows.*amd64.*\.zip$" } | Select-Object -First 1
  }
  if (-not $asset) {
    throw "Не найден подходящий архив Xray для Windows x64."
  }
  return $asset.browser_download_url
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
New-Item -ItemType Directory -Force $tempDir | Out-Null

try {
  $release = Get-LatestRelease
  $tag = if ($release.tag_name) { [string]$release.tag_name } else { "latest" }
  $installedTag = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }

  if ((-not $Force) -and (Test-Path $runtimeExe) -and ($installedTag -eq $tag)) {
    Write-Host "[runtime] xray уже актуален ($tag)"
    exit 0
  }

  $assetUrl = Resolve-AssetUrl $release
  $zipPath = Join-Path $tempDir "xray.zip"
  $extractDir = Join-Path $tempDir "extract"

  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }

  Write-Host "[runtime] Загрузка Xray $tag"
  Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -UseBasicParsing

  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  $xrayBin = Get-ChildItem -Path $extractDir -Recurse -Filter "xray.exe" | Select-Object -First 1
  if (-not $xrayBin) {
    throw "В архиве Xray не найден xray.exe."
  }

  Copy-Item -Force $xrayBin.FullName $runtimeExe

  foreach ($dataFile in @("geoip.dat", "geosite.dat")) {
    $candidate = Get-ChildItem -Path $extractDir -Recurse -Filter $dataFile | Select-Object -First 1
    if ($candidate) {
      Copy-Item -Force $candidate.FullName (Join-Path $runtimeDir $dataFile)
    }
  }

  Set-Content -Path $versionFile -Value $tag -Encoding UTF8
  Write-Host "[runtime] xray готов: $runtimeExe ($tag)"
}
catch {
  if (Test-Path $runtimeExe) {
    Write-Warning "[runtime] Не удалось обновить Xray, используем локальный: $($_.Exception.Message)"
    exit 0
  }
  throw
}
