$ErrorActionPreference = "Stop"

$distRoot = Join-Path $PSScriptRoot "..\..\out\dist"
$unpackedPath = Join-Path $distRoot "win-unpacked"

if (Test-Path -LiteralPath $unpackedPath) {
  Remove-Item -LiteralPath $unpackedPath -Recurse -Force
}
