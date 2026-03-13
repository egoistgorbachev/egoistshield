$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$packagingDir = Split-Path -Parent $PSScriptRoot
$projectDir = Split-Path -Parent $packagingDir
$assetsDir = Join-Path $packagingDir "installer\assets"
$iconSource = Join-Path $projectDir "renderer\public\assets\icon.ico"

New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

function New-GradientBitmap {
  param(
    [int]$Width,
    [int]$Height,
    [string]$FilePath,
    [string]$Title,
    [string]$Subtitle,
    [bool]$Compact
  )

  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

  try {
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Width, $Height)
    $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $rect,
      [System.Drawing.ColorTranslator]::FromHtml("#040608"),
      [System.Drawing.ColorTranslator]::FromHtml("#0E1117"),
      [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )
    $graphics.FillRectangle($bg, $rect)
    $bg.Dispose()

    $glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(55, 255, 106, 30))
    $graphics.FillEllipse($glowBrush, -40, -40, [int]($Width * 0.9), [int]($Height * 0.85))
    $graphics.FillEllipse($glowBrush, [int]($Width * 0.58), [int]($Height * 0.52), [int]($Width * 0.45), [int]($Height * 0.45))
    $glowBrush.Dispose()

    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(110, 255, 126, 40), 2)
    $graphics.DrawLine($linePen, 0, [int]($Height * 0.18), $Width, [int]($Height * 0.18))
    $linePen.Dispose()

    $accentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 112, 31))
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 244, 247))
    $subtitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(169, 183, 208))

    if ($Compact) {
      $fontTitle = New-Object System.Drawing.Font("Segoe UI Semibold", 13, [System.Drawing.FontStyle]::Bold)
      $fontSub = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
      $graphics.DrawString($Title, $fontTitle, $titleBrush, 14, 13)
      $graphics.DrawString($Subtitle, $fontSub, $subtitleBrush, 14, 32)
    }
    else {
      $fontTitle = New-Object System.Drawing.Font("Segoe UI Semibold", 18, [System.Drawing.FontStyle]::Bold)
      $fontSub = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
      $fontBadge = New-Object System.Drawing.Font("Segoe UI Semibold", 8.8, [System.Drawing.FontStyle]::Bold)
      $graphics.DrawString($Title, $fontTitle, $titleBrush, 16, 20)
      $graphics.DrawString($Subtitle, $fontSub, $subtitleBrush, 16, 52)
      $graphics.DrawString("GRAPHITE LAVA", $fontBadge, $accentBrush, 16, [int]($Height - 30))
      $fontBadge.Dispose()
    }

    $fontTitle.Dispose()
    $fontSub.Dispose()
    $accentBrush.Dispose()
    $titleBrush.Dispose()
    $subtitleBrush.Dispose()

    $bitmap.Save($FilePath, [System.Drawing.Imaging.ImageFormat]::Bmp)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

New-GradientBitmap -Width 164 -Height 314 -FilePath (Join-Path $assetsDir "installerSidebar.bmp") -Title "EgoistShield" -Subtitle "Secure Client Setup" -Compact $false
New-GradientBitmap -Width 164 -Height 314 -FilePath (Join-Path $assetsDir "uninstallerSidebar.bmp") -Title "EgoistShield" -Subtitle "Clean Uninstall" -Compact $false
New-GradientBitmap -Width 150 -Height 57 -FilePath (Join-Path $assetsDir "installerHeader.bmp") -Title "EgoistShield" -Subtitle "Setup" -Compact $true

if (Test-Path $iconSource) {
  Copy-Item -Path $iconSource -Destination (Join-Path $assetsDir "installerHeaderIcon.ico") -Force
}

Write-Host "Installer assets generated in $assetsDir"
