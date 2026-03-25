param(
  [switch]$SkipPackage = $false
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path "$PSScriptRoot\..\..").Path
$buildRoot = Join-Path $projectRoot "packaging\build"
$outputRoot = Join-Path $projectRoot "packaging\output"
$releaseRoot = Join-Path $projectRoot "..\..\artifacts\release-electron\single-exe"
$packageJsonPath = Join-Path $projectRoot "package.json"
$packageJson = Get-Content -Path $packageJsonPath -Raw | ConvertFrom-Json
$appVersion = [string]$packageJson.version

New-Item -ItemType Directory -Force $buildRoot | Out-Null
New-Item -ItemType Directory -Force $outputRoot | Out-Null
New-Item -ItemType Directory -Force $releaseRoot | Out-Null

Push-Location $projectRoot
try {
  if (-not $SkipPackage) {
    Write-Host "[single-exe] npm run package"
    npm run package
    if ($LASTEXITCODE -ne 0) {
      throw "npm run package failed"
    }
  }

  $packageDir = Join-Path $projectRoot "out\EgoistShield-win32-x64"
  if (!(Test-Path $packageDir)) {
    throw "Package folder not found: $packageDir"
  }

  $runtimeZip = Join-Path $buildRoot "egoistshield-runtime.zip"
  if (Test-Path $runtimeZip) {
    Remove-Item $runtimeZip -Force
  }
  Compress-Archive -Path (Join-Path $packageDir "*") -DestinationPath $runtimeZip -CompressionLevel Optimal

  Write-Host "[single-exe] dotnet publish launcher"
  $launcherProject = Join-Path $projectRoot "packaging\launcher\EgoistShieldLauncher.csproj"
  $launcherPublish = Join-Path $buildRoot "launcher-publish"
  dotnet publish $launcherProject -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o $launcherPublish
  if ($LASTEXITCODE -ne 0) {
    throw "dotnet publish launcher failed"
  }

  $launcherExe = Join-Path $launcherPublish "EgoistShieldLauncher.exe"
  if (!(Test-Path $launcherExe)) {
    throw "Launcher exe not found: $launcherExe"
  }

  $finalExe = Join-Path $outputRoot "EgoistShield_single.exe"
  & powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\append-zip.ps1" -LauncherExe $launcherExe -RuntimeZip $runtimeZip -OutExe $finalExe
  if ($LASTEXITCODE -ne 0) {
    throw "append-zip.ps1 failed"
  }

  Copy-Item -Force $finalExe (Join-Path $releaseRoot "EgoistShield_single.exe")
  Copy-Item -Force $runtimeZip (Join-Path $releaseRoot "egoistshield-runtime.zip")

  $readme = @"
EgoistShield single-file launcher

Файл:
- EgoistShield_single.exe

Как работает:
- Это один EXE без установки.
- При первом запуске EXE распакует runtime во внутренний кэш:
  %LOCALAPPDATA%\EgoistShield\runtime\$appVersion
- Затем запустит EgoistShield автоматически.

Важно:
- Не требует ручной установки.
- На Windows покажет UAC-подтверждение, т.к. приложение настроено на запуск с правами администратора.
"@
  Set-Content -Path (Join-Path $releaseRoot "README_SINGLE_EXE.txt") -Value $readme -Encoding UTF8

  Write-Host "[single-exe] Done: $finalExe"
}
finally {
  Pop-Location
}
