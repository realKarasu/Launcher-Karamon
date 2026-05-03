$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

& (Join-Path $PSScriptRoot "compile.ps1")
& java -cp (Join-Path $Root "build\classes") fr.karamon.launcher.KaramonLauncher
