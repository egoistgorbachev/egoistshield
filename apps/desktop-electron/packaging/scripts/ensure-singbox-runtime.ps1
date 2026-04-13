param(
  [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$runtimeDir = Join-Path $projectRoot "runtime\sing-box"
$runtimeExe = Join-Path $runtimeDir "sing-box.exe"
$versionFile = Join-Path $runtimeDir "VERSION.txt"
$tempDir = Join-Path $projectRoot "packaging\build\runtime-download-singbox"
$packageJsonPath = Join-Path $projectRoot "package.json"
$releaseVersion = if (Test-Path $packageJsonPath) { ((Get-Content $packageJsonPath -Raw) | ConvertFrom-Json).version } else { $null }
$buildUserAgent = "EgoistShield-Build/" + $(if ($releaseVersion) { $releaseVersion } else { "dev" })

function Get-ErrorSummary($errorRecord) {
  $messages = New-Object System.Collections.Generic.List[string]
  $current = $errorRecord.Exception

  while ($current) {
    if (-not [string]::IsNullOrWhiteSpace($current.Message)) {
      [void]$messages.Add($current.Message.Trim())
    }
    $current = $current.InnerException
  }

  return (($messages | Select-Object -Unique) -join " | ")
}

function Get-RemoteFailureHint($errorRecord) {
  $summary = Get-ErrorSummary $errorRecord
  if ($summary -match '403|forbidden|rate limit') {
    return "GitHub временно отклонил запрос (HTTP 403 / rate limit)."
  }

  return "Проверка или скачивание свежего runtime завершились ошибкой."
}

function Get-LatestRelease {
  return Invoke-RestMethod -Uri "https://api.github.com/repos/SagerNet/sing-box/releases/latest" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "application/vnd.github+json"
  }
}

function Resolve-AssetUrl($release) {
  $asset = $release.assets | Where-Object { $_.name -match "windows-amd64\.zip$" -and $_.name -notmatch "legacy-windows-7" } | Select-Object -First 1
  if (-not $asset) {
    $asset = $release.assets | Where-Object { $_.name -match "windows-amd64.*\.zip$" } | Select-Object -First 1
  }
  if (-not $asset) {
    throw "Не найден подходящий архив sing-box для Windows x64."
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
    Write-Host "[runtime] sing-box уже актуален ($tag)"
    exit 0
  }

  $assetUrl = Resolve-AssetUrl $release
  $zipPath = Join-Path $tempDir "singbox.zip"
  $extractDir = Join-Path $tempDir "extract"

  if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
  if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }

  Write-Host "[runtime] Загрузка sing-box $tag"
  Invoke-WebRequest -Uri $assetUrl -OutFile $zipPath -UseBasicParsing

  Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

  $bin = Get-ChildItem -Path $extractDir -Recurse -Filter "sing-box.exe" | Select-Object -First 1
  if (-not $bin) {
    throw "В архиве sing-box не найден sing-box.exe."
  }

  Copy-Item -Force $bin.FullName $runtimeExe
  Set-Content -Path $versionFile -Value $tag -Encoding UTF8
  Write-Host "[runtime] sing-box готов: $runtimeExe ($tag)"
}
catch {
  if (Test-Path $runtimeExe) {
    $reason = Get-ErrorSummary $_
    $hint = Get-RemoteFailureHint $_
    Write-Warning "[runtime] sing-box: $hint Оставляем локальный runtime $runtimeExe. Причина: $reason"
    exit 0
  }
  throw
}
