param(
  [switch]$Force = $false,
  [string]$LocalExePath = $env:TG_WS_PROXY_EXE_PATH
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$runtimeDir = Join-Path $projectRoot "runtime\tg-ws-proxy"
$runtimeExe = Join-Path $runtimeDir "TgWsProxy_windows_7_64bit.exe"
$versionFile = Join-Path $runtimeDir "VERSION.txt"
$tempDir = Join-Path $projectRoot "packaging\build\runtime-download-tg-ws-proxy"
$sourceDir = Join-Path $tempDir "source"
$venvDir = Join-Path $tempDir ".venv"
$specPath = Join-Path $tempDir "codex-headless.spec"
$builtExe = Join-Path $sourceDir "dist\TgWsProxy_windows_7_64bit.exe"
$packageJsonPath = Join-Path $projectRoot "package.json"
$releaseVersion = if (Test-Path $packageJsonPath) { ((Get-Content $packageJsonPath -Raw) | ConvertFrom-Json).version } else { $null }
$buildUserAgent = "EgoistShield-Build/" + $(if ($releaseVersion) { $releaseVersion } else { "dev" })

function Get-LatestTag {
  try {
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/Flowseal/tg-ws-proxy/releases/latest" -Headers @{
      "User-Agent" = $buildUserAgent
      "Accept" = "application/vnd.github+json"
    }
    if ($release.tag_name) {
      return [string]$release.tag_name
    }
  }
  catch {
    Write-Warning "[runtime] GitHub API недоступен для TG WS Proxy, пробую releases/latest page: $($_.Exception.Message)"
  }

  $response = Invoke-WebRequest -Uri "https://github.com/Flowseal/tg-ws-proxy/releases/latest" -Headers @{
    "User-Agent" = $buildUserAgent
    "Accept" = "text/html"
  } -MaximumRedirection 5 -UseBasicParsing

  $finalUrl = [string]$response.BaseResponse.ResponseUri.AbsoluteUri
  if ($finalUrl -match "/releases/tag/([^/?#]+)$") {
    return [uri]::UnescapeDataString($Matches[1])
  }

  throw "Не удалось определить latest tag TG WS Proxy."
}

function Write-HeadlessSpec([string]$repoRoot, [string]$specFilePath) {
  $spec = @'
# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_submodules

hiddenimports = [
    'cryptography.hazmat.primitives.ciphers',
    'cryptography.hazmat.primitives.ciphers.algorithms',
    'cryptography.hazmat.primitives.ciphers.modes',
    'cryptography.hazmat.backends.openssl',
] + collect_submodules('cryptography')

block_cipher = None
root = os.path.dirname(SPEC)
repo_root = os.path.join(root, 'source')
icon_path = os.path.join(repo_root, 'icon.ico')

a = Analysis(
    [os.path.join(repo_root, 'proxy', 'tg_ws_proxy.py')],
    pathex=[repo_root],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['customtkinter', 'pystray', 'PIL.ImageTk', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='TgWsProxy_windows_7_64bit',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path if os.path.exists(icon_path) else None,
)
'@

  Set-Content -Path $specFilePath -Value $spec -Encoding UTF8
}

New-Item -ItemType Directory -Force $runtimeDir | Out-Null
New-Item -ItemType Directory -Force $tempDir | Out-Null

try {
  $tag = Get-LatestTag
  $installedTag = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { "" }

  if ((-not $Force) -and (Test-Path $runtimeExe) -and ($installedTag -eq $tag)) {
    Write-Host "[runtime] tg-ws-proxy headless уже актуален ($tag)"
    exit 0
  }

  if (Test-Path $sourceDir) { Remove-Item $sourceDir -Recurse -Force }
  if (Test-Path $venvDir) { Remove-Item $venvDir -Recurse -Force }
  if (Test-Path $specPath) { Remove-Item $specPath -Force }

  if (Test-Path $LocalExePath) {
    Write-Host "[runtime] Использую локальный headless TG WS Proxy: $LocalExePath"
    Copy-Item -Force $LocalExePath $runtimeExe
    Set-Content -Path $versionFile -Value $tag -Encoding UTF8
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

  Write-HeadlessSpec -repoRoot $sourceDir -specFilePath $specPath

  Write-Host "[runtime] Собираю headless TG WS Proxy"
  Push-Location $tempDir
  try {
    & $pyInstallerExe --clean --noconfirm $specPath
  }
  finally {
    Pop-Location
  }

  if (-not (Test-Path $builtExe)) {
    throw "Не удалось собрать headless TG WS Proxy."
  }

  Copy-Item -Force $builtExe $runtimeExe
  Set-Content -Path $versionFile -Value $tag -Encoding UTF8
  Write-Host "[runtime] tg-ws-proxy headless готов: $runtimeExe ($tag)"
}
catch {
  if (Test-Path $runtimeExe) {
    Write-Warning "[runtime] Не удалось обновить tg-ws-proxy headless, используем локальный runtime: $($_.Exception.Message)"
    exit 0
  }
  throw
}
