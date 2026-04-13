param(
  [switch]$Force = $false,
  [string]$LocalExePath = $env:TG_WS_PROXY_EXE_PATH
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$runtimeDir = Join-Path $projectRoot "runtime\tg-ws-proxy"
$runtimeAsset = Join-Path $runtimeDir "egoistshield-tg-ws-proxy.bin"
$legacyRuntimeExe = Join-Path $runtimeDir "TgWsProxy_windows_7_64bit.exe"
$managedRuntimeExe = Join-Path $runtimeDir "egoistshield-tg-ws-proxy.exe"
$versionFile = Join-Path $runtimeDir "VERSION.txt"
$flavorFile = Join-Path $runtimeDir "RUNTIME_FLAVOR.txt"
$tempDir = Join-Path $projectRoot "packaging\build\runtime-download-tg-ws-proxy"
$sourceDir = Join-Path $tempDir "source"
$venvDir = Join-Path $tempDir ".venv"
$entryDir = Join-Path $tempDir "build\entrypoints"
$headlessEntry = Join-Path $entryDir "headless_entry.py"
$builtExe = Join-Path $tempDir "dist\TgWsProxy_windows_7_64bit.exe"
$packageJsonPath = Join-Path $projectRoot "package.json"
$releaseVersion = if (Test-Path $packageJsonPath) { ((Get-Content $packageJsonPath -Raw) | ConvertFrom-Json).version } else { $null }
$buildUserAgent = "EgoistShield-Build/" + $(if ($releaseVersion) { $releaseVersion } else { "dev" })
$desiredFlavor = "headless-windowless"

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

  return "Проверка релиза или сборка свежего TG WS Proxy завершились ошибкой."
}

function Convert-TagToVersion([string]$tagName) {
  if ([string]::IsNullOrWhiteSpace($tagName)) {
    return $null
  }

  $normalized = $tagName.Trim() -replace '^[vV]', ''
  try {
    return [version]$normalized
  }
  catch {
    return $null
  }
}

function Select-LatestTag([string[]]$tagNames) {
  $validTags = @($tagNames | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
  if ($validTags.Count -eq 0) {
    return $null
  }

  $sorted = $validTags | Sort-Object `
    @{ Expression = { Convert-TagToVersion $_ }; Descending = $true }, `
    @{ Expression = { $_ }; Descending = $true }

  return [string]($sorted | Select-Object -First 1)
}

function Get-LatestTagFromTagsApi {
  $tags = Invoke-RestMethod -Uri "https://api.github.com/repos/Flowseal/tg-ws-proxy/tags?per_page=20" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "application/vnd.github+json"
  }

  $tagNames = @($tags | ForEach-Object { [string]$_.name })
  $latestTag = Select-LatestTag $tagNames
  if ($latestTag) {
    return $latestTag
  }

  throw "GitHub tags API не вернул подходящих тегов TG WS Proxy."
}

function Get-LatestTagFromGit {
  $gitOutput = & git ls-remote --tags --refs https://github.com/Flowseal/tg-ws-proxy.git 2>$null
  if (-not $gitOutput) {
    throw "git ls-remote не вернул список тегов."
  }

  $tagNames = @(
    $gitOutput |
      ForEach-Object {
        if ($_ -match 'refs/tags/([^/\s]+)$') {
          return [string]$Matches[1]
        }
        return $null
      } |
      Where-Object { $_ }
  )

  $latestTag = Select-LatestTag $tagNames
  if ($latestTag) {
    return $latestTag
  }

  throw "Не удалось выбрать последний тег TG WS Proxy из git ls-remote."
}

function Get-LatestTagFromReleasePage {
  $response = Invoke-WebRequest -Uri "https://github.com/Flowseal/tg-ws-proxy/releases/latest" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "text/html"
  } -MaximumRedirection 5 -UseBasicParsing

  $finalUrl = [string]$response.BaseResponse.ResponseUri.AbsoluteUri
  if ($finalUrl -match "/releases/tag/([^/?#]+)$") {
    return [uri]::UnescapeDataString($Matches[1])
  }

  throw "Не удалось определить latest tag TG WS Proxy через releases/latest page."
}

function Get-LatestTag {
  try {
    return Get-LatestTagFromTagsApi
  }
  catch {
    Write-Warning "[runtime] GitHub tags API недоступен для TG WS Proxy, пробую git ls-remote: $($_.Exception.Message)"
  }

  try {
    return Get-LatestTagFromGit
  }
  catch {
    Write-Warning "[runtime] git ls-remote не смог определить latest tag TG WS Proxy, пробую releases/latest page: $($_.Exception.Message)"
  }

  return Get-LatestTagFromReleasePage
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
New-Item -ItemType Directory -Force $tempDir | Out-Null
New-Item -ItemType Directory -Force $entryDir | Out-Null

try {
  $tag = Get-LatestTag
  $installedTag = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }
  $installedFlavor = if (Test-Path $flavorFile) { (Get-Content $flavorFile -Raw).Trim() } else { "" }

  if ((-not $Force) -and (Test-Path $runtimeAsset) -and ($installedTag -eq $tag) -and ($installedFlavor -eq $desiredFlavor)) {
    if (-not (Test-Path $flavorFile)) {
      Set-Content -Path $flavorFile -Value $desiredFlavor -Encoding UTF8
    }
    Write-Host "[runtime] tg-ws-proxy hidden headless уже актуален ($tag)"
    exit 0
  }

  if (Test-Path $sourceDir) { Remove-Item $sourceDir -Recurse -Force }
  if (Test-Path $venvDir) { Remove-Item $venvDir -Recurse -Force }
  if (Test-Path $headlessEntry) { Remove-Item $headlessEntry -Force }

  if (Test-UsablePath $LocalExePath) {
    Write-Host "[runtime] Использую локальный headless TG WS Proxy: $LocalExePath"
    Copy-Item -Force $LocalExePath $runtimeAsset
    if (Test-Path $legacyRuntimeExe) { Remove-Item $legacyRuntimeExe -Force }
    if (Test-Path $managedRuntimeExe) { Remove-Item $managedRuntimeExe -Force }
    Set-Content -Path $versionFile -Value $tag -Encoding UTF8
    Set-Content -Path $flavorFile -Value $desiredFlavor -Encoding UTF8
    exit 0
  }

  Write-Host "[runtime] Клонирую tg-ws-proxy $tag"
  git clone --depth 1 --branch $tag https://github.com/Flowseal/tg-ws-proxy.git $sourceDir | Out-Host

  Write-Host "[runtime] Создаю build-venv"
  python -m venv $venvDir

  $pythonExe = Join-Path $venvDir "Scripts\python.exe"
  $pyInstallerExe = Join-Path $venvDir "Scripts\pyinstaller.exe"

  & $pythonExe -m pip install --upgrade pip setuptools wheel pyinstaller
  Push-Location $sourceDir
  try {
    & $pythonExe -m pip install .
  }
  finally {
    Pop-Location
  }

  $headlessWrapper = @'
from proxy.tg_ws_proxy import main

if __name__ == "__main__":
    main()
'@
  Set-Content -Path $headlessEntry -Value $headlessWrapper -Encoding UTF8

  Write-Host "[runtime] Собираю headless TG WS Proxy"
  Push-Location $tempDir
  try {
    & $pyInstallerExe `
      --clean `
      --noconfirm `
      --onefile `
      --noconsole `
      --name "TgWsProxy_windows_7_64bit" `
      --distpath (Join-Path $tempDir "dist") `
      --workpath (Join-Path $tempDir "build\pyinstaller") `
      --specpath (Join-Path $tempDir "build\spec") `
      --paths $sourceDir `
      --collect-submodules proxy `
      --collect-submodules cryptography `
      --hidden-import cryptography.hazmat.backends.openssl `
      $headlessEntry
  }
  finally {
    Pop-Location
  }

  if (-not (Test-Path $builtExe)) {
    throw "Не удалось собрать headless TG WS Proxy."
  }

  Copy-Item -Force $builtExe $runtimeAsset
  if (Test-Path $legacyRuntimeExe) { Remove-Item $legacyRuntimeExe -Force }
  if (Test-Path $managedRuntimeExe) { Remove-Item $managedRuntimeExe -Force }
  Set-Content -Path $versionFile -Value $tag -Encoding UTF8
  Set-Content -Path $flavorFile -Value $desiredFlavor -Encoding UTF8
  Write-Host "[runtime] tg-ws-proxy hidden headless готов: $runtimeAsset ($tag)"
}
catch {
  $fallbackRuntime = @($runtimeAsset, $legacyRuntimeExe, $managedRuntimeExe) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($fallbackRuntime) {
    if ($fallbackRuntime -ne $runtimeAsset) {
      Copy-Item -Force $fallbackRuntime $runtimeAsset
    }
    if (Test-Path $legacyRuntimeExe) { Remove-Item $legacyRuntimeExe -Force }
    if (Test-Path $managedRuntimeExe) { Remove-Item $managedRuntimeExe -Force }
    $reason = Get-ErrorSummary $_
    $hint = Get-RemoteFailureHint $_
    Write-Warning "[runtime] tg-ws-proxy: $hint Оставляем локальный runtime $runtimeAsset. Причина: $reason"
    exit 0
  }
  throw
}
