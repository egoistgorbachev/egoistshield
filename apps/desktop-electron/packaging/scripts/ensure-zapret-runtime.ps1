param(
  [switch]$Force = $false,
  [string]$LocalExePath = $env:ZAPRET_GUI_EXE_PATH
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$runtimeDir = Join-Path $projectRoot "runtime\zapret"
$runtimeExe = Join-Path $runtimeDir "ZapretGUI.exe"
$runtimeCoreDir = Join-Path $runtimeDir "core"
$runtimeFlagsDir = Join-Path $runtimeDir "flags"
$versionFile = Join-Path $runtimeDir "VERSION.txt"
$tempDir = Join-Path $projectRoot "packaging\build\runtime-download-zapret"
$packageJsonPath = Join-Path $projectRoot "package.json"
$releaseVersion = if (Test-Path $packageJsonPath) { ((Get-Content $packageJsonPath -Raw) | ConvertFrom-Json).version } else { $null }
$buildUserAgent = "EgoistShield-Build/" + $(if ($releaseVersion) { $releaseVersion } else { "dev" })

function Test-UsablePath([string]$targetPath) {
  if ([string]::IsNullOrWhiteSpace($targetPath)) {
    return $false
  }

  return Test-Path -LiteralPath $targetPath
}

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

  return "Проверка релиза или скачивание Zapret runtime завершились ошибкой."
}

if ([string]::IsNullOrWhiteSpace($LocalExePath)) {
  $candidate = Join-Path $env:USERPROFILE "Downloads\AyuGram Desktop\ZapretGUI.exe"
  if (Test-Path -LiteralPath $candidate) {
    $LocalExePath = $candidate
  }
}

function Get-LatestRelease {
  return Invoke-RestMethod -Uri "https://api.github.com/repos/medvedeff-true/Zapret-GUI/releases/latest" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "application/vnd.github+json"
  }
}

function Resolve-SourceArchiveUrl([string]$tag) {
  return "https://codeload.github.com/medvedeff-true/Zapret-GUI/zip/refs/tags/$tag"
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
New-Item -ItemType Directory -Force $tempDir | Out-Null

try {
  $release = Get-LatestRelease
  $tag = if ($release.tag_name) { [string]$release.tag_name } else { "main" }
  $installedTag = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }

  if (
    (-not $Force) -and
    (Test-Path $runtimeExe) -and
    (Test-Path $runtimeCoreDir) -and
    (Test-Path $runtimeFlagsDir) -and
    ($installedTag -eq $tag)
  ) {
    Write-Host "[runtime] zapret уже актуален ($tag)"
    exit 0
  }

  $exeUrl = $release.assets | Where-Object { $_.name -eq "ZapretGUI.exe" } | Select-Object -First 1 -ExpandProperty browser_download_url
  if (-not $exeUrl -and -not (Test-UsablePath $LocalExePath)) {
    throw "Не удалось определить URL релизного ZapretGUI.exe и не найден локальный fallback."
  }

  $sourceZip = Join-Path $tempDir "zapret-source.zip"
  $sourceExtractDir = Join-Path $tempDir "source-extract"
  $exeDownloadPath = Join-Path $tempDir "ZapretGUI.exe"

  if (Test-Path $sourceZip) { Remove-Item $sourceZip -Force }
  if (Test-Path $sourceExtractDir) { Remove-Item $sourceExtractDir -Recurse -Force }
  if (Test-Path $exeDownloadPath) { Remove-Item $exeDownloadPath -Force }

  $sourceArchiveUrl = Resolve-SourceArchiveUrl $tag
  Write-Host "[runtime] Загрузка исходников Zapret GUI $tag"
  Invoke-WebRequest -Uri $sourceArchiveUrl -OutFile $sourceZip -UseBasicParsing
  Expand-Archive -Path $sourceZip -DestinationPath $sourceExtractDir -Force

  $sourceRoot = Get-ChildItem -Path $sourceExtractDir -Directory | Select-Object -First 1
  if (-not $sourceRoot) {
    throw "Не удалось распаковать исходники Zapret GUI."
  }

  if (Test-UsablePath $LocalExePath) {
    Write-Host "[runtime] Использую локальный ZapretGUI.exe: $LocalExePath"
    Copy-Item -Force $LocalExePath $exeDownloadPath
  }
  else {
    Write-Host "[runtime] Загрузка релизного ZapretGUI.exe $tag"
    Invoke-WebRequest -Uri $exeUrl -OutFile $exeDownloadPath -UseBasicParsing
  }

  if (Test-Path $runtimeCoreDir) { Remove-Item $runtimeCoreDir -Recurse -Force }
  if (Test-Path $runtimeFlagsDir) { Remove-Item $runtimeFlagsDir -Recurse -Force }

  Copy-Item -Path (Join-Path $sourceRoot.FullName "core") -Destination $runtimeCoreDir -Recurse -Force
  Copy-Item -Path (Join-Path $sourceRoot.FullName "flags") -Destination $runtimeFlagsDir -Recurse -Force
  Copy-Item -Force $exeDownloadPath $runtimeExe
  Set-Content -Path $versionFile -Value $tag -Encoding UTF8

  Write-Host "[runtime] zapret готов: $runtimeDir ($tag)"
}
catch {
  if ((Test-Path $runtimeExe) -and (Test-Path $runtimeCoreDir) -and (Test-Path $runtimeFlagsDir)) {
    $reason = Get-ErrorSummary $_
    $hint = Get-RemoteFailureHint $_
    Write-Warning "[runtime] zapret: $hint Оставляем локальный runtime $runtimeDir. Причина: $reason"
    exit 0
  }
  throw
}
